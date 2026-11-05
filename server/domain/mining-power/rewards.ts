/**
 * R4 deterministic reward allocation over R3 FROZEN power snapshots.
 * BigInt fixed-18 calculations, with settlement quantized DOWN to policy's
 * 9-digit provisional ledger precision. Never uses JS floats for tokens/MP.
 * No database or wallet writes in this module.
 */
import { formatFixed18, parseFixed18 } from "./calculations.ts";

export const R4_CALCULATION_VERSION = "mining-power-r4-v1";
/** Provisional, not a final tokenomics decision. Live credits require explicit signoff. */
export const R4_LEDGER_DECIMALS = 9;
export const R4_MAX_SNAPSHOTS_PER_BATCH = 200_000;
const SCALE_18 = 10n ** 18n;
const MINING_POOL_CAP_18 = parseFixed18("150000000");

export interface RewardPowerSnapshot {
  id: string;
  activationId: string;
  userId: string;
  effectiveMp: string;
}
export interface RewardAllocation {
  powerSnapshotId: string;
  activationId: string;
  userId: string;
  effectiveMp: string;
  rewardAmount: string;
  status: "pending" | "skipped";
}

export function quantizeRewardDown(value: string, decimals = R4_LEDGER_DECIMALS) {
  if (decimals !== R4_LEDGER_DECIMALS) throw new Error("R4_SETTLEMENT_PRECISION_NOT_APPROVED");
  const parsed = parseFixed18(value);
  if (parsed < 0n || parsed > MINING_POOL_CAP_18) throw new Error("INVALID_R4_REWARD_CEILING");
  const quantum = 10n ** BigInt(18 - decimals);
  const units = parsed / quantum;
  return {
    amount: formatFixed18(units * quantum),
    dust: formatFixed18(parsed - units * quantum),
    units,
    quantum,
  };
}

export function allocateFrozenDailyRewards(params: {
  reservedEmission: string;
  networkEffectiveMp: string;
  qualifiedActivationCount: number;
  snapshots: readonly RewardPowerSnapshot[];
  ledgerDecimals?: number;
}): { allocations: RewardAllocation[]; allocatedEmission: string; dust: string; positiveCount: number } {
  const { amount: allocatedEmission, dust, units, quantum } = quantizeRewardDown(
    params.reservedEmission, params.ledgerDecimals ?? R4_LEDGER_DECIMALS,
  );
  const snaps = params.snapshots;
  if (!Number.isSafeInteger(params.qualifiedActivationCount) || params.qualifiedActivationCount < 0 ||
      snaps.length !== params.qualifiedActivationCount || snaps.length > R4_MAX_SNAPSHOTS_PER_BATCH) {
    throw new Error("R4_SNAPSHOT_COUNT_MISMATCH");
  }
  const expectedTotal = parseFixed18(params.networkEffectiveMp);
  if (expectedTotal < 0n) throw new Error("R4_NEGATIVE_NETWORK_POWER");

  const usedIds = new Set<string>();
  let powerSum = 0n;
  const entries = snaps.map(s => {
    if (!s.id || !s.activationId || !s.userId || usedIds.has(s.activationId)) {
      throw new Error("R4_DUPLICATE_OR_INVALID_ACTIVATION");
    }
    usedIds.add(s.activationId);
    const power = parseFixed18(s.effectiveMp);
    if (power <= 0n) throw new Error("R4_NONPOSITIVE_EFFECTIVE_MP");
    powerSum += power;
    return { ...s, power, floorUnits: 0n, fraction: 0n };
  });
  if (powerSum !== expectedTotal) throw new Error("R4_NETWORK_EFFECTIVE_MP_MISMATCH");
  if (units > 0n && expectedTotal === 0n) throw new Error("R4_ZERO_NETWORK_WITH_EMISSION");

  let distributedFloor = 0n;
  for (const item of entries) {
    if (units > 0n) {
      const numerator = units * item.power;
      item.floorUnits = numerator / expectedTotal;
      item.fraction = numerator % expectedTotal;
      distributedFloor += item.floorUnits;
    }
  }
  const leftover = units - distributedFloor;
  if (leftover < 0n || leftover > BigInt(entries.length)) {
    throw new Error("R4_REMAINDER_OUT_OF_RANGE");
  }
  // Largest remainder first, then immutable activation ID (ASCII ordering).
  const ranked = [...entries].sort((a, b) => {
    if (a.fraction !== b.fraction) return a.fraction > b.fraction ? -1 : 1;
    return a.activationId < b.activationId ? -1 : a.activationId > b.activationId ? 1 : 0;
  });
  for (let i = 0; i < Number(leftover); i++) ranked[i].floorUnits++;

  // Always insert in stable activationId order; never depend on input iteration order.
  entries.sort((a, b) => a.activationId < b.activationId ? -1 : a.activationId > b.activationId ? 1 : 0);
  const allocations: RewardAllocation[] = entries.map(item => ({
    powerSnapshotId: item.id,
    activationId: item.activationId,
    userId: item.userId,
    effectiveMp: formatFixed18(item.power),
    rewardAmount: formatFixed18(item.floorUnits * quantum),
    status: item.floorUnits > 0n ? "pending" : "skipped",
  }));
  const actualSum = entries.reduce((sum, entry) => sum + entry.floorUnits, 0n);
  if (actualSum !== units) throw new Error("R4_ALLOCATION_SUM_MISMATCH");
  return {
    allocations,
    allocatedEmission,
    dust,
    positiveCount: allocations.filter(a => a.status === "pending").length,
  };
}
