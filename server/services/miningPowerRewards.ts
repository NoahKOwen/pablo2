/** Mining Power R4 — deterministic reward batches and exactly-once credits.
 * R1/R2/R3 modules are read-only dependencies. No HTTP mutation endpoints,
 * scheduler or automatic activation. All mutations require operator opt-in.
 */
import { Prisma, prisma } from "../db/client";
import { parseFixed18 } from "../domain/mining-power/calculations.ts";
import {
  allocateFrozenDailyRewards,
  quantizeRewardDown,
  R4_CALCULATION_VERSION,
  R4_LEDGER_DECIMALS,
  R4_MAX_SNAPSHOTS_PER_BATCH,
  type RewardPowerSnapshot,
} from "../domain/mining-power/rewards.ts";
import { assertDayClosed, parseUtcDate } from "../domain/mining-power/emission.ts";

const db = prisma as any;
const DecimalCtor = (Prisma as any).Decimal as new(value: any) => any;
const SNAPSHOT_PAGE_SIZE = 1_000;
const INSERT_PAGE_SIZE = 250;
const MAX_CREDIT_CHUNK = 50;

export class R4RewardError extends Error {
  constructor(public code: string, public httpStatus: number, message: string) { super(message); }
}
function refuse(code: string, message: string, status = 409): never {
  throw new R4RewardError(code, status, message);
}
function decimal(v: unknown): string {
  // Prisma.Decimal.toString() can use scientific notation (e.g. 1e-9),
  // which R1 fixed-point parsing intentionally disallows.
  if (v && typeof (v as any).toFixed === "function") return (v as any).toFixed();
  return (v as any)?.toString?.() ?? String(v);
}
function formatBatch(batch: any) {
  return {
    id: batch.id,
    emissionDayId: batch.emissionDayId,
    reservedEmission: decimal(batch.reservedEmission),
    allocatedEmission: decimal(batch.allocatedEmission),
    unallocatedDust: decimal(batch.unallocatedDust),
    settlementDecimals: batch.settlementDecimals,
    totalEffectiveMp: decimal(batch.totalEffectiveMp),
    allocationCount: batch.allocationCount,
    status: batch.status,
    calculationVersion: batch.calculationVersion,
    createdAt: batch.createdAt,
    preparedAt: batch.preparedAt,
    completedAt: batch.completedAt,
  };
}
function checkPrepareFlag() {
  if (process.env.MINING_POWER_R4_ENABLE_PREPARE !== "1") {
    refuse("R4_PREPARE_DISABLED", "R4 allocation preparation requires explicit operator opt-in", 503);
  }
}
function checkCreditFlag() {
  if (process.env.MINING_POWER_R4_ENABLE_CREDITS !== "1" ||
      process.env.MINING_POWER_R4_POLICY_APPROVED !== "1" ||
      process.env.MINING_POWER_R4_LEDGER_DECIMALS !== "9") {
    refuse("R4_CREDITS_DISABLED", "R4 credits require explicit payout and precision policy approval", 503);
  }
}
function retryable(error: any): boolean {
  return ["P2034", "P2002", "40001", "40P01"].includes(error?.code);
}
async function serializableWithRetry<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try { return await run(); }
    catch (error) {
      if (!retryable(error) || attempt === 3) throw error;
    }
  }
  throw new Error("R4_TRANSACTION_RETRY_EXHAUSTED");
}
async function r4Transaction<T>(fn: (tx: any) => Promise<T>, timeout = 40_000): Promise<T> {
  return db.$transaction(async (tx: any) => {
    // Globally serialized R4 financial state transitions. R3 uses a separate lock.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(731104, 20261106)::text AS locked`;
    return fn(tx);
  }, { isolationLevel: "Serializable", timeout, maxWait: 15_000 });
}

