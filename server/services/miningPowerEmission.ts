/** R3 emission reservation service.
 * No write to Balance, Transaction, reward ledger, Staking, mining payouts or R2 activations.
 * Reservation is NOT issuance, distribution, or a user claim.
 */
import { Prisma, prisma } from "../db/client";
import { firstRewardBoundaryStrictlyAfter, formatFixed18, parseFixed18 } from "../domain/mining-power/calculations.ts";
import {
  assertDayClosed,
  dailyEmissionCeiling,
  effectiveMpForDay,
  EMISSION_CALCULATION_VERSION,
  isEmptyEmissionDay,
  parseUtcDate,
  requirePoolCap,
  reserveDailyEmissionAmount,
} from "../domain/mining-power/emission.ts";

const db = prisma as any;
const DecimalCtor = (Prisma as any).Decimal as new (value: any) => any;
const PAGE_SIZE = 500;
const GLOBAL_R3_TOKEN_CAP = parseFixed18("150000000");

export class MiningEmissionError extends Error {
  constructor(public code: string, public httpStatus: number, message: string) { super(message); }
}
function reject(code: string, message: string, status = 409): never {
  throw new MiningEmissionError(code, status, message);
}
function decimal(value: unknown): string { return (value as any)?.toString?.() ?? String(value); }

function assertProtocolIntegrity(protocol: any, program: any): void {
  if (!protocol || protocol.id !== program.protocolConfigId || protocol.status !== "active") {
    reject("PROTOCOL_NOT_ACTIVE", "R1 protocol is not active; emissions remain disabled", 503);
  }
  if (protocol.emissionPaused) reject("EMISSION_PAUSED", "R1 emission pause is enabled", 503);
  if (protocol.rewardTimezone !== "UTC" || protocol.rewardBoundaryHourUtc !== 0) {
    reject("INVALID_TIME_POLICY", "UTC midnight emission policy does not match R1");
  }
  if (!protocol.fullEmissionBaseMpThreshold) {
    reject("THRESHOLD_NOT_FINALIZED", "R1 network utilization threshold is not finalized", 503);
  }
  const programPool = requirePoolCap(decimal(program.rewardPoolTokens));
  const protocolPool = parseFixed18(decimal(protocol.rewardPoolTokenAmount));
  const capSupply = protocol.maxSupplySnapshot ? parseFixed18(decimal(protocol.maxSupplySnapshot)) : 0n;
  const allocation = protocol.miningAllocationPercentSnapshot
    ? parseFixed18(decimal(protocol.miningAllocationPercentSnapshot)) : 0n;
  const allocationCeiling = capSupply * allocation / parseFixed18("100");
  if (allocation <= 0n || allocation > parseFixed18("15") || allocationCeiling <= 0n ||
      programPool !== protocolPool || programPool > allocationCeiling || programPool > GLOBAL_R3_TOKEN_CAP) {
    reject("TOKENOMICS_NOT_FINALIZED", "Protocol mining pool snapshot does not reconcile with R3", 503);
  }
  if (parseFixed18(decimal(program.fullEmissionBaseMpThreshold)) !==
      parseFixed18(decimal(protocol.fullEmissionBaseMpThreshold))) {
    reject("THRESHOLD_SNAPSHOT_MISMATCH", "R3 threshold differs from R1 active protocol", 503);
  }
  if (program.termMonths !== 84 || program.calculationVersion !== EMISSION_CALCULATION_VERSION) {
    reject("PROGRAM_VERSION_MISMATCH", "R3 emission program configuration is invalid");
  }
}

function serializeDay(day: any) {
  return {
    id: day.id,
    programId: day.programId,
    dayUtc: day.dayUtc,
    epochNumber: day.epochNumber,
    theoreticalCeiling: decimal(day.theoreticalCeiling),
    qualifiedBaseMp: decimal(day.qualifiedBaseMp),
    qualifiedEffectiveMp: decimal(day.qualifiedEffectiveMp),
    qualifiedActivationCount: day.qualifiedActivationCount,
    utilizationRatio: decimal(day.utilizationRatio),
    reservedEmission: decimal(day.reservedEmission),
    status: day.status,
    calculationVersion: day.calculationVersion,
    reservedAt: day.reservedAt,
  };
}

