/** Mining Power R3 v1: deterministic seven-year, no-carry issuance ceiling.
 * No token credit, reward ledger or payout is performed here.
 */
import {
  calculateDailyEffectiveMp,
  calculateGenesisMultiplierForRewardDay,
  formatFixed18,
  isActivationEligibleForRewardDay,
  isUtcRewardBoundary,
  parseFixed18,
  type DecimalInput,
  type MiningActivationEligibilityInput,
} from "./calculations.ts";

const TOKEN_FIXED_SCALE = 10n ** 18n;
const MAX_MINING_POOL = parseFixed18("150000000"); // 15% provisional of 1B supply.
export const EMISSION_CALCULATION_VERSION = "mining-power-r3-v1";
export const R3_EPOCHS = [
  { number: 1, startMonth: 0, endMonth: 18, weightBps: 10_000n },
  { number: 2, startMonth: 18, endMonth: 42, weightBps: 8_500n },
  { number: 3, startMonth: 42, endMonth: 66, weightBps: 6_500n },
  { number: 4, startMonth: 66, endMonth: 84, weightBps: 4_000n },
] as const;

export function parseUtcDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("DAY_MUST_BE_YYYY_MM_DD");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!isUtcRewardBoundary(parsed) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error("INVALID_UTC_DAY");
  }
  return parsed;
}

export function assertGenesisAtMonthStart(genesis: Date): void {
  if (!Number.isFinite(genesis.getTime()) ||
      !isUtcRewardBoundary(genesis) || genesis.getUTCDate() !== 1) {
    throw new Error("GENESIS_MUST_BE_FIRST_OF_UTC_MONTH");
  }
}

export function utcMonthOffset(genesis: Date, months: number): Date {
  assertGenesisAtMonthStart(genesis);
  if (!Number.isInteger(months) || months < 0 || months > 84) throw new Error("INVALID_MONTH_OFFSET");
  return new Date(Date.UTC(genesis.getUTCFullYear(), genesis.getUTCMonth() + months, 1));
}

function daysBetween(a: Date, b: Date): bigint {
  const deltaMs = b.getTime() - a.getTime();
  if (deltaMs < 0 || deltaMs % 86_400_000 !== 0) throw new Error("INVALID_DAY_SPAN");
  return BigInt(deltaMs / 86_400_000);
}

export function emissionSchedule(genesisAt: Date) {
  assertGenesisAtMonthStart(genesisAt);
  const epochs = R3_EPOCHS.map((item) => {
    const startsAt = utcMonthOffset(genesisAt, item.startMonth);
    const endsAt = utcMonthOffset(genesisAt, item.endMonth);
    return {
      epochNumber: item.number,
      startsAt,
      endsAt,
      days: daysBetween(startsAt, endsAt),
      weightBps: item.weightBps,
    };
  });
  const weightedDaysBps = epochs.reduce((total, epoch) => total + epoch.days * epoch.weightBps, 0n);
  if (weightedDaysBps <= 0n) throw new Error("INVALID_EMISSION_EPOCHS");
  return { epochs, endsAt: epochs[epochs.length - 1].endsAt, weightedDaysBps };
}

export function requirePoolCap(poolTokens: DecimalInput): bigint {
  const pool = parseFixed18(poolTokens);
  if (pool <= 0n || pool > MAX_MINING_POOL) throw new Error("MINING_POOL_CAP_VIOLATION");
  return pool;
}

export function dailyEmissionCeiling(input: {
  genesisAt: Date;
  rewardDayStart: Date;
  rewardPoolTokens: DecimalInput;
}): { epochNumber: number; ceiling: string; totalWeightedDaysBps: string; termEndsAt: Date } {
  const { genesisAt, rewardDayStart } = input;
  if (!isUtcRewardBoundary(rewardDayStart)) throw new Error("DAY_NOT_UTC_BOUNDARY");
  const schedule = emissionSchedule(genesisAt);
  const epoch = schedule.epochs.find((it) =>
    rewardDayStart.getTime() >= it.startsAt.getTime() && rewardDayStart.getTime() < it.endsAt.getTime(),
  );
  if (!epoch) throw new Error("DAY_OUTSIDE_SEVEN_YEAR_TERM");
  const pool = requirePoolCap(input.rewardPoolTokens);
  // floor instead of round: the complete theoretical schedule never exceeds pool.
  const ceiling = pool * epoch.weightBps / schedule.weightedDaysBps;
  return {
    epochNumber: epoch.epochNumber,
    ceiling: formatFixed18(ceiling),
    totalWeightedDaysBps: schedule.weightedDaysBps.toString(),
    termEndsAt: schedule.endsAt,
  };
}