async function findDayByUtcDay(tx: any, value: string) {
  const utcDay = parseUtcDate(value);
  assertDayClosed(utcDay, new Date());
  const day = await tx.miningEmissionDay.findUnique({
    where: { dayUtc: utcDay },
    include: { program: { include: { protocolConfig: true } } },
  });
  if (!day || day.status !== "reserved") {
    refuse("R3_DAY_NOT_RESERVED", "R3 reward day has no finalized reservation", 404);
  }
  return day;
}
async function snapshotStats(tx: any, emissionDayId: string) {
  const stats = await tx.miningDailyPowerSnapshot.aggregate({
    where: { emissionDayId },
    _count: { _all: true },
    _sum: { effectiveMp: true },
  });
  return {
    count: stats._count._all as number,
    totalMp: decimal(stats._sum.effectiveMp ?? "0"),
  };
}
async function loadSnapshots(emissionDayId: string): Promise<RewardPowerSnapshot[]> {
  const result: RewardPowerSnapshot[] = [];
  let lastId: string | undefined;
  for (;;) {
    const page: any[] = await db.miningDailyPowerSnapshot.findMany({
      where: { emissionDayId, ...(lastId ? { activationId: { gt: lastId } } : {}) },
      orderBy: { activationId: "asc" },
      take: SNAPSHOT_PAGE_SIZE,
      select: { id: true, activationId: true, userId: true, effectiveMp: true },
    });
    for (const p of page) result.push({
      id: p.id, activationId: p.activationId, userId: p.userId, effectiveMp: decimal(p.effectiveMp),
    });
    if (result.length > R4_MAX_SNAPSHOTS_PER_BATCH) refuse("R4_BATCH_TOO_LARGE", "R4 pilot cap 200k activations exceeded", 422);
    if (page.length < SNAPSHOT_PAGE_SIZE) break;
    lastId = page[page.length - 1].activationId;
  }
  return result;
}

export async function r4Status() {
  const [batches, totals, ledger] = await Promise.all([
    db.miningRewardBatch.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    db.miningRewardBatch.aggregate({ _count: { _all: true }, _sum: { allocatedEmission: true, unallocatedDust: true } }),
    db.miningRewardLedger.aggregate({ _count: { _all: true }, _sum: { amount: true } }),
  ]);
  return {
    prepareEnabledByDefault: false,
    creditEnabledByDefault: false,
    provisionalLedgerDecimals: R4_LEDGER_DECIMALS,
    totalBatches: totals._count._all,
    allocatedFromR3: decimal(totals._sum.allocatedEmission ?? "0"),
    unallocatedDust: decimal(totals._sum.unallocatedDust ?? "0"),
    creditedRewardLedgerEntries: ledger._count._all,
    creditedRewardLedgerAmount: decimal(ledger._sum.amount ?? "0"),
    batches: batches.map(formatBatch),
  };
}
export async function r4FindBatchForDay(day: string) {
  const utcDay = parseUtcDate(day);
  const r3 = await db.miningEmissionDay.findUnique({ where: { dayUtc: utcDay }, select: { id: true } });
  if (!r3) return null;
  const batch = await db.miningRewardBatch.findUnique({ where: { emissionDayId: r3.id } });
  return batch ? formatBatch(batch) : null;
}

/** Step 1: freeze the R3 day in the DB and pin the exact amount, denominator and 9dp precision. */
export async function r4PlanRewardBatch(dayUtc: string) {
  checkPrepareFlag();
  parseUtcDate(dayUtc);
  return serializableWithRetry(() => r4Transaction(async (tx) => {
    const day = await findDayByUtcDay(tx, dayUtc);
    const existing = await tx.miningRewardBatch.findUnique({ where: { emissionDayId: day.id } });
    if (existing) return { batch: formatBatch(existing), idempotentReplay: true };
    // R3 has already authorized this day. Later emission-policy pauses or
    // retirement do not retroactively cancel a frozen reservation. Only the
    // independent R1 payout-processing pause blocks settlement preparation.
    if (day.program.protocolConfig.payoutProcessingPaused) {
      refuse("R4_PAYOUT_PAUSED", "R1 payout-processing pause is enabled", 503);
    }
    if (day.calculationVersion !== "mining-power-r3-v1") {
      refuse("R4_R3_VERSION_MISMATCH", "Unsupported R3 emission reservation version");
    }
    const stats = await snapshotStats(tx, day.id);
    if (stats.count !== day.qualifiedActivationCount ||
        parseFixed18(stats.totalMp) !== parseFixed18(decimal(day.qualifiedEffectiveMp))) {
      refuse("R4_R3_SNAPSHOT_MISMATCH", "R3 participant snapshot does not reconcile to its day");
    }
    if (stats.count > R4_MAX_SNAPSHOTS_PER_BATCH) {
      refuse("R4_BATCH_TOO_LARGE", "R4 pilot cap 200k activations exceeded", 422);
    }
    const reserved = decimal(day.reservedEmission);
    const { amount, dust } = quantizeRewardDown(reserved);
    if (parseFixed18(amount) > 0n && stats.count === 0) {
      refuse("R4_ZERO_NETWORK_WITH_EMISSION", "Positive R3 reservation lacks participants");
    }
    const batch = await tx.miningRewardBatch.create({
      data: {
        emissionDayId: day.id, reservedEmission: new DecimalCtor(reserved),
        allocatedEmission: new DecimalCtor(amount), unallocatedDust: new DecimalCtor(dust),
        settlementDecimals: R4_LEDGER_DECIMALS, totalEffectiveMp: new DecimalCtor(stats.totalMp),
        allocationCount: stats.count, status: "allocating", calculationVersion: R4_CALCULATION_VERSION,
      },
    });
    return { batch: formatBatch(batch), idempotentReplay: false };
  }, 120_000));
}