export async function readMiningEmissionAdminStatus() {
  const programs = await db.miningEmissionProgram.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { protocolConfig: { select: { version: true, status: true, emissionPaused: true, fullEmissionBaseMpThreshold: true } } },
  });
  const total = await db.miningEmissionDay.aggregate({ _sum: { reservedEmission: true }, _count: { _all: true } });
  return {
    enabledByDefault: false,
    issuedOrPaidByR3: "0",
    reservedEmissionAcrossPrograms: decimal(total._sum.reservedEmission ?? "0"),
    reservedDays: total._count._all,
    globalProvisionalCap: "150000000",
    programs: programs.map((p: any) => ({
      id: p.id, protocolVersion: p.protocolConfig.version,
      protocolStatus: p.protocolConfig.status, protocolEmissionPaused: p.protocolConfig.emissionPaused,
      genesisAt: p.genesisAt, status: p.status, termMonths: p.termMonths,
      rewardPoolTokens: decimal(p.rewardPoolTokens),
      fullEmissionBaseMpThreshold: decimal(p.fullEmissionBaseMpThreshold),
      protocolFullEmissionBaseMpThreshold: p.protocolConfig.fullEmissionBaseMpThreshold
        ? decimal(p.protocolConfig.fullEmissionBaseMpThreshold) : null,
    })),
  };
}

export async function listMiningEmissionDays(limit = 30) {
  const safeLimit = Number.isInteger(limit) ? Math.min(100, Math.max(1, limit)) : 30;
  const items = await db.miningEmissionDay.findMany({
    orderBy: { dayUtc: "desc" }, take: safeLimit,
  });
  return items.map(serializeDay);
}

