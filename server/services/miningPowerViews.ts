/**
 * Mining Power R5 read model. No writes, payouts, reward calculation, activation
 * processing, secrets or administrative mutators. R2/R3/R4 are authorities.
 */
import { prisma } from "../db/client";
import { formatFixed18, parseFixed18 } from "../domain/mining-power/calculations.ts";
import {
  MiningPowerViewInputError,
  r5CursorFilter, r5Decimal, r5Iso, r5NextBoundary,
  r5PageCursor, r5PageSize,
} from "../domain/mining-power/view-contract.ts";
import type {
  MiningPowerActivationDTO, MiningPowerCatalogDTO,
  MiningPowerNetworkDTO, MiningPowerNetworkDayDTO,
  MiningPowerOverviewDTO, MiningPowerPage, MiningPowerRewardDTO,
} from "../../shared/mining-power-view";

const db = prisma as any;
function readTime(now = new Date()) { return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())); }
function jsonDate(value: Date | null | undefined): string { return r5Iso(value) ?? ""; }

async function publishedProtocol(now = new Date()) {
  const active = await db.miningProtocolConfig.findFirst({
    where: { status: "active", OR: [{effectiveFrom:null},{effectiveFrom:{lte:now}}] },
    orderBy: {createdAt:"desc"},
  });
  return active ?? db.miningProtocolConfig.findFirst({orderBy:{createdAt:"desc"}});
}

/** Public preview: packages are DISPLAY ONLY until R1/R2 makes protocol active. */
export async function r5Catalog(): Promise<MiningPowerCatalogDTO> {
  const config = await publishedProtocol();
  if (!config) return {
    enabled: false, previewOnly:true, status:"unconfigured", reason:"NO_PROTOCOL",
    termsVersion:null,protocolVersion:null,packages:[],durations:[],guaranteed:false,settlementPolicy:"provisional",
  };
  const [packages,durations,emissionProgram] = await Promise.all([
    db.miningPackage.findMany({
      where:{protocolConfigId:config.id,enabled:true},
      select:{code:true,name:true,activationAmountUsdt:true,baseMp:true,packageBoostRate:true,sortOrder:true},
      orderBy:[{sortOrder:"asc"},{activationAmountUsdt:"asc"}],
    }),
    db.miningDuration.findMany({
      where:{protocolConfigId:config.id,enabled:true},
      select:{months:true,multiplier:true},orderBy:{months:"asc"},
    }),
    db.miningEmissionProgram.findUnique({
      where:{protocolConfigId:config.id},select:{status:true},
    }),
  ]);
  // R5 never enables paid activation merely because R2 config is active.
  // Real financial activation needs explicit tokenomics and R3 readiness.
  const protocolActive=config.status==="active" && !config.activationPaused &&
    (config.effectiveFrom == null || config.effectiveFrom <= new Date());
  const active = protocolActive && emissionProgram?.status==="active" &&
    !config.emissionPaused && !config.payoutProcessingPaused &&
    process.env.MINING_POWER_R5_ENABLE_ACTIVATION_UI==="1" &&
    process.env.MINING_POWER_R5_POLICY_APPROVED==="1";
  const reason=active?null:
    config.status!=="active"?"PROTOCOL_NOT_ACTIVE":
    config.effectiveFrom && config.effectiveFrom>new Date()?"PROTOCOL_NOT_EFFECTIVE":
    config.activationPaused?"ACTIVATION_PAUSED":
    !emissionProgram||emissionProgram.status!=="active"?"EMISSION_PROGRAM_NOT_ACTIVE":
    config.emissionPaused?"EMISSION_PAUSED":
    config.payoutProcessingPaused?"PAYOUT_PAUSED":"LAUNCH_NOT_APPROVED";
  return {
    enabled:active,previewOnly:!active,status:config.status,
    reason,
    termsVersion:config.termsVersion,protocolVersion:config.version,
    packages:packages.map((p:any)=>({
      code:p.code,name:p.name,activationAmountUsdt:r5Decimal(p.activationAmountUsdt),
      baseMp:r5Decimal(p.baseMp),packageBoostRate:r5Decimal(p.packageBoostRate),sortOrder:p.sortOrder,
    })),
    durations:durations.map((d:any)=>({months:d.months,multiplier:r5Decimal(d.multiplier)})),
    guaranteed:false,settlementPolicy:"provisional",
  };
}

