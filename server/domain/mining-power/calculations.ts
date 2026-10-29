const SCALE_DIGITS = 18;
const SCALE = 10n ** BigInt(SCALE_DIGITS);

export type DecimalInput = string | bigint;

function assertFiniteDecimalString(value: string): void {
  if (!/^-?\d+(?:\.\d+)?$/.test(value.trim())) {
    throw new Error(`Invalid decimal value: ${value}`);
  }
}

export function parseFixed18(value: DecimalInput): bigint {
  if (typeof value === "bigint") return value * SCALE;

  const raw = value.trim();
  assertFiniteDecimalString(raw);

  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const [wholePart, fractionPart = ""] = unsigned.split(".");

  if (fractionPart.length > SCALE_DIGITS) {
    throw new Error(`Decimal exceeds ${SCALE_DIGITS} fractional digits: ${value}`);
  }

  const fraction = (fractionPart + "0".repeat(SCALE_DIGITS)).slice(0, SCALE_DIGITS);
  const scaled = BigInt(wholePart) * SCALE + BigInt(fraction || "0");
  return negative ? -scaled : scaled;
}

export function formatFixed18(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / SCALE;
  const fractionRaw = (absolute % SCALE).toString().padStart(SCALE_DIGITS, "0");
  const fraction = fractionRaw.replace(/0+$/, "");
  const body = fraction.length > 0 ? `${whole}.${fraction}` : whole.toString();
  return negative ? `-${body}` : body;
}

function multiplyScaled(a: bigint, b: bigint): bigint {
  const product = a * b;
  const negative = product < 0n;
  const absolute = negative ? -product : product;
  let quotient = absolute / SCALE;
  const remainder = absolute % SCALE;
  if (remainder * 2n >= SCALE) quotient += 1n;
  return negative ? -quotient : quotient;
}

function requireNonNegative(name: string, value: bigint): void {
  if (value < 0n) throw new Error(`${name} must be non-negative`);
}

function requirePositive(name: string, value: bigint): void {
  if (value <= 0n) throw new Error(`${name} must be greater than zero`);
}


export function calculateMultiplierFromBoostRate(boostRate: DecimalInput): string {
  const rate = parseFixed18(boostRate);
  requireNonNegative("boostRate", rate);
  return formatFixed18(SCALE + rate);
}

export function calculateBaseMp(
  eligibleValueUsdt: DecimalInput,
  mpPerUsdt: DecimalInput = "1",
): string {
  const eligible = parseFixed18(eligibleValueUsdt);
  const rate = parseFixed18(mpPerUsdt);
  requireNonNegative("eligibleValueUsdt", eligible);
  requirePositive("mpPerUsdt", rate);
  return formatFixed18(multiplyScaled(eligible, rate));
}

export function calculateStaticWeightedMp(input: {
  baseMp: DecimalInput;
  packageMultiplier: DecimalInput;
  durationMultiplier: DecimalInput;
}): string {
  const base = parseFixed18(input.baseMp);
  const packageMultiplier = parseFixed18(input.packageMultiplier);
  const durationMultiplier = parseFixed18(input.durationMultiplier);

  requireNonNegative("baseMp", base);
  requirePositive("packageMultiplier", packageMultiplier);
  requirePositive("durationMultiplier", durationMultiplier);

  return formatFixed18(
    multiplyScaled(multiplyScaled(base, packageMultiplier), durationMultiplier),
  );
}

export function applyEffectiveMpCap(input: {
  baseMp: DecimalInput;
  rawEffectiveMp: DecimalInput;
  maxEffectiveMpMultiplier?: DecimalInput;
}): string {
  const base = parseFixed18(input.baseMp);
  const raw = parseFixed18(input.rawEffectiveMp);
  const capMultiplier = parseFixed18(input.maxEffectiveMpMultiplier ?? "2.50");

  requireNonNegative("baseMp", base);
  requireNonNegative("rawEffectiveMp", raw);
  requirePositive("maxEffectiveMpMultiplier", capMultiplier);

  const cap = multiplyScaled(base, capMultiplier);
  return formatFixed18(raw <= cap ? raw : cap);
}

export function calculateDailyEffectiveMp(input: {
  baseMp: DecimalInput;
  staticWeightedMp: DecimalInput;
  dynamicMultipliers?: readonly DecimalInput[];
  maxEffectiveMpMultiplier?: DecimalInput;
}): string {
  const base = parseFixed18(input.baseMp);
  let raw = parseFixed18(input.staticWeightedMp);

  requireNonNegative("baseMp", base);
  requireNonNegative("staticWeightedMp", raw);

  for (const multiplierInput of input.dynamicMultipliers ?? []) {
    const multiplier = parseFixed18(multiplierInput);
    requirePositive("dynamic multiplier", multiplier);
    raw = multiplyScaled(raw, multiplier);
  }

  return applyEffectiveMpCap({
    baseMp: formatFixed18(base),
    rawEffectiveMp: formatFixed18(raw),
    maxEffectiveMpMultiplier: input.maxEffectiveMpMultiplier ?? "2.50",
  });
}

