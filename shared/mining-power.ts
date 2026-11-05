/**
 * Mining Power v1 bootstrap defaults.
 *
 * Runtime financial authority lives in MiningProtocolConfig rows. These values
 * are only the initial R1 seed set for the frozen product rules.
 */
export const MINING_POWER_V1_DRAFT_VERSION = "mining-power-v1-draft" as const;
export const MINING_POWER_REWARD_TIMEZONE = "UTC" as const;

export const MINING_POWER_MAX_EFFECTIVE_MP_MULTIPLIER = "2.50" as const;
export const MINING_POWER_MAX_ECOSYSTEM_BOOST = "0.25" as const;

export type MiningPowerSeedPackage = {
  code: string;
  name: string;
  activationAmountUsdt: string;
  baseMp: string;
  packageBoostRate: string;
  sortOrder: number;
};

export const MINING_POWER_V1_SEED_PACKAGES: readonly MiningPowerSeedPackage[] = [
  { code: "starter", name: "Starter", activationAmountUsdt: "25", baseMp: "25", packageBoostRate: "0", sortOrder: 10 },
  { code: "basic", name: "Basic", activationAmountUsdt: "50", baseMp: "50", packageBoostRate: "0.01", sortOrder: 20 },
  { code: "standard", name: "Standard", activationAmountUsdt: "100", baseMp: "100", packageBoostRate: "0.03", sortOrder: 30 },
  { code: "silver", name: "Silver", activationAmountUsdt: "250", baseMp: "250", packageBoostRate: "0.05", sortOrder: 40 },
  { code: "gold", name: "Gold", activationAmountUsdt: "500", baseMp: "500", packageBoostRate: "0.07", sortOrder: 50 },
  { code: "platinum", name: "Platinum", activationAmountUsdt: "1000", baseMp: "1000", packageBoostRate: "0.10", sortOrder: 60 },
  { code: "diamond", name: "Diamond", activationAmountUsdt: "2500", baseMp: "2500", packageBoostRate: "0.12", sortOrder: 70 },
  { code: "elite", name: "Elite", activationAmountUsdt: "5000", baseMp: "5000", packageBoostRate: "0.15", sortOrder: 80 },
] as const;

export type MiningPowerSeedDuration = {
  months: number;
  multiplier: string;
};

export const MINING_POWER_V1_SEED_DURATIONS: readonly MiningPowerSeedDuration[] = [
  { months: 1, multiplier: "1.00" },
  { months: 3, multiplier: "1.08" },
  { months: 6, multiplier: "1.18" },
  { months: 12, multiplier: "1.40" },
  { months: 18, multiplier: "1.60" },
  { months: 24, multiplier: "1.85" },
  { months: 36, multiplier: "2.00" },
] as const;
