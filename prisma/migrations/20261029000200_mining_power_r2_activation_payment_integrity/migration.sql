-- Mining Power R2 — Activation & Payment Integrity
-- Dedicated Mining Power payments + transactional outbox foundation.

CREATE TABLE "OutboxEvent" (
  "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
  "type" VARCHAR NOT NULL,
  "aggregateType" VARCHAR NOT NULL,
  "aggregateId" VARCHAR NOT NULL,
  "dedupeKey" VARCHAR NOT NULL,
  "payload" JSONB NOT NULL,
  "status" VARCHAR NOT NULL DEFAULT 'pending',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(6),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "outbox_event_status_valid" CHECK ("status" IN ('pending','processing','processed','failed','dead_letter')),
  CONSTRAINT "outbox_event_attempt_count_nonnegative" CHECK ("attemptCount" >= 0)
);

CREATE UNIQUE INDEX "outbox_events_dedupe_key_unique" ON "OutboxEvent"("dedupeKey");
CREATE INDEX "outbox_events_status_available_idx" ON "OutboxEvent"("status", "availableAt");
CREATE INDEX "outbox_events_aggregate_idx" ON "OutboxEvent"("aggregateType", "aggregateId");

-- R2 v1 activation payments are USDT-only and package-price exact.
ALTER TABLE "MiningActivation"
  ADD CONSTRAINT "mining_activation_payment_asset_usdt_v1"
  CHECK ("paymentAsset" = 'USDT');

ALTER TABLE "MiningActivation"
  ADD CONSTRAINT "mining_activation_payment_matches_package"
  CHECK ("paymentAmount" = "activationAmountUsdtSnapshot");

ALTER TABLE "MiningActivation"
  ADD CONSTRAINT "mining_activation_eligible_value_matches_package"
  CHECK ("eligibleValueUsdt" = "activationAmountUsdtSnapshot");

-- An activation that can participate in reward accounting must have a confirmed
-- payment and a complete reward window.
ALTER TABLE "MiningActivation"
  ADD CONSTRAINT "mining_activation_active_lifecycle_complete"
  CHECK (
    "status" NOT IN ('active','completed','exited')
    OR (
      "paymentTransactionId" IS NOT NULL
      AND "paymentConfirmedAt" IS NOT NULL
      AND "activatedAt" IS NOT NULL
      AND "rewardEligibleFrom" IS NOT NULL
      AND "expiresAt" IS NOT NULL
    )
  );

ALTER TABLE "MiningActivation"
  ADD CONSTRAINT "mining_activation_payment_pending_linked"
  CHECK ("status" <> 'payment_pending' OR "paymentTransactionId" IS NOT NULL);

ALTER TABLE "MiningActivation"
  ADD CONSTRAINT "mining_activation_exit_pair_valid"
  CHECK (
    ("exitRequestedAt" IS NULL AND "exitedAt" IS NULL)
    OR (
      "exitRequestedAt" IS NOT NULL
      AND "exitedAt" IS NOT NULL
      AND "exitedAt" > "exitRequestedAt"
    )
  );

ALTER TABLE "MiningActivation"
  ADD CONSTRAINT "mining_activation_reward_eligible_boundary"
  CHECK (
    "rewardEligibleFrom" IS NULL
    OR "rewardEligibleFrom" = date_trunc('day', "rewardEligibleFrom")
  );

ALTER TABLE "MiningActivation"
  ADD CONSTRAINT "mining_activation_expiry_boundary"
  CHECK (
    "expiresAt" IS NULL
    OR "expiresAt" = date_trunc('day', "expiresAt")
  );

ALTER TABLE "MiningActivation"
  ADD CONSTRAINT "mining_activation_exit_boundary"
  CHECK (
    "exitedAt" IS NULL
    OR "exitedAt" = date_trunc('day', "exitedAt")
  );