/** Step 2: materialize in retryable pages. DB triggers freeze R3 snapshots after planning. */
export async function r4MaterializeBatch(dayUtc: string) {
  checkPrepareFlag();
  parseUtcDate(dayUtc);
  const batch = await r4FindBatchForDay(dayUtc);
  if (!batch) refuse("R4_BATCH_NOT_PLANNED", "Call R4 plan first", 404);
  if (batch.status !== "allocating") {
    const audit = await r4AuditDay(dayUtc);
    if (!audit.consistent) refuse("R4_REPLAY_RECONCILIATION_FAILED", "Existing reward batch fails audit");
    return { batch, idempotentReplay: true };
  }
  const snapshots = await loadSnapshots(batch.emissionDayId);
  const computed = allocateFrozenDailyRewards({
    reservedEmission: batch.reservedEmission,
    networkEffectiveMp: batch.totalEffectiveMp,
    qualifiedActivationCount: batch.allocationCount,
    snapshots,
    ledgerDecimals: batch.settlementDecimals,
  });
  if (parseFixed18(computed.allocatedEmission) !== parseFixed18(batch.allocatedEmission) ||
      parseFixed18(computed.dust) !== parseFixed18(batch.unallocatedDust)) {
    refuse("R4_PLAN_DIVERGENCE", "Frozen planned amount differs from deterministic allocations");
  }
  const completedByOtherWorker = async () => {
    const current = await db.miningRewardBatch.findUnique({ where: { id: batch.id } });
    if (!current || current.status === "allocating") return null;
    const audit = await r4AuditDay(dayUtc);
    if (!audit.consistent) refuse("R4_CONCURRENT_PREPARATION_DIVERGENCE", "A concurrent R4 preparation failed audit");
    return { batch: formatBatch(current), idempotentReplay: true };
  };
  for (let i = 0; i < computed.allocations.length; i += INSERT_PAGE_SIZE) {
    const completed = await completedByOtherWorker();
    if (completed) return completed;
    const page = computed.allocations.slice(i, i + INSERT_PAGE_SIZE);
    // Each page is repeatable; a crash can be recovered without deleting prior rows.
    try {
      await db.miningRewardAllocation.createMany({
        skipDuplicates: true,
        data: page.map(a => ({
          batchId: batch.id,
          powerSnapshotId: a.powerSnapshotId,
          activationId: a.activationId,
          userId: a.userId,
          effectiveMp: new DecimalCtor(a.effectiveMp),
          rewardAmount: new DecimalCtor(a.rewardAmount),
          status: a.status,
        })),
      });
    } catch (error) {
      // A second materializer can finish between the status read and INSERT.
      const recovered = await completedByOtherWorker();
      if (recovered) return recovered;
      throw error;
    }
  }

  // Verify ALL materialized values, not just the sum. Also detects malicious/preexisting
  // same-sum altered rows, conflicting duplicate inserts, or incomplete pages.
  const persisted = await db.miningRewardAllocation.findMany({
    where: { batchId: batch.id },
    orderBy: { activationId: "asc" },
    select: { activationId: true, userId: true, powerSnapshotId: true, effectiveMp: true, rewardAmount: true, status: true },
  });
  if (persisted.length !== computed.allocations.length) refuse("R4_INCOMPLETE_ALLOCATIONS", "R4 materialization incomplete");
  for (let i = 0; i < persisted.length; i++) {
    const actual = persisted[i], expected = computed.allocations[i];
    if (actual.activationId !== expected.activationId || actual.userId !== expected.userId ||
        actual.powerSnapshotId !== expected.powerSnapshotId ||
        parseFixed18(decimal(actual.effectiveMp)) !== parseFixed18(expected.effectiveMp) ||
        parseFixed18(decimal(actual.rewardAmount)) !== parseFixed18(expected.rewardAmount) ||
        actual.status !== expected.status) {
      refuse("R4_ALLOCATION_DIVERGENCE", "Persisted allocation differs from the deterministic frozen reward plan");
    }
  }

  return serializableWithRetry(() => r4Transaction(async (tx) => {
    const current = await tx.miningRewardBatch.findUnique({ where: { id: batch.id } });
    if (current.status !== "allocating") return { batch: formatBatch(current), idempotentReplay: true };
    const finalStats = await tx.miningRewardAllocation.aggregate({
      where: { batchId: batch.id }, _count: { _all: true }, _sum: { rewardAmount: true },
    });
    const currentSnapshotStats = await snapshotStats(tx, batch.emissionDayId);
    if (finalStats._count._all !== batch.allocationCount ||
        parseFixed18(decimal(finalStats._sum.rewardAmount ?? "0")) !== parseFixed18(batch.allocatedEmission) ||
        currentSnapshotStats.count !== batch.allocationCount ||
        parseFixed18(currentSnapshotStats.totalMp) !== parseFixed18(batch.totalEffectiveMp)) {
      refuse("R4_MATERIALIZATION_RECONCILIATION", "R4 and R3 snapshots do not reconcile");
    }
    const status = computed.positiveCount > 0 ? "ready" : "completed";
    const final = await tx.miningRewardBatch.update({
      where: { id: batch.id },
      data: { status, preparedAt: new Date(), ...(status === "completed" ? { completedAt: new Date() } : {}) },
    });
    return { batch: formatBatch(final), idempotentReplay: false };
  }));
}