/** Authenticated overview restricted to req.authUser.id at the route boundary. */
export async function r5UserOverview(userId: string): Promise<MiningPowerOverviewDTO> {
  const boundary=readTime();
  const eligibleWhere = {
    userId,status:"active",rewardEligibleFrom:{lte:boundary},expiresAt:{gt:boundary},
    OR:[{exitedAt:null},{exitedAt:{gt:boundary}}],
  };
  const [allCount, activeCount, eligible, pending, credited, last] = await Promise.all([
    db.miningActivation.count({where:{userId}}),
    db.miningActivation.count({where:{userId,status:"active"}}),
    db.miningActivation.aggregate({where:eligibleWhere,_sum:{baseMp:true}}),
    db.miningRewardAllocation.aggregate({where:{userId,status:"pending"},_sum:{rewardAmount:true},_count:{_all:true}}),
    db.miningRewardLedger.aggregate({where:{userId},_sum:{amount:true},_count:{_all:true}}),
    db.miningDailyPowerSnapshot.findFirst({
      where:{userId},orderBy:{emissionDay:{dayUtc:"desc"}},
      select:{emissionDayId:true,emissionDay:{select:{dayUtc:true}}},
    }),
  ]);
  const latest = last ? await db.miningDailyPowerSnapshot.aggregate({
    where:{userId,emissionDayId:last.emissionDayId},_sum:{effectiveMp:true},
  }) : null;
  return {
    activationCount:allCount,activeCount,eligibleBaseMp:r5Decimal(eligible._sum.baseMp),
    latestSnapshotDayUtc:last?jsonDate(last.emissionDay.dayUtc):null,
    latestSnapshotEffectiveMp:latest?r5Decimal(latest._sum.effectiveMp):null,
    allocatedPendingXnrt:r5Decimal(pending._sum.rewardAmount),
    creditedMiningPowerXnrt:r5Decimal(credited._sum.amount),
    pendingAllocationCount:pending._count._all,creditedAllocationCount:credited._count._all,
    nextUtcBoundary:r5NextBoundary(new Date()),source:"r2-r3-r4",guaranteed:false,
  };
}

