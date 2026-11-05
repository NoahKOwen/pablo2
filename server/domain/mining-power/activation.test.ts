import assert from "node:assert/strict";
import {
  assertSameIdempotentActivationRequest,
  buildActivationPowerSnapshot,
  normalizeActivationRequestId,
  normalizeBscTransactionHash,
  normalizeOptionalProofImageUrl,
} from "./activation.ts";

assert.equal(
  normalizeActivationRequestId("mining-r2-request-0001"),
  "mining-r2-request-0001",
);
assert.throws(() => normalizeActivationRequestId("short"));

const upperHash = `0x${"AB".repeat(32)}`;
assert.equal(normalizeBscTransactionHash(upperHash), `0x${"ab".repeat(32)}`);
assert.throws(() => normalizeBscTransactionHash("0x1234"));

assert.equal(normalizeOptionalProofImageUrl(undefined), undefined);
assert.equal(
  normalizeOptionalProofImageUrl("https://example.com/proof.png"),
  "https://example.com/proof.png",
);
assert.throws(() => normalizeOptionalProofImageUrl("javascript:alert(1)"));

assert.deepEqual(
  buildActivationPowerSnapshot({
    activationAmountUsdt: "500",
    packageBoostRate: "0.07",
    durationMultiplier: "1.40",
  }),
  {
    baseMp: "500",
    packageMultiplier: "1.07",
    durationMultiplier: "1.40",
    staticWeightedMp: "749",
  },
);

assert.doesNotThrow(() =>
  assertSameIdempotentActivationRequest({
    existingUserId: "u1",
    requestingUserId: "u1",
    existingPackageCode: "gold",
    requestedPackageCode: "gold",
    existingDurationMonths: 12,
    requestedDurationMonths: 12,
    existingTransactionHash: `0x${"11".repeat(32)}`,
    requestedTransactionHash: `0x${"11".repeat(32)}`,
  }),
);
assert.throws(
  () =>
    assertSameIdempotentActivationRequest({
      existingUserId: "u1",
      requestingUserId: "u1",
      existingPackageCode: "gold",
      requestedPackageCode: "elite",
      existingDurationMonths: 12,
      requestedDurationMonths: 12,
      existingTransactionHash: `0x${"11".repeat(32)}`,
      requestedTransactionHash: `0x${"11".repeat(32)}`,
    }),
  /DIFFERENT_PAYLOAD/,
);

console.log("Mining Power R2 activation helper tests passed.");
