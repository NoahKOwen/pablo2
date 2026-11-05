/** LOCAL-ONLY destructive fixture integration test. NEVER run on production.
 * Creates temporary R3 program + R2-compatible activation fixtures and cleans them.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { prisma } from "../server/db/client";
import { reserveCompletedMiningEmissionDay, MiningEmissionError } from "../server/services/miningPowerEmission";
import { calculateStaticWeightedMp, calculateExpirationBoundary } from "../server/domain/mining-power/calculations.ts";

const db = prisma as any;
const suffix = randomBytes(6).toString("hex");
const users: string[] = [];
const transactions: string[] = [];
const activationIds: string[] = [];
let programId: string | null = null;
let baselineProtocol: any = null;
let mutatedProtocolId: string | null = null;
let modifiedConfig = false;
let initialMiningBalance: string | null = null;
let initialOutboxCount: number | null = null;

const dbUrl = process.env.DATABASE_URL ?? "";
if (process.env.NODE_ENV === "production" ||
    process.env.MINING_POWER_R3_INTEGRATION_TEST !== "1" ||
    !/127\.0\.0\.1:5433\/xnrt(?:\?|$)/.test(dbUrl)) {
  throw new Error("R3 integration requires MINING_POWER_R3_INTEGRATION_TEST=1 and local xnrt DB on 127.0.0.1:5433");
}

async function cleanup() {
  // Only delete rows associated with this test; never touch existing state.
  if (programId) {
    const days = await db.miningEmissionDay.findMany({ where: { programId }, select: { id: true } });
    if (days.length) {
      await db.miningDailyPowerSnapshot.deleteMany({ where: { emissionDayId: { in: days.map((d: any) => d.id) } } });
      await db.miningEmissionDay.deleteMany({ where: { programId } });
    }
    await db.miningEmissionProgram.deleteMany({ where: { id: programId } });
  }
  if (activationIds.length) await db.miningActivation.deleteMany({ where: { id: { in: activationIds } } });
  if (transactions.length) await db.transaction.deleteMany({ where: { id: { in: transactions } } });
  if (users.length) await db.user.deleteMany({ where: { id: { in: users } } });
  if (mutatedProtocolId && modifiedConfig) {
    await db.miningProtocolConfig.update({
      where: { id: mutatedProtocolId },
      data: {
        status: baselineProtocol.status,
        effectiveFrom: baselineProtocol.effectiveFrom,
        emissionPaused: baselineProtocol.emissionPaused,
        fullEmissionBaseMpThreshold: baselineProtocol.fullEmissionBaseMpThreshold,
      },
    });
  }
}

async function main() {
  const [existingDays, existingPrograms, existingActivations] = await Promise.all([
    db.miningEmissionDay.count(), db.miningEmissionProgram.count(), db.miningActivation.count(),
  ]);
  if (existingDays !== 0 || existingPrograms !== 0 || existingActivations !== 0) {
    throw new Error("R3 integration is only allowed on clean local R2 DB with zero activations/emission data");
  }
  const initialBalances = await db.balance.aggregate({ _sum: { miningBalance: true } });
  initialMiningBalance = initialBalances._sum.miningBalance?.toString() ?? "0";
  initialOutboxCount = await db.outboxEvent.count();
  baselineProtocol = await db.miningProtocolConfig.findUnique({ where: { version: "mining-power-v1-draft" } });
  if (!baselineProtocol || baselineProtocol.status !== "draft") throw new Error("Original R1 draft protocol is required");
  mutatedProtocolId = baselineProtocol.id;

  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const rewardDay = new Date(today.getTime() - 86_400_000);
  const genesis = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

  const program = await db.miningEmissionProgram.create({
    data: {
      protocolConfigId: baselineProtocol.id,
      genesisAt: genesis,
      termMonths: 84,
      rewardPoolTokens: "150000000",
      fullEmissionBaseMpThreshold: "100",
      status: "draft",
      calculationVersion: "mining-power-r3-v1",
    },
  });
  programId = program.id;

  process.env.MINING_POWER_R3_ENABLE_RESERVATIONS = "1";
  let blocked = false;
  try { await reserveCompletedMiningEmissionDay({day: rewardDay.toISOString().slice(0,10)}); }
  catch (e) { blocked = e instanceof MiningEmissionError && e.code === "NO_ACTIVE_EMISSION_PROGRAM"; }
  assert.equal(blocked, true, "draft R3 program must fail closed");
  await db.miningProtocolConfig.update({
    where: { id: baselineProtocol.id },
    data: { status: "active", effectiveFrom: null, emissionPaused: false, fullEmissionBaseMpThreshold: "100" },
  });
  modifiedConfig = true;
  await db.miningEmissionProgram.update({ where: { id: programId }, data: { status: "active" } });

  const [pkg25, pkg50, duration1, duration3] = await Promise.all([
    db.miningPackage.findFirst({ where: { protocolConfigId: baselineProtocol.id, code: "starter" } }),
    db.miningPackage.findFirst({ where: { protocolConfigId: baselineProtocol.id, code: "basic" } }),
    db.miningDuration.findFirst({ where: { protocolConfigId: baselineProtocol.id, months: 1 } }),
    db.miningDuration.findFirst({ where: { protocolConfigId: baselineProtocol.id, months: 3 } }),
  ]);
  assert.ok(pkg25 && pkg50 && duration1 && duration3);
  const seed = async (pkg: any, duration: any, n: number, exitTomorrow: boolean) => {
    const user = await db.user.create({
      data: {
        email: `r3-${suffix}-${n}@example.invalid`, username: `r3-${suffix}-${n}`,
        passwordHash: "r3-test-fixture", referralCode: `R3-${suffix}-${n}`, emailVerified: true,
      },
    });
    users.push(user.id);
    const payment = await db.transaction.create({
      data: {
        userId: user.id, type: "mining_activation", source: "mining_power", amount: "0",
        usdtAmount: pkg.activationAmountUsdt, transactionHash: `0x${randomBytes(32).toString("hex")}`,
        walletAddress: "r3-local-test-only", status: "approved", verified: true, confirmations: 12,
        approvedAt: new Date(rewardDay.getTime() - 86_400_000),
      },
    });
    transactions.push(payment.id);
    const packageMultiplier = (1 + Number(pkg.packageBoostRate)).toFixed(6);
    const staticWeighted = calculateStaticWeightedMp({
      baseMp: pkg.baseMp.toString(), packageMultiplier, durationMultiplier: duration.multiplier.toString(),
    });
    const act = await db.miningActivation.create({
      data: {
        userId: user.id, protocolConfigId: baselineProtocol.id, packageId: pkg.id, durationId: duration.id,
        activationRequestId: `r3-fixture-${suffix}-${n}`, paymentTransactionId: payment.id,
        packageCodeSnapshot: pkg.code, packageNameSnapshot: pkg.name, paymentAsset: "USDT",
        paymentAmount: pkg.activationAmountUsdt, eligibleValueUsdt: pkg.activationAmountUsdt,
        activationAmountUsdtSnapshot: pkg.activationAmountUsdt, baseMp: pkg.baseMp,
        packageMultiplierSnapshot: packageMultiplier, durationMultiplierSnapshot: duration.multiplier,
        staticWeightedMpSnapshot: staticWeighted, durationMonthsSnapshot: duration.months,
        genesisEligible: false, genesisMultiplierSnapshot: "1",
        paymentConfirmedAt: new Date(rewardDay.getTime() - 86_400_000),
        activatedAt: new Date(rewardDay.getTime() - 86_400_000),
        rewardEligibleFrom: rewardDay, expiresAt: calculateExpirationBoundary(rewardDay, duration.months),
        ...(exitTomorrow ? { exitRequestedAt: new Date(rewardDay.getTime() + 12 * 3_600_000), exitedAt: today } : {}),
        status: "active", protocolVersion: baselineProtocol.version, termsVersion: baselineProtocol.termsVersion,
      },
    });
    activationIds.push(act.id);
    return act;
  };
  const a = await seed(pkg25, duration1, 1, false);
  const b = await seed(pkg50, duration3, 2, true);

  process.env.MINING_POWER_R3_ENABLE_RESERVATIONS = "0";
  blocked = false;
  try { await reserveCompletedMiningEmissionDay({day:rewardDay.toISOString().slice(0,10)}); }
  catch (e) { blocked = e instanceof MiningEmissionError && e.code === "R3_RESERVATIONS_DISABLED"; }
  assert.equal(blocked,true,"default-disabled guard must reject");
  process.env.MINING_POWER_R3_ENABLE_RESERVATIONS = "1";

  const arg = { day: rewardDay.toISOString().slice(0,10) };
  const [first, second] = await Promise.all([
    reserveCompletedMiningEmissionDay(arg), reserveCompletedMiningEmissionDay(arg),
  ]);
  assert.equal(first.day.id, second.day.id, "concurrent requests must be idempotent");
  assert.equal(first.day.qualifiedActivationCount, 2);
  assert.equal(first.day.qualifiedBaseMp, "75");
  assert.equal(first.day.qualifiedEffectiveMp, "79.54");
  assert.equal(first.day.utilizationRatio, "0.75");
  assert.ok(Number(first.day.reservedEmission) > 0);
  assert.ok(Number(first.day.reservedEmission) < Number(first.day.theoreticalCeiling));
  assert.equal(await db.miningEmissionDay.count({ where: { dayUtc: rewardDay } }), 1);
  assert.equal(await db.miningDailyPowerSnapshot.count({ where: { emissionDayId: first.day.id } }), 2);
  const snapshots = await db.miningDailyPowerSnapshot.findMany({ where: { emissionDayId: first.day.id }, orderBy: { activationId: "asc" } });
  assert.deepEqual(new Set(snapshots.map((x:any)=>x.activationId)), new Set([a.id,b.id]));
  const replay = await reserveCompletedMiningEmissionDay(arg);
  assert.equal(replay.idempotentReplay, true);
  assert.equal(await db.outboxEvent.count(), initialOutboxCount, "R3 must not create payout/issuance outbox events");
  assert.equal((await db.balance.aggregate({ _sum: { miningBalance: true } }))._sum.miningBalance?.toString() ?? "0", initialMiningBalance, "R3 never credits mining balance");
  console.log("Mining Power R3 DB integration/concurrency test passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  try { await cleanup(); }
  finally { await db.$disconnect(); }
});