/** Step 3: credit <=50 allocations atomically per Serializable transaction. */
export async function r4CreditChunk(dayUtc: string, requestedLimit = 25) {
  checkCreditFlag();
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > MAX_CREDIT_CHUNK) {
    refuse("R4_INVALID_CREDIT_LIMIT", "Credit chunk size must be 1 to 50", 400);
  }
  parseUtcDate(dayUtc);
  return serializableWithRetry(() => r4Transaction(async (tx) => {
    const day = await findDayByUtcDay(tx, dayUtc);
    const batch = await tx.miningRewardBatch.findUnique({ where: { emissionDayId: day.id } });
    if (!batch || batch.status === "allocating") {
      refuse("R4_BATCH_NOT_READY", "Reward allocations have not been finalized", 409);
    }
    if (day.program.protocolConfig.payoutProcessingPaused) {
      refuse("R4_PAYOUT_PAUSED", "R1 payout-processing pause prevents all R4 credits", 503);
    }
    if (batch.status === "completed") {
      return { batch: formatBatch(batch), creditedInChunk: 0, idempotentReplay: true };
    }
    const page: any[] = await tx.miningRewardAllocation.findMany({
      where: { batchId: batch.id, status: "pending" },
      orderBy: { activationId: "asc" }, take: requestedLimit,
    });
    let processed = 0;
    const now = new Date();
    for (const allocation of page) {
      const claim = await tx.miningRewardAllocation.updateMany({
        where: { id: allocation.id, batchId: batch.id, status: "pending" },
        data: { status: "credited", creditedAt: now },
      });
      if (claim.count !== 1) throw new Error("R4_ALLOCATION_CLAIM_CONFLICT");
      await tx.miningRewardLedger.create({
        data: {
          allocationId: allocation.id, batchId: batch.id, userId: allocation.userId,
          amount: allocation.rewardAmount, source: "mining_power_r4",
        },
      });
      // Same balance fields as legacy mining, but isolated code path and
      // unique ledger/activation claims protect this NEW reward from double credit.
      await tx.balance.upsert({
        where: { userId: allocation.userId },
        create: {
          userId: allocation.userId, miningBalance: allocation.rewardAmount,
          totalEarned: allocation.rewardAmount,
        },
        update: {
          miningBalance: { increment: allocation.rewardAmount },
          totalEarned: { increment: allocation.rewardAmount },
        },
      });
      processed++;
      if (processed === 1 && process.env.MINING_POWER_R4_INJECT_ROLLBACK === "1" &&
          process.env.MINING_POWER_R4_INTEGRATION_TEST === "1" && process.env.NODE_ENV !== "production") {
        throw new Error("R4_TEST_INJECTED_ROLLBACK");
      }
    }
    const pending = await tx.miningRewardAllocation.count({ where: { batchId: batch.id, status: "pending" } });
    let nextStatus: "paying" | "completed" = "paying";
    if (pending === 0) {
      const [credited, ledger] = await Promise.all([
        tx.miningRewardAllocation.aggregate({
          where: { batchId: batch.id, status: "credited" },
          _count: { _all: true }, _sum: { rewardAmount: true },
        }),
        tx.miningRewardLedger.aggregate({
          where: { batchId: batch.id }, _count: { _all: true }, _sum: { amount: true },
        }),
      ]);
      if (credited._count._all !== ledger._count._all ||
          parseFixed18(decimal(credited._sum.rewardAmount ?? "0")) !== parseFixed18(decimal(batch.allocatedEmission)) ||
          parseFixed18(decimal(ledger._sum.amount ?? "0")) !== parseFixed18(decimal(batch.allocatedEmission))) {
        refuse("R4_LEDGER_RECONCILIATION_FAILED", "Credited allocations and ledger must equal frozen R3 reward batch");
      }
      nextStatus = "completed";
    }
    const final = await tx.miningRewardBatch.update({
      where: { id: batch.id },
      data: { status: nextStatus, ...(nextStatus === "completed" ? { completedAt: now } : {}) },
    });
    return { batch: formatBatch(final), creditedInChunk: processed, idempotentReplay: false };
  }, 60_000));
}

