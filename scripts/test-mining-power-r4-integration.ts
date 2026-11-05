/** R4 LOCAL-ONLY destructive fixture integration test.
 * Refuses production, shared DBs, non-local connection, nonempty R2/R3/R4 state.
 * Tests actual R3 emissions, R4 preparation/recovery, atomic rollback and credit.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { prisma } from "../server/db/client";
import { calculateExpirationBoundary, calculateStaticWeightedMp, parseFixed18 } from "../server/domain/mining-power/calculations.ts";
import { allocateFrozenDailyRewards } from "../server/domain/mining-power/rewards.ts";
import { reserveCompletedMiningEmissionDay } from "../server/services/miningPowerEmission";
import { R4RewardError, r4PlanRewardBatch, r4MaterializeBatch, r4CreditChunk, r4AuditDay, r4Status } from "../server/services/miningPowerRewards";

const db = prisma as any;
const marker = randomBytes(6).toString("hex");
const userIds: string[] = [];
const paymentIds: string[] = [];
const activationIds: string[] = [];
let programId: string | null = null;
let protocolId: string | null = null;
let original: any = null;
let changedConfig = false;
const url = process.env.DATABASE_URL ?? "";
if (process.env.NODE_ENV === "production" || process.env.MINING_POWER_R4_INTEGRATION_TEST !== "1" ||
    !/^postgres(?:ql)?:\/\/[^/]+@127\.0\.0\.1:5433\/xnrt(?:\?|$)/.test(url)) {
  throw new Error("R4 integration requires explicit MINING_POWER_R4_INTEGRATION_TEST=1 and local 127.0.0.1:5433/xnrt");
}

async function cleanup() {
  process.env.MINING_POWER_R4_INJECT_ROLLBACK = "0";
  if (programId) {
    const days: any[] = await db.miningEmissionDay.findMany({where:{programId},select:{id:true}});
    const dayIds = days.map(d=>d.id);
    const batches: any[] = await db.miningRewardBatch.findMany({where:{emissionDayId:{in:dayIds}},select:{id:true}});
    const batchIds = batches.map(b=>b.id);
    if (batchIds.length) {
      await db.miningRewardLedger.deleteMany({where:{batchId:{in:batchIds}}});
      await db.miningRewardAllocation.deleteMany({where:{batchId:{in:batchIds}}});
      await db.miningRewardBatch.deleteMany({where:{id:{in:batchIds}}});
    }
    if (dayIds.length) {
      await db.miningDailyPowerSnapshot.deleteMany({where:{emissionDayId:{in:dayIds}}});
      await db.miningEmissionDay.deleteMany({where:{id:{in:dayIds}}});
    }
    await db.miningEmissionProgram.deleteMany({where:{id:programId}});
  }
  if (activationIds.length) await db.miningActivation.deleteMany({where:{id:{in:activationIds}}});
  if (paymentIds.length) await db.transaction.deleteMany({where:{id:{in:paymentIds}}});
  if (userIds.length) await db.user.deleteMany({where:{id:{in:userIds}}});
  if (protocolId && changedConfig) await db.miningProtocolConfig.update({
    where:{id:protocolId},data:{
      status: original.status,
      effectiveFrom: original.effectiveFrom,
      emissionPaused: original.emissionPaused,
      payoutProcessingPaused: original.payoutProcessingPaused,
      fullEmissionBaseMpThreshold: original.fullEmissionBaseMpThreshold,
    },
  });
}

async function main() {
  const [a,p,d,b,l] = await Promise.all([
    db.miningActivation.count(),db.miningEmissionProgram.count(),db.miningEmissionDay.count(),
    db.miningRewardBatch.count(),db.miningRewardLedger.count(),
  ]);
  if (a !== 0 || p !== 0 || d !== 0 || b !== 0 || l !== 0 || await db.miningRewardAllocation.count() !== 0) {
    throw new Error("R4 integration requires clean local baseline: zero activation, emission and reward rows");
  }
  original = await db.miningProtocolConfig.findUnique({where:{version:"mining-power-v1-draft"}});
  if (!original || original.status !== "draft") throw new Error("R1 draft protocol fixture is missing");
  protocolId = original.id;

  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const rewardDay = new Date(today.getTime()-86_400_000);
  const emptyDay = new Date(rewardDay.getTime()-86_400_000);
  const dayIso = rewardDay.toISOString().slice(0,10);
  const emptyIso = emptyDay.toISOString().slice(0,10);
  const genesis = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth()-1, 1));
  const program = await db.miningEmissionProgram.create({data:{
    protocolConfigId:original.id, genesisAt:genesis, termMonths:84,
    rewardPoolTokens:"150000000",fullEmissionBaseMpThreshold:"100",status:"draft",calculationVersion:"mining-power-r3-v1",
  }});
  programId = program.id;
  await db.miningProtocolConfig.update({where:{id:protocolId},data:{
    status:"active",effectiveFrom:null,emissionPaused:false,payoutProcessingPaused:false,
    fullEmissionBaseMpThreshold:"100",
  }});
  changedConfig = true;
  await db.miningEmissionProgram.update({where:{id:programId},data:{status:"active"}});
  process.env.MINING_POWER_R3_ENABLE_RESERVATIONS = "1";
  const emptyR3 = await reserveCompletedMiningEmissionDay({day:emptyIso});
  assert.equal(emptyR3.day.reservedEmission,"0");

  const pkg25 = await db.miningPackage.findFirst({where:{protocolConfigId:protocolId,code:"starter"}});
  const pkg50 = await db.miningPackage.findFirst({where:{protocolConfigId:protocolId,code:"basic"}});
  const duration1 = await db.miningDuration.findFirst({where:{protocolConfigId:protocolId,months:1}});
  if (!pkg25 || !pkg50 || !duration1) throw new Error("Expected R1 package seed missing");
  async function createUser(n:number) {
    const user = await db.user.create({data:{
      email:`r4-${marker}-${n}@example.invalid`,username:`r4-${marker}-${n}`,
      passwordHash:"r4-local-fixture",referralCode:`R4-${marker}-${n}`,emailVerified:true,
    }});
    userIds.push(user.id);
    return user.id as string;
  }
  async function seedActivation(userId:string,pkg:any,n:number) {
    const payment = await db.transaction.create({data:{
      userId,type:"mining_activation",source:"mining_power",amount:"0",usdtAmount:pkg.activationAmountUsdt,
      transactionHash:`0x${randomBytes(32).toString("hex")}`,walletAddress:"r4-local-only",status:"approved",
      verified:true,confirmations:12,approvedAt:new Date(rewardDay.getTime()-86_400_000),
    }});
    paymentIds.push(payment.id);
    const pkgMultiplier = (1+Number(pkg.packageBoostRate)).toFixed(6);
    const staticMp = calculateStaticWeightedMp({
      baseMp:pkg.baseMp.toString(),packageMultiplier:pkgMultiplier,durationMultiplier:duration1.multiplier.toString(),
    });
    const activation = await db.miningActivation.create({data:{
      userId,protocolConfigId:protocolId,packageId:pkg.id,durationId:duration1.id,
      activationRequestId:`r4-fixture-${marker}-${n}`,paymentTransactionId:payment.id,
      packageCodeSnapshot:pkg.code,packageNameSnapshot:pkg.name,paymentAsset:"USDT",
      paymentAmount:pkg.activationAmountUsdt,eligibleValueUsdt:pkg.activationAmountUsdt,
      activationAmountUsdtSnapshot:pkg.activationAmountUsdt,baseMp:pkg.baseMp,
      packageMultiplierSnapshot:pkgMultiplier,durationMultiplierSnapshot:duration1.multiplier,
      staticWeightedMpSnapshot:staticMp,durationMonthsSnapshot:duration1.months,
      genesisEligible:false,genesisMultiplierSnapshot:"1",
      paymentConfirmedAt:new Date(rewardDay.getTime()-86_400_000),
      activatedAt:new Date(rewardDay.getTime()-86_400_000),rewardEligibleFrom:rewardDay,
      expiresAt:calculateExpirationBoundary(rewardDay,duration1.months),
      status:"active",protocolVersion:original.version,termsVersion:original.termsVersion,
    }});
    activationIds.push(activation.id);
  }
  const u1=await createUser(1), u2=await createUser(2);
  await seedActivation(u1,pkg25,1);
  await seedActivation(u2,pkg50,2);
  await seedActivation(u2,pkg25,3); // Same user has 2 independent paid activations.
  const r3 = await reserveCompletedMiningEmissionDay({day:dayIso});
  assert.equal(r3.day.qualifiedActivationCount,3);
  assert.equal(r3.day.qualifiedBaseMp,"100");
  assert.ok(parseFixed18(r3.day.reservedEmission)>0n);

  // Emission pause after an R3 day is authorized must NOT erase the ability
  // to prepare its prior legitimate settlement.
  await db.miningEmissionProgram.update({where:{id:programId},data:{status:"paused"}});
  await db.miningProtocolConfig.update({where:{id:protocolId},data:{emissionPaused:true}});

  process.env.MINING_POWER_R4_ENABLE_PREPARE = "0";
  await assert.rejects(()=>r4PlanRewardBatch(dayIso),(e:any)=>e instanceof R4RewardError && e.code==="R4_PREPARE_DISABLED");
  process.env.MINING_POWER_R4_ENABLE_PREPARE = "1";
  const [planned1,planned2] = await Promise.all([r4PlanRewardBatch(dayIso),r4PlanRewardBatch(dayIso)]);
  assert.equal(planned1.batch.id,planned2.batch.id,"concurrent plans must not duplicate batches");
  assert.equal(planned1.batch.status,"allocating");
  // DB freeze must reject post-plan R3 snapshot edits.
  const oneSnapshot = await db.miningDailyPowerSnapshot.findFirst({where:{emissionDayId:r3.day.id}});
  await assert.rejects(()=>db.miningDailyPowerSnapshot.update({where:{id:oneSnapshot.id},data:{effectiveMp:oneSnapshot.effectiveMp}}));

  const allSnapshots = await db.miningDailyPowerSnapshot.findMany({
    where:{emissionDayId:r3.day.id},orderBy:{activationId:"asc"},
  });
  const expected = allocateFrozenDailyRewards({
    reservedEmission:r3.day.reservedEmission,networkEffectiveMp:r3.day.qualifiedEffectiveMp,
    qualifiedActivationCount:r3.day.qualifiedActivationCount,
    snapshots:allSnapshots.map((x:any)=>({id:x.id,activationId:x.activationId,userId:x.userId,effectiveMp:x.effectiveMp.toString()})),
  });
  const initial = expected.allocations[0];
  // Simulated partial-materialization crash: one row persisted before retry.
  await db.miningRewardAllocation.create({data:{
    batchId:planned1.batch.id,powerSnapshotId:initial.powerSnapshotId,activationId:initial.activationId,
    userId:initial.userId,effectiveMp:initial.effectiveMp,rewardAmount:initial.rewardAmount,status:initial.status,
  }});
  const materialized = await r4MaterializeBatch(dayIso);
  assert.equal(materialized.batch.status,"ready");
  assert.equal((await r4MaterializeBatch(dayIso)).idempotentReplay,true);
  assert.equal(await db.miningRewardAllocation.count({where:{batchId:planned1.batch.id}}),3);
  assert.equal((await r4AuditDay(dayIso)).consistent,true);

  process.env.MINING_POWER_R4_ENABLE_CREDITS="0";
  await assert.rejects(()=>r4CreditChunk(dayIso,1),(e:any)=>e instanceof R4RewardError && e.code==="R4_CREDITS_DISABLED");
  process.env.MINING_POWER_R4_ENABLE_CREDITS="1";
  process.env.MINING_POWER_R4_POLICY_APPROVED="1";
  process.env.MINING_POWER_R4_LEDGER_DECIMALS="9";
  await db.miningProtocolConfig.update({where:{id:protocolId},data:{payoutProcessingPaused:true}});
  await assert.rejects(()=>r4CreditChunk(dayIso,1),(e:any)=>e instanceof R4RewardError && e.code==="R4_PAYOUT_PAUSED");
  await db.miningProtocolConfig.update({where:{id:protocolId},data:{payoutProcessingPaused:false}});

  process.env.MINING_POWER_R4_INJECT_ROLLBACK="1";
  await assert.rejects(()=>r4CreditChunk(dayIso,1),/R4_TEST_INJECTED_ROLLBACK/);
  assert.equal(await db.miningRewardLedger.count({where:{batchId:planned1.batch.id}}),0,"rolled-back credit must not produce ledger");
  assert.equal(await db.miningRewardAllocation.count({where:{batchId:planned1.batch.id,status:"credited"}}),0,"rolled-back credit must not claim allocations");
  assert.equal(await db.balance.count({where:{userId:{in:[u1,u2]}}}),0,"rolled-back credit must not create balances");
  process.env.MINING_POWER_R4_INJECT_ROLLBACK="0";

  // Concurrent one-row credit chunks: unique ledger + global lock guarantee once.
  await Promise.all([r4CreditChunk(dayIso,1),r4CreditChunk(dayIso,1)]);
  let latest=await r4AuditDay(dayIso);
  for (let i=0;latest.batch?.status!=="completed" && i<10;i++) {
    await r4CreditChunk(dayIso,1);
    latest=await r4AuditDay(dayIso);
  }
  assert.equal(latest.batch?.status,"completed");
  assert.equal(latest.consistent,true);
  assert.equal(latest.pendingCount,0);
  assert.equal(parseFixed18(latest.creditedAmount),parseFixed18(expected.allocatedEmission));
  const replay = await r4CreditChunk(dayIso,5);
  assert.equal(replay.idempotentReplay,true);
  assert.equal(replay.creditedInChunk,0);

  const allocations:any[] = await db.miningRewardAllocation.findMany({where:{batchId:planned1.batch.id}});
  for (const userId of [u1,u2]) {
    const amount = allocations.filter(a=>a.userId===userId).reduce((v,a)=>v+parseFixed18(a.rewardAmount.toString()),0n);
    const balance = await db.balance.findUnique({where:{userId}});
    assert.equal(parseFixed18(balance.miningBalance.toString()),amount);
    assert.equal(parseFixed18(balance.totalEarned.toString()),amount);
    assert.equal(balance.xnrtBalance.toString(),"0","R4 must not change spendable XNRT balance");
  }
  const emptyPlan = await r4PlanRewardBatch(emptyIso);
  assert.equal(emptyPlan.batch.allocatedEmission,"0");
  const emptyFinal = await r4MaterializeBatch(emptyIso);
  assert.equal(emptyFinal.batch.status,"completed");
  assert.equal((await r4AuditDay(emptyIso)).consistent,true);
  assert.equal((await r4Status()).totalBatches,2);
  console.log("Mining Power R4 integration: R3 handoff, resume, pause, rollback, concurrency, credits and reconciliation PASS.");
}

main().catch(e=>{ console.error(e); process.exitCode=1; }).finally(async()=>{
  try { await cleanup(); }
  catch (error) { console.error("R4 fixture cleanup FAILED; inspect local DB:",error); process.exitCode=1; }
  finally { await db.$disconnect(); }
});
