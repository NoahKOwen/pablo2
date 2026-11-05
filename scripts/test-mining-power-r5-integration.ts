/**
 * Local disposable PostgreSQL only. Creates fixture users/activations and one
 * R3/R4 pending allocation, tests read models and owner-scoped cursors, then
 * deletes ONLY the created test rows. No balance/ledger credits are produced.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../server/db/client";
import {
  r5Catalog, r5Network, r5UserActivations, r5UserOverview, r5UserRewards,
} from "../server/services/miningPowerViews";
const db=prisma as any;
const database=process.env.DATABASE_URL??"";
if (process.env.NODE_ENV==="production" || process.env.MINING_POWER_R5_INTEGRATION_TEST!=="1" ||
    !/^postgres(?:ql)?:\/\/[^/]+@127\.0\.0\.1:5433\/xnrt(?:\?|$)/.test(database)) {
  throw new Error("R5 integration requires explicit MINING_POWER_R5_INTEGRATION_TEST=1 and local 127.0.0.1:5433/xnrt");
}
const marker=randomUUID().slice(0,12);
const users:string[]=[];
const activations:string[]=[];
let programId:string|null=null, dayId:string|null=null, batchId:string|null=null;
async function cleanup(){
  if(batchId){
    await db.miningRewardLedger.deleteMany({where:{batchId}});
    await db.miningRewardAllocation.deleteMany({where:{batchId}});
    await db.miningRewardBatch.deleteMany({where:{id:batchId}});
  }
  if(dayId){
    await db.miningDailyPowerSnapshot.deleteMany({where:{emissionDayId:dayId}});
    await db.miningEmissionDay.deleteMany({where:{id:dayId}});
  }
  if(programId)await db.miningEmissionProgram.deleteMany({where:{id:programId}});
  if(activations.length)await db.miningActivation.deleteMany({where:{id:{in:activations}}});
  if(users.length)await db.user.deleteMany({where:{id:{in:users}}});
}
async function main(){
  const [programs,batches] = await Promise.all([db.miningEmissionProgram.count(),db.miningRewardBatch.count()]);
  if(programs!==0||batches!==0)throw new Error("R5 test requires disposable local DB with no R3 programs/R4 batches");
  const protocol=await db.miningProtocolConfig.findUnique({where:{version:"mining-power-v1-draft"}});
  if(!protocol||protocol.status!=="draft")throw new Error("Expected R1 draft protocol not found");
  const [pkg,duration] = await Promise.all([
    db.miningPackage.findFirst({where:{protocolConfigId:protocol.id,code:"starter"}}),
    db.miningDuration.findFirst({where:{protocolConfigId:protocol.id,months:1}}),
  ]);
  if(!pkg||!duration)throw new Error("R1 seeded package and duration missing");
  const config=await r5Catalog();
  assert.equal(config.previewOnly,true);
  assert.equal(config.enabled,false);
  assert.ok(config.packages.some(x=>x.code==="starter"));
  async function createUser(which:string){
    const row=await db.user.create({data:{
      email:`r5-${marker}-${which}@example.invalid`,username:`r5-${marker}-${which}`,
      passwordHash:"r5-integration-fixture",referralCode:`r5-${marker}-${which}`,emailVerified:true,
    }});
    users.push(row.id);return row.id as string;
  }
  async function createActivation(userId:string){
    const row=await db.miningActivation.create({data:{
      userId,protocolConfigId:protocol.id,packageId:pkg.id,durationId:duration.id,
      activationRequestId:randomUUID(),packageCodeSnapshot:pkg.code,packageNameSnapshot:pkg.name,
      paymentAsset:"USDT",paymentAmount:pkg.activationAmountUsdt,eligibleValueUsdt:pkg.activationAmountUsdt,
      activationAmountUsdtSnapshot:pkg.activationAmountUsdt,baseMp:pkg.baseMp,
      packageMultiplierSnapshot:"1",durationMultiplierSnapshot:duration.multiplier,
      staticWeightedMpSnapshot:pkg.baseMp,durationMonthsSnapshot:1,
      protocolVersion:protocol.version,termsVersion:protocol.termsVersion,status:"requested",
    }});
    activations.push(row.id);return row.id as string;
  }
  const owner=await createUser("owner"),other=await createUser("other");
  const a1=await createActivation(owner);await createActivation(owner);await createActivation(owner);
  await createActivation(other);
  const aPage1=await r5UserActivations(owner,"2",undefined);
  assert.equal(aPage1.items.length,2);
  assert.ok(aPage1.nextCursor);
  assert.equal((await r5UserActivations(owner,"2",aPage1.nextCursor)).items.length,1);
  assert.equal((await r5UserActivations(other,undefined,undefined)).items.length,1);
  await assert.rejects(()=>r5UserActivations(other,"2",aPage1.nextCursor),/Invalid page cursor/);
  assert.equal((await r5UserOverview(other)).activationCount,1);
  assert.equal((await r5UserOverview(owner)).activationCount,3);

  const program=await db.miningEmissionProgram.create({data:{
    protocolConfigId:protocol.id,genesisAt:new Date("2026-01-01T00:00:00.000Z"),termMonths:84,
    rewardPoolTokens:"150000000",fullEmissionBaseMpThreshold:"1000000",status:"draft",
    calculationVersion:"mining-power-r3-v1",
  }});
  programId=program.id;
  const day=await db.miningEmissionDay.create({data:{
    programId,dayUtc:new Date("2026-01-02T00:00:00.000Z"),epochNumber:1,
    theoreticalCeiling:"40000",qualifiedBaseMp:pkg.baseMp,qualifiedEffectiveMp:pkg.baseMp,
    qualifiedActivationCount:1,utilizationRatio:"0.000025",reservedEmission:"1",
    status:"reserved",calculationVersion:"mining-power-r3-v1",
  }});
  dayId=day.id;
  const snapshot=await db.miningDailyPowerSnapshot.create({data:{
    emissionDayId:dayId,activationId:a1,userId:owner,
    baseMp:pkg.baseMp,effectiveMp:pkg.baseMp,genesisMultiplier:"1",
  }});
  const batch=await db.miningRewardBatch.create({data:{
    emissionDayId:dayId,reservedEmission:"1",allocatedEmission:"1",unallocatedDust:"0",
    settlementDecimals:9,totalEffectiveMp:pkg.baseMp,allocationCount:1,status:"allocating",
    calculationVersion:"mining-power-r4-v1",
  }});
  batchId=batch.id;
  const allocation=await db.miningRewardAllocation.create({data:{
    batchId,powerSnapshotId:snapshot.id,activationId:a1,userId:owner,
    effectiveMp:pkg.baseMp,rewardAmount:"1",status:"pending",
  }});
  const ownedRewards=await r5UserRewards(owner,undefined,undefined);
  assert.equal(ownedRewards.items.length,1);
  assert.equal(ownedRewards.items[0].status,"pending");
  assert.equal(ownedRewards.items[0].rewardAmount,"1");
  assert.equal((await r5UserRewards(other,undefined,undefined)).items.length,0);
  await assert.rejects(()=>r5UserRewards(other,"5",allocation.id),/Invalid page cursor/);
  const overview=await r5UserOverview(owner);
  assert.equal(overview.allocatedPendingXnrt,"1");
  assert.equal(overview.creditedMiningPowerXnrt,"0");
  assert.equal(overview.latestSnapshotEffectiveMp,"25");
  const network=await r5Network();
  assert.equal(network.protocolStatus,"draft");
  assert.equal(network.enabled,false);
  assert.equal(network.reservedTotal,"1");
  assert.equal(network.creditedTotal,"0");
  assert.equal(network.latestDay?.activeActivationCount,1);
  assert.equal((network as any).userId,undefined,"network API must never expose a user identity");
  console.log("R5 local integration PASS: preview, isolated activation/reward cursors, dashboard, R3 and R4 read models");
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{
  try{await cleanup();}catch(error){console.error("R5 fixture cleanup FAILED",error);process.exitCode=1}
  finally{await db.$disconnect()}
});