export async function reserveCompletedMiningEmissionDay(input: {
  day: string;
  now?: Date;
}): Promise<{ day: ReturnType<typeof serializeDay>; idempotentReplay: boolean }> {
  const rewardDay = parseUtcDate(input.day);
  // Time supplied only by integration test; no HTTP mutations expose this function.
  const now = input.now ?? new Date();
  assertDayClosed(rewardDay, now);
  if (process.env.MINING_POWER_R3_ENABLE_RESERVATIONS !== "1") {
    reject("R3_RESERVATIONS_DISABLED", "R3 requires explicit operator opt-in", 503);
  }

  // All R3 writes, including distinct days and different programs, are serialized.
  // In case of any failure, snapshots and the day reservation roll back atomically.
  const once = () => db.$transaction(async (tx: any) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(731104, 20261105)::text AS acquired`;

    const existing = await tx.miningEmissionDay.findUnique({ where: { dayUtc: rewardDay } });
    if (existing) return { day: serializeDay(existing), idempotentReplay: true };

    const program = await tx.miningEmissionProgram.findFirst({
      where: { status: "active" }, include: { protocolConfig: true },
    });
    if (!program) reject("NO_ACTIVE_EMISSION_PROGRAM", "No R3 emission program is active", 503);
    assertProtocolIntegrity(program.protocolConfig, program);
    if (program.protocolConfig.effectiveFrom &&
      firstRewardBoundaryStrictlyAfter(program.protocolConfig.effectiveFrom).getTime() > rewardDay.getTime()) {
      reject("PROTOCOL_NOT_EFFECTIVE_FOR_DAY", "Protocol was not effective before the requested reward day", 503);
    }

    const theoretical = dailyEmissionCeiling({
      genesisAt: program.genesisAt,
      rewardDayStart: rewardDay,
      rewardPoolTokens: decimal(program.rewardPoolTokens),
    });

    // Day row and full eligible network are immutable once reserved. Only
    // R1's canonical active-status eligibility predicate is used.
    const day = await tx.miningEmissionDay.create({
      data: {
        programId: program.id,
        dayUtc: rewardDay,
        epochNumber: theoretical.epochNumber,
        theoreticalCeiling: new DecimalCtor(theoretical.ceiling),
        qualifiedBaseMp: new DecimalCtor(0),
        qualifiedEffectiveMp: new DecimalCtor(0),
        qualifiedActivationCount: 0,
        utilizationRatio: new DecimalCtor(0),
        reservedEmission: new DecimalCtor(0),
        status: "reserved",
        calculationVersion: EMISSION_CALCULATION_VERSION,
      },
    });

    let lastId: string | undefined;
    let totalBase = 0n;
    let totalEffective = 0n;
    let count = 0;
    while (true) {
      const batch: any[] = await tx.miningActivation.findMany({
        where: {
          protocolConfigId: program.protocolConfigId,
          status: "active",
          rewardEligibleFrom: { lte: rewardDay },
          expiresAt: { gt: rewardDay },
          OR: [{ exitedAt: null }, { exitedAt: { gt: rewardDay } }],
          ...(lastId ? { id: { gt: lastId } } : {}),
        },
        orderBy: { id: "asc" },
        take: PAGE_SIZE,
        include: {
          paymentTransaction: { select: { id: true, status: true, type: true, source: true, userId: true, usdtAmount: true } },
        },
      });
      if (!batch.length) break;
      const snapshots: any[] = [];
      for (const activation of batch) {
        const payment = activation.paymentTransaction;
        if (!payment || payment.status !== "approved" || payment.type !== "mining_activation" ||
            payment.source !== "mining_power" || payment.userId !== activation.userId ||
            !payment.usdtAmount || parseFixed18(decimal(payment.usdtAmount)) !== parseFixed18(decimal(activation.paymentAmount))) {
          reject("ACTIVATION_PAYMENT_INTEGRITY", "Qualified activation has invalid R2 payment linkage");
        }
        const values = effectiveMpForDay({
          id: activation.id,
          userId: activation.userId,
          status: activation.status,
          rewardEligibleFrom: activation.rewardEligibleFrom,
          expiresAt: activation.expiresAt,
          exitedAt: activation.exitedAt,
          baseMp: decimal(activation.baseMp),
          staticWeightedMpSnapshot: decimal(activation.staticWeightedMpSnapshot),
          genesisEligible: activation.genesisEligible,
          genesisMultiplierSnapshot: decimal(activation.genesisMultiplierSnapshot),
          genesisBoostStartsAt: activation.genesisBoostStartsAt,
          genesisBoostEndsAt: activation.genesisBoostEndsAt,
        }, rewardDay, decimal(program.protocolConfig.maxEffectiveMpMultiplier));
        totalBase += parseFixed18(values.baseMp);
        totalEffective += parseFixed18(values.effectiveMp);
        count++;
        snapshots.push({
          emissionDayId: day.id, activationId: activation.id, userId: activation.userId,
          baseMp: new DecimalCtor(values.baseMp),
          effectiveMp: new DecimalCtor(values.effectiveMp),
          genesisMultiplier: new DecimalCtor(values.genesisMultiplier),
        });
      }
      await tx.miningDailyPowerSnapshot.createMany({ data: snapshots });
      lastId = batch[batch.length - 1].id;
      if (batch.length < PAGE_SIZE) break;
    }

    const baseString = formatFixed18(totalBase);
    const effectiveString = formatFixed18(totalEffective);
    const emission = reserveDailyEmissionAmount({
      theoreticalCeiling: theoretical.ceiling,
      networkBaseMp: baseString,
      fullEmissionBaseMpThreshold: decimal(program.fullEmissionBaseMpThreshold),
    });
    isEmptyEmissionDay(effectiveString, emission.reserved);
    const previous = await tx.miningEmissionDay.aggregate({
      where: { id: { not: day.id } },
      _sum: { reservedEmission: true },
    });
    const allReserved = parseFixed18(decimal(previous._sum.reservedEmission ?? "0"));
    const newTotal = allReserved + parseFixed18(emission.reserved);
    if (newTotal > GLOBAL_R3_TOKEN_CAP || newTotal > requirePoolCap(decimal(program.rewardPoolTokens))) {
      reject("EMISSION_POOL_EXHAUSTED", "Reservation would exceed the fixed R3 mining pool ceiling");
    }

    const final = await tx.miningEmissionDay.update({
      where: { id: day.id },
      data: {
        qualifiedBaseMp: new DecimalCtor(baseString),
        qualifiedEffectiveMp: new DecimalCtor(effectiveString),
        qualifiedActivationCount: count,
        utilizationRatio: new DecimalCtor(emission.utilization),
        reservedEmission: new DecimalCtor(emission.reserved),
      },
    });
    return { day: serializeDay(final), idempotentReplay: false };
  }, { timeout: 120_000, maxWait: 15_000, isolationLevel: "Serializable" });
  for (let attempt = 0; attempt < 4; attempt++) {
    try { return await once(); }
    catch (error: any) {
      const retryable = ["P2034", "P2002", "40001"].includes(error?.code);
      if (!retryable || attempt === 3) throw error;
    }
  }
  throw new Error("Unreachable R3 retry exhaustion");
}