export function reserveDailyEmissionAmount(input: {
  theoreticalCeiling: DecimalInput;
  networkBaseMp: DecimalInput;
  fullEmissionBaseMpThreshold: DecimalInput;
}): { utilization: string; reserved: string } {
  const ceiling = parseFixed18(input.theoreticalCeiling);
  const base = parseFixed18(input.networkBaseMp);
  const threshold = parseFixed18(input.fullEmissionBaseMpThreshold);
  if (ceiling < 0n || base < 0n || threshold <= 0n) throw new Error("INVALID_EMISSION_INPUTS");
  const util = base >= threshold ? TOKEN_FIXED_SCALE : base * TOKEN_FIXED_SCALE / threshold;
  const reserved = ceiling * util / TOKEN_FIXED_SCALE;
  return { utilization: formatFixed18(util), reserved: formatFixed18(reserved) };
}

export type R3Activation = MiningActivationEligibilityInput & {
  id: string;
  userId: string;
  baseMp: string;
  staticWeightedMpSnapshot: string;
  genesisEligible: boolean;
  genesisMultiplierSnapshot: string;
  genesisBoostStartsAt: Date | null;
  genesisBoostEndsAt: Date | null;
};

export function effectiveMpForDay(activation: R3Activation, rewardDayStart: Date, cap: DecimalInput): {
  baseMp: string;
  effectiveMp: string;
  genesisMultiplier: string;
} {
  if (!isActivationEligibleForRewardDay(activation, rewardDayStart)) {
    throw new Error("ACTIVATION_NOT_ELIGIBLE_FOR_DAY");
  }
  const baseMpUnits = parseFixed18(activation.baseMp);
  if (baseMpUnits <= 0n) throw new Error("INVALID_ACTIVATION_BASE_MP");
  const genesisMultiplier = calculateGenesisMultiplierForRewardDay({
    rewardDayStart,
    genesisEligible: activation.genesisEligible,
    genesisMultiplierSnapshot: activation.genesisMultiplierSnapshot,
    genesisBoostStartsAt: activation.genesisBoostStartsAt,
    genesisBoostEndsAt: activation.genesisBoostEndsAt,
  });
  const effectiveMp = calculateDailyEffectiveMp({
    baseMp: activation.baseMp,
    staticWeightedMp: activation.staticWeightedMpSnapshot,
    dynamicMultipliers: [genesisMultiplier],
    maxEffectiveMpMultiplier: cap,
  });
  if (parseFixed18(effectiveMp) <= 0n) throw new Error("INVALID_EFFECTIVE_MP");
  return { baseMp: activation.baseMp, effectiveMp, genesisMultiplier };
}

export function assertDayClosed(day: Date, now: Date): void {
  if (!isUtcRewardBoundary(day)) throw new Error("DAY_NOT_UTC_BOUNDARY");
  if (day.getTime() + 86_400_000 > now.getTime()) throw new Error("DAY_NOT_YET_CLOSED");
}

export function isEmptyEmissionDay(networkEffectiveMp: string, reserved: string): boolean {
  const effective = parseFixed18(networkEffectiveMp);
  const emission = parseFixed18(reserved);
  if (effective < 0n || emission < 0n) throw new Error("INVALID_DAY_AMOUNTS");
  if (emission > 0n && effective === 0n) throw new Error("POSITIVE_EMISSION_WITH_ZERO_EFFECTIVE_MP");
  return emission === 0n;
}
