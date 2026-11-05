import assert from "node:assert/strict";
import {
  addCalendarMonthsUtcBoundary,
  applyEffectiveMpCap,
  calculateBaseMp,
  calculateDailyEffectiveMp,
  calculateExpirationBoundary,
  calculateGenesisMultiplierForRewardDay,
  calculateMultiplierFromBoostRate,
  calculateStaticWeightedMp,
  firstRewardBoundaryStrictlyAfter,
  isActivationEligibleForRewardDay,
  isUtcRewardBoundary,
} from "./calculations.ts";

const iso = (value: string) => new Date(value);

assert.equal(calculateBaseMp("500"), "500");
assert.equal(calculateMultiplierFromBoostRate("0.07"), "1.07");
assert.equal(
  calculateStaticWeightedMp({
    baseMp: "500",
    packageMultiplier: "1.07",
    durationMultiplier: "1.40",
  }),
  "749",
);

assert.equal(
  applyEffectiveMpCap({ baseMp: "500", rawEffectiveMp: "1260", maxEffectiveMpMultiplier: "2.50" }),
  "1250",
);
assert.equal(
  calculateDailyEffectiveMp({
    baseMp: "500",
    staticWeightedMp: "989.875",
    dynamicMultipliers: ["1.20", "1.10"],
    maxEffectiveMpMultiplier: "2.50",
  }),
  "1250",
);

assert.equal(
  firstRewardBoundaryStrictlyAfter(iso("2026-11-10T23:59:59.999Z")).toISOString(),
  "2026-11-11T00:00:00.000Z",
);
assert.equal(
  firstRewardBoundaryStrictlyAfter(iso("2026-11-10T00:00:00.000Z")).toISOString(),
  "2026-11-11T00:00:00.000Z",
);
assert.equal(isUtcRewardBoundary(iso("2026-11-11T00:00:00.000Z")), true);
assert.equal(isUtcRewardBoundary(iso("2026-11-11T00:00:00.001Z")), false);

assert.equal(
  calculateExpirationBoundary(iso("2026-11-11T00:00:00.000Z"), 1).toISOString(),
  "2026-12-11T00:00:00.000Z",
);
assert.equal(
  addCalendarMonthsUtcBoundary(iso("2027-01-31T00:00:00.000Z"), 1).toISOString(),
  "2027-02-28T00:00:00.000Z",
);
assert.equal(
  addCalendarMonthsUtcBoundary(iso("2028-01-31T00:00:00.000Z"), 1).toISOString(),
  "2028-02-29T00:00:00.000Z",
);

assert.equal(
  calculateGenesisMultiplierForRewardDay({
    rewardDayStart: iso("2026-11-20T00:00:00.000Z"),
    genesisEligible: true,
    genesisMultiplierSnapshot: "1.20",
    genesisBoostStartsAt: iso("2026-11-11T00:00:00.000Z"),
    genesisBoostEndsAt: iso("2027-05-10T00:00:00.000Z"),
  }),
  "1.2",
);
assert.equal(
  calculateGenesisMultiplierForRewardDay({
    rewardDayStart: iso("2027-05-10T00:00:00.000Z"),
    genesisEligible: true,
    genesisMultiplierSnapshot: "1.20",
    genesisBoostStartsAt: iso("2026-11-11T00:00:00.000Z"),
    genesisBoostEndsAt: iso("2027-05-10T00:00:00.000Z"),
  }),
  "1",
);

const activation = {
  status: "active",
  rewardEligibleFrom: iso("2026-11-11T00:00:00.000Z"),
  expiresAt: iso("2026-12-11T00:00:00.000Z"),
  exitedAt: null,
};
assert.equal(
  isActivationEligibleForRewardDay(activation, iso("2026-11-11T00:00:00.000Z")),
  true,
);
assert.equal(
  isActivationEligibleForRewardDay(activation, iso("2026-12-10T00:00:00.000Z")),
  true,
);
assert.equal(
  isActivationEligibleForRewardDay(activation, iso("2026-12-11T00:00:00.000Z")),
  false,
);
assert.equal(
  isActivationEligibleForRewardDay(
    { ...activation, exitedAt: iso("2026-11-20T00:00:00.000Z") },
    iso("2026-11-20T00:00:00.000Z"),
  ),
  false,
);

console.log("Mining Power R1 calculation tests passed.");
