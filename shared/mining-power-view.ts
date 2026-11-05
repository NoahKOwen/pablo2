/** R5 public/client DTOs. All token/MP values are decimal strings, never floats. */
export type MiningPowerPackageDTO = {
  code: string; name: string; activationAmountUsdt: string;
  baseMp: string; packageBoostRate: string; sortOrder: number;
};
export type MiningPowerDurationDTO = { months: number; multiplier: string };
export type MiningPowerCatalogDTO = {
  enabled: boolean; previewOnly: boolean; status: string; reason: string | null;
  termsVersion: string | null; protocolVersion: string | null;
  packages: MiningPowerPackageDTO[]; durations: MiningPowerDurationDTO[];
  guaranteed: false; settlementPolicy: "provisional";
};
export type MiningPowerActivationDTO = {
  id: string; packageCode: string; packageName: string; status: string;
  durationMonths: number; paymentAmountUsdt: string; baseMp: string;
  staticWeightedMp: string; packageMultiplier: string; durationMultiplier: string;
  createdAt: string; rewardEligibleFrom: string | null; expiresAt: string | null;
  exitedAt: string | null; exitRequestedAt: string | null;
  payment: { status: string; verified: boolean; confirmations: number; transactionHash: string | null } | null;
};
export type MiningPowerRewardDTO = {
  id: string; activationId: string; rewardDayUtc: string;
  effectiveMp: string; rewardAmount: string; status: "pending"|"credited"|"skipped";
  creditedAt: string | null; batchStatus: string;
};
export type MiningPowerPage<T> = { items: T[]; nextCursor: string | null; limit: number };
export type MiningPowerOverviewDTO = {
  activationCount: number; activeCount: number; eligibleBaseMp: string;
  latestSnapshotDayUtc: string | null; latestSnapshotEffectiveMp: string | null;
  allocatedPendingXnrt: string; creditedMiningPowerXnrt: string;
  pendingAllocationCount: number; creditedAllocationCount: number;
  nextUtcBoundary: string; source: "r2-r3-r4"; guaranteed: false;
};
export type MiningPowerNetworkDayDTO = {
  dayUtc: string; epoch: number; qualifiedBaseMp: string; qualifiedEffectiveMp: string;
  activeActivationCount: number; utilizationRatio: string;
  theoreticalCeiling: string; reservedEmission: string;
};
export type MiningPowerNetworkDTO = {
  enabled: boolean; protocolStatus: string; programStatus: string | null;
  policyStatus: "provisional"; timezone: "UTC"; guaranteed: false;
  poolCeiling: string | null; reservedTotal: string; creditedTotal: string;
  remainingUnreserved: string | null;
  latestDay: MiningPowerNetworkDayDTO | null; history: MiningPowerNetworkDayDTO[];
};
export type MiningPowerQuoteDTO = {
  protocolVersion: string; termsVersion: string; packageCode: string; packageName: string;
  durationMonths: number; activationAmountUsdt: string; baseMp: string;
  packageBoostRate: string; packageMultiplier: string; durationMultiplier: string;
  staticWeightedMp: string; paymentAsset: string; paymentNetwork: string;
  paymentAddress: string | null; guaranteed: false;
};
