import {
  calculateBaseMp,
  calculateMultiplierFromBoostRate,
  calculateStaticWeightedMp,
  type DecimalInput,
} from "./calculations.ts";

export const MINING_POWER_PAYMENT_ASSET = "USDT" as const;
export const MINING_POWER_TRANSACTION_TYPE = "mining_activation" as const;
export const MINING_POWER_TRANSACTION_SOURCE = "mining_power" as const;

const REQUEST_ID_RE = /^[A-Za-z0-9._:-]{16,128}$/;
const BSC_TX_HASH_RE = /^0x[a-f0-9]{64}$/;

export function normalizeActivationRequestId(value: unknown): string {
  const requestId = String(value ?? "").trim();
  if (!REQUEST_ID_RE.test(requestId)) {
    throw new Error(
      "activationRequestId must be 16-128 characters using letters, numbers, '.', '_', ':', or '-'",
    );
  }
  return requestId;
}

export function normalizeBscTransactionHash(value: unknown): string {
  const transactionHash = String(value ?? "").trim().toLowerCase();
  if (!BSC_TX_HASH_RE.test(transactionHash)) {
    throw new Error("Invalid BSC transaction hash format");
  }
  return transactionHash;
}

export function normalizeOptionalProofImageUrl(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const proof = String(value).trim();
  if (proof.length > 2_000_000) {
    throw new Error("Proof image payload is too large");
  }
  const isBase64DataUrl = proof.startsWith("data:image/");
  const isValidUrl = /^https?:\/\//i.test(proof);
  if (!isBase64DataUrl && !isValidUrl) {
    throw new Error("Invalid proof image URL format");
  }
  return proof;
}

export function buildActivationPowerSnapshot(input: {
  activationAmountUsdt: DecimalInput;
  baseMpPerUsdt?: DecimalInput;
  packageBoostRate: DecimalInput;
  durationMultiplier: DecimalInput;
}) {
  const baseMp = calculateBaseMp(
    input.activationAmountUsdt,
    input.baseMpPerUsdt ?? "1",
  );
  const packageMultiplier = calculateMultiplierFromBoostRate(input.packageBoostRate);
  const staticWeightedMp = calculateStaticWeightedMp({
    baseMp,
    packageMultiplier,
    durationMultiplier: input.durationMultiplier,
  });

  return {
    baseMp,
    packageMultiplier,
    durationMultiplier: String(input.durationMultiplier),
    staticWeightedMp,
  };
}

export function assertSameIdempotentActivationRequest(input: {
  existingUserId: string;
  requestingUserId: string;
  existingPackageCode: string;
  requestedPackageCode: string;
  existingDurationMonths: number;
  requestedDurationMonths: number;
  existingTransactionHash: string | null | undefined;
  requestedTransactionHash: string;
}): void {
  if (input.existingUserId !== input.requestingUserId) {
    throw new Error("ACTIVATION_REQUEST_ID_OWNED_BY_ANOTHER_USER");
  }

  const samePayload =
    input.existingPackageCode === input.requestedPackageCode &&
    input.existingDurationMonths === input.requestedDurationMonths &&
    (input.existingTransactionHash ?? "").toLowerCase() ===
      input.requestedTransactionHash.toLowerCase();

  if (!samePayload) {
    throw new Error("ACTIVATION_REQUEST_ID_REUSED_WITH_DIFFERENT_PAYLOAD");
  }
}