export function isUtcRewardBoundary(value: Date): boolean {
  return (
    value.getUTCHours() === 0 &&
    value.getUTCMinutes() === 0 &&
    value.getUTCSeconds() === 0 &&
    value.getUTCMilliseconds() === 0
  );
}

/**
 * R0 strict-after rule: even a confirmation exactly at 00:00 UTC becomes
 * eligible at the following UTC boundary.
 */
export function firstRewardBoundaryStrictlyAfter(confirmedAt: Date): Date {
  if (Number.isNaN(confirmedAt.getTime())) throw new Error("Invalid confirmedAt date");
  return new Date(
    Date.UTC(
      confirmedAt.getUTCFullYear(),
      confirmedAt.getUTCMonth(),
      confirmedAt.getUTCDate() + 1,
      0,
      0,
      0,
      0,
    ),
  );
}

function daysInUtcMonth(year: number, monthZeroBased: number): number {
  return new Date(Date.UTC(year, monthZeroBased + 1, 0)).getUTCDate();
}

/**
 * Adds calendar months while preserving a UTC reward boundary and clamping the
 * day to the last valid day of the target month (e.g. Jan 31 -> Feb 28/29).
 */
export function addCalendarMonthsUtcBoundary(boundary: Date, months: number): Date {
  if (!isUtcRewardBoundary(boundary)) {
    throw new Error("boundary must be exactly 00:00:00.000 UTC");
  }
  if (!Number.isInteger(months) || months <= 0) {
    throw new Error("months must be a positive integer");
  }

  const sourceYear = boundary.getUTCFullYear();
  const sourceMonth = boundary.getUTCMonth();
  const sourceDay = boundary.getUTCDate();

  const targetIndex = sourceMonth + months;
  const targetYear = sourceYear + Math.floor(targetIndex / 12);
  const targetMonth = ((targetIndex % 12) + 12) % 12;
  const targetDay = Math.min(sourceDay, daysInUtcMonth(targetYear, targetMonth));

  return new Date(Date.UTC(targetYear, targetMonth, targetDay, 0, 0, 0, 0));
}

export function calculateExpirationBoundary(
  rewardEligibleFrom: Date,
  durationMonths: number,
): Date {
  return addCalendarMonthsUtcBoundary(rewardEligibleFrom, durationMonths);
}

export function calculateGenesisMultiplierForRewardDay(input: {
  rewardDayStart: Date;
  genesisEligible: boolean;
  genesisMultiplierSnapshot: DecimalInput;
  genesisBoostStartsAt: Date | null;
  genesisBoostEndsAt: Date | null;
}): string {
  if (!input.genesisEligible) return "1";
  if (!input.genesisBoostStartsAt || !input.genesisBoostEndsAt) return "1";

  const timestamp = input.rewardDayStart.getTime();
  if (
    timestamp >= input.genesisBoostStartsAt.getTime() &&
    timestamp < input.genesisBoostEndsAt.getTime()
  ) {
    const multiplier = parseFixed18(input.genesisMultiplierSnapshot);
    requirePositive("genesisMultiplierSnapshot", multiplier);
    return formatFixed18(multiplier);
  }

  return "1";
}

export type MiningActivationEligibilityInput = {
  status: string;
  rewardEligibleFrom: Date | null;
  expiresAt: Date | null;
  exitedAt: Date | null;
};

/**
 * Canonical R0 eligible-set predicate. The same predicate must drive Base MP
 * utilization and reward participation in later patches.
 */
export function isActivationEligibleForRewardDay(
  activation: MiningActivationEligibilityInput,
  rewardDayStart: Date,
): boolean {
  if (!isUtcRewardBoundary(rewardDayStart)) {
    throw new Error("rewardDayStart must be exactly 00:00:00.000 UTC");
  }
  if (activation.status !== "active") return false;
  if (!activation.rewardEligibleFrom || !activation.expiresAt) return false;

  const day = rewardDayStart.getTime();
  if (activation.rewardEligibleFrom.getTime() > day) return false;
  if (activation.expiresAt.getTime() <= day) return false;
  if (activation.exitedAt && activation.exitedAt.getTime() <= day) return false;

  return true;
}