/** Keyset pagination; anchor validation and EVERY query retain explicit owner scope. */
async function ownedAnchor(model: any, userId: string, rawCursor: unknown) {
  const cursor = r5PageCursor(rawCursor);
  if (!cursor) return null;
  const anchor = await model.findFirst({where:{id:cursor,userId},select:{id:true,createdAt:true}});
  if (!anchor) throw new MiningPowerViewInputError("Invalid page cursor");
  return anchor as {id:string;createdAt:Date};
}
export async function r5UserActivations(userId:string, rawLimit:unknown, rawCursor:unknown):Promise<MiningPowerPage<MiningPowerActivationDTO>> {
  const limit=r5PageSize(rawLimit);
  const anchor=await ownedAnchor(db.miningActivation,userId,rawCursor);
  const rows:any[]=await db.miningActivation.findMany({
    where:r5CursorFilter(anchor,userId),
    orderBy:[{createdAt:"desc"},{id:"desc"}],take:limit+1,
    select:{
      id:true,packageCodeSnapshot:true,packageNameSnapshot:true,status:true,durationMonthsSnapshot:true,
      paymentAmount:true,baseMp:true,staticWeightedMpSnapshot:true,
      packageMultiplierSnapshot:true,durationMultiplierSnapshot:true,
      createdAt:true,rewardEligibleFrom:true,expiresAt:true,exitedAt:true,exitRequestedAt:true,
      paymentTransaction:{select:{status:true,verified:true,confirmations:true,transactionHash:true}},
    },
  });
  const hasMore=rows.length>limit;
  const page=rows.slice(0,limit);
  return {
    items:page.map(a=>({
      id:a.id,packageCode:a.packageCodeSnapshot,packageName:a.packageNameSnapshot,status:a.status,
      durationMonths:a.durationMonthsSnapshot,paymentAmountUsdt:r5Decimal(a.paymentAmount),
      baseMp:r5Decimal(a.baseMp),staticWeightedMp:r5Decimal(a.staticWeightedMpSnapshot),
      packageMultiplier:r5Decimal(a.packageMultiplierSnapshot),durationMultiplier:r5Decimal(a.durationMultiplierSnapshot),
      createdAt:jsonDate(a.createdAt),rewardEligibleFrom:r5Iso(a.rewardEligibleFrom),
      expiresAt:r5Iso(a.expiresAt),exitedAt:r5Iso(a.exitedAt),exitRequestedAt:r5Iso(a.exitRequestedAt),
      payment:a.paymentTransaction?{
        status:a.paymentTransaction.status,verified:a.paymentTransaction.verified,
        confirmations:a.paymentTransaction.confirmations,transactionHash:a.paymentTransaction.transactionHash,
      }:null,
    })),
    nextCursor:hasMore&&page.length?page[page.length-1].id:null,limit,
  };
}
export async function r5UserRewards(userId:string,rawLimit:unknown,rawCursor:unknown):Promise<MiningPowerPage<MiningPowerRewardDTO>> {
  const limit=r5PageSize(rawLimit);
  const anchor=await ownedAnchor(db.miningRewardAllocation,userId,rawCursor);
  const rows:any[]=await db.miningRewardAllocation.findMany({
    where:r5CursorFilter(anchor,userId),
    orderBy:[{createdAt:"desc"},{id:"desc"}],take:limit+1,
    select:{
      id:true,activationId:true,effectiveMp:true,rewardAmount:true,status:true,creditedAt:true,
      batch:{select:{status:true,emissionDay:{select:{dayUtc:true}}}},
    },
  });
  const hasMore=rows.length>limit;
  const page=rows.slice(0,limit);
  return {
    items:page.map(a=>({
      id:a.id,activationId:a.activationId,rewardDayUtc:jsonDate(a.batch.emissionDay.dayUtc),
      effectiveMp:r5Decimal(a.effectiveMp),rewardAmount:r5Decimal(a.rewardAmount),
      status:a.status,creditedAt:r5Iso(a.creditedAt),batchStatus:a.batch.status,
    })),
    nextCursor:hasMore&&page.length?page[page.length-1].id:null,limit,
  };
}
function viewDay(d:any):MiningPowerNetworkDayDTO {
  return {
    dayUtc:jsonDate(d.dayUtc),epoch:d.epochNumber,
    qualifiedBaseMp:r5Decimal(d.qualifiedBaseMp),qualifiedEffectiveMp:r5Decimal(d.qualifiedEffectiveMp),
    activeActivationCount:d.qualifiedActivationCount,utilizationRatio:r5Decimal(d.utilizationRatio),
    theoreticalCeiling:r5Decimal(d.theoreticalCeiling),reservedEmission:r5Decimal(d.reservedEmission),
  };
}
/** Only aggregate network facts. No user IDs, hashes, proof, wallets or admin config. */
export async function r5Network():Promise<MiningPowerNetworkDTO> {
  const protocol=await publishedProtocol();
  const program=protocol?await db.miningEmissionProgram.findUnique({where:{protocolConfigId:protocol.id}}):null;
  const empty:MiningPowerNetworkDTO={
    enabled:false,protocolStatus:protocol?.status??"unconfigured",programStatus:program?.status??null,
    policyStatus:"provisional",timezone:"UTC",guaranteed:false,
    poolCeiling:null,reservedTotal:"0",creditedTotal:"0",remainingUnreserved:null,latestDay:null,history:[],
  };
  if (!program) return empty;
  const [days,reserved,credited]=await Promise.all([
    db.miningEmissionDay.findMany({
      where:{programId:program.id,status:"reserved"},
      orderBy:{dayUtc:"desc"},take:30,
      select:{dayUtc:true,epochNumber:true,qualifiedBaseMp:true,qualifiedEffectiveMp:true,
        qualifiedActivationCount:true,utilizationRatio:true,theoreticalCeiling:true,reservedEmission:true},
    }),
    db.miningEmissionDay.aggregate({where:{programId:program.id,status:"reserved"},_sum:{reservedEmission:true}}),
    db.miningRewardLedger.aggregate({
      where:{batch:{is:{emissionDay:{is:{programId:program.id}}}}},_sum:{amount:true},
    }),
  ]);
  // Public transparency must not introduce Decimal.js significant-digit rounding.
  // R1 fixed-18 BigInt helpers are read-only and preserve the exact pool delta.
  const remaining=parseFixed18(r5Decimal(program.rewardPoolTokens))-
    parseFixed18(r5Decimal(reserved._sum.reservedEmission));
  return {
    ...empty,
    enabled:protocol?.status==="active"&&program.status==="active"&&!!days.length,
    poolCeiling:r5Decimal(program.rewardPoolTokens),
    reservedTotal:r5Decimal(reserved._sum.reservedEmission),creditedTotal:r5Decimal(credited._sum.amount),
    remainingUnreserved:remaining>=0n?formatFixed18(remaining):null,
    latestDay:days[0]?viewDay(days[0]):null,
    history:days.map(viewDay).reverse(),
  };
}