/** Independent read-only reconciliation; no updates, no balance mutations. */
export async function r4AuditDay(dayUtc: string) {
  parseUtcDate(dayUtc);
  const batch = await r4FindBatchForDay(dayUtc);
  if (!batch) return { batch: null, consistent: false, observations: ["NO_BATCH"] };
  const [day, all, pending, skipped, credited, ledger] = await Promise.all([
    db.miningEmissionDay.findUnique({ where: { id: batch.emissionDayId } }),
    db.miningRewardAllocation.aggregate({where:{batchId:batch.id},_count:{_all:true},_sum:{rewardAmount:true}}),
    db.miningRewardAllocation.count({where:{batchId:batch.id,status:"pending"}}),
    db.miningRewardAllocation.count({where:{batchId:batch.id,status:"skipped"}}),
    db.miningRewardAllocation.aggregate({where:{batchId:batch.id,status:"credited"},_count:{_all:true},_sum:{rewardAmount:true}}),
    db.miningRewardLedger.aggregate({where:{batchId:batch.id},_count:{_all:true},_sum:{amount:true}}),
  ]);
  const observations: string[] = [];
  const amount = (v: any) => parseFixed18(decimal(v ?? "0"));
  if (!day || amount(day.reservedEmission) !== amount(batch.reservedEmission)) observations.push("R3_RESERVATION_MISMATCH");
  if (amount(batch.allocatedEmission) + amount(batch.unallocatedDust) !== amount(batch.reservedEmission)) observations.push("BUDGET_CONSERVATION_FAILED");
  if (batch.status !== "allocating" && all._count._all !== batch.allocationCount) observations.push("ALLOCATION_COUNT_MISMATCH");
  if (batch.status !== "allocating" && amount(all._sum.rewardAmount) !== amount(batch.allocatedEmission)) observations.push("ALLOCATION_SUM_MISMATCH");
  if (pending + skipped + credited._count._all !== all._count._all) observations.push("ALLOCATION_STATUS_COUNT_MISMATCH");
  if (credited._count._all !== ledger._count._all ||
      amount(credited._sum.rewardAmount) !== amount(ledger._sum.amount)) observations.push("LEDGER_CREDIT_MISMATCH");
  if (amount(ledger._sum.amount) > amount(batch.allocatedEmission)) observations.push("CREDIT_EXCEEDS_RESERVATION");
  if (batch.status === "completed" && (pending !== 0 ||
      amount(ledger._sum.amount) !== amount(batch.allocatedEmission))) observations.push("COMPLETION_NOT_RECONCILED");
  // A wrong allocation->ledger/user mapping would not necessarily change sums.
  const links: any[] = await db.$queryRaw`
    SELECT COUNT(*)::integer AS mismatches FROM "MiningRewardLedger" l
    JOIN "MiningRewardAllocation" a ON a."id" = l."allocationId"
    WHERE l."batchId" = ${batch.id} AND
     (l."batchId" <> a."batchId" OR l."userId" <> a."userId" OR
      l."amount" <> a."rewardAmount" OR a."status" <> 'credited')`;
  if ((links[0]?.mismatches ?? 0) !== 0) observations.push("LEDGER_LINK_MISMATCH");
  return {
    batch,
    consistent: observations.length === 0,
    observations,
    allocationCount: all._count._all,
    pendingCount: pending,
    skippedCount: skipped,
    creditedCount: credited._count._all,
    creditedAmount: decimal(ledger._sum.amount ?? "0"),
    ledgerEntries: ledger._count._all,
  };
}
