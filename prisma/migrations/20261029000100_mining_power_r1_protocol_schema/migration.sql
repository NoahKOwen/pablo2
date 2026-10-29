-- Mining Power R1 — Protocol Schema & Config
-- Product economics are frozen by R0; tokenomics-dependent values remain draft/versioned.

CREATE TABLE "MiningProtocolConfig" (
  "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
  "version" VARCHAR NOT NULL,
  "status" VARCHAR NOT NULL DEFAULT 'draft',
  "tokenomicsVersion" VARCHAR,
  "maxSupplySnapshot" DECIMAL(38,18),
  "miningAllocationPercentSnapshot" DECIMAL(8,4),
  "rewardPoolTokenAmount" DECIMAL(38,18) NOT NULL,
  "maxEffectiveMpMultiplier" DECIMAL(8,6) NOT NULL DEFAULT 2.500000,
  "maxEcosystemBoost" DECIMAL(8,6) NOT NULL DEFAULT 0.250000,
  "fullEmissionBaseMpThreshold" DECIMAL(38,18),
  "baseMpPerUsdt" DECIMAL(8,6) NOT NULL DEFAULT 1.000000,
  "rewardTimezone" VARCHAR NOT NULL DEFAULT 'UTC',
  "rewardBoundaryHourUtc" INTEGER NOT NULL DEFAULT 0,
  "termsVersion" VARCHAR NOT NULL DEFAULT 'mining-power-v1-r0',
  "activationPaused" BOOLEAN NOT NULL DEFAULT false,
  "emissionPaused" BOOLEAN NOT NULL DEFAULT false,
  "payoutProcessingPaused" BOOLEAN NOT NULL DEFAULT false,
  "claimsPaused" BOOLEAN NOT NULL DEFAULT false,
  "effectiveFrom" TIMESTAMP(6),
  "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MiningProtocolConfig_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mining_protocol_reward_pool_nonnegative" CHECK ("rewardPoolTokenAmount" >= 0),
  CONSTRAINT "mining_protocol_max_effective_multiplier_valid" CHECK ("maxEffectiveMpMultiplier" >= 1 AND "maxEffectiveMpMultiplier" <= 2.50),
  CONSTRAINT "mining_protocol_ecosystem_boost_valid" CHECK ("maxEcosystemBoost" >= 0 AND "maxEcosystemBoost" <= 0.25),
  CONSTRAINT "mining_protocol_allocation_percent_valid" CHECK ("miningAllocationPercentSnapshot" IS NULL OR ("miningAllocationPercentSnapshot" >= 0 AND "miningAllocationPercentSnapshot" <= 100)),
  CONSTRAINT "mining_protocol_threshold_positive" CHECK ("fullEmissionBaseMpThreshold" IS NULL OR "fullEmissionBaseMpThreshold" > 0),
  CONSTRAINT "mining_protocol_base_mp_rate_frozen" CHECK ("baseMpPerUsdt" = 1.000000),
  CONSTRAINT "mining_protocol_reward_timezone_frozen" CHECK ("rewardTimezone" = 'UTC'),
  CONSTRAINT "mining_protocol_reward_boundary_frozen" CHECK ("rewardBoundaryHourUtc" = 0),
  CONSTRAINT "mining_protocol_status_valid" CHECK ("status" IN ('draft','active','retired'))
);

CREATE UNIQUE INDEX "mining_protocol_config_version_unique" ON "MiningProtocolConfig"("version");
CREATE UNIQUE INDEX "mining_protocol_one_active_version" ON "MiningProtocolConfig"("status") WHERE "status" = 'active';
CREATE INDEX "mining_protocol_config_status_idx" ON "MiningProtocolConfig"("status");

CREATE TABLE "MiningPackage" (
  "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
  "protocolConfigId" VARCHAR NOT NULL,
  "code" VARCHAR NOT NULL,
  "name" VARCHAR NOT NULL,
  "activationAmountUsdt" DECIMAL(38,18) NOT NULL,
  "baseMp" DECIMAL(38,18) NOT NULL,
  "packageBoostRate" DECIMAL(8,6) NOT NULL DEFAULT 0,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MiningPackage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mining_package_activation_positive" CHECK ("activationAmountUsdt" > 0),
  CONSTRAINT "mining_package_base_mp_positive" CHECK ("baseMp" > 0),
  CONSTRAINT "mining_package_base_mp_one_to_one" CHECK ("baseMp" = "activationAmountUsdt"),
  CONSTRAINT "mining_package_boost_valid" CHECK ("packageBoostRate" >= 0 AND "packageBoostRate" <= 0.15)
);

CREATE UNIQUE INDEX "mining_packages_protocol_code_unique" ON "MiningPackage"("protocolConfigId", "code");
CREATE INDEX "mining_packages_enabled_sort_idx" ON "MiningPackage"("enabled", "sortOrder");
CREATE INDEX "mining_packages_protocol_idx" ON "MiningPackage"("protocolConfigId");

CREATE TABLE "MiningDuration" (
  "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
  "protocolConfigId" VARCHAR NOT NULL,
  "months" INTEGER NOT NULL,
  "multiplier" DECIMAL(8,6) NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MiningDuration_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mining_duration_months_positive" CHECK ("months" > 0),
  CONSTRAINT "mining_duration_multiplier_valid" CHECK ("multiplier" >= 1 AND "multiplier" <= 2.00)
);

CREATE UNIQUE INDEX "mining_durations_protocol_months_unique" ON "MiningDuration"("protocolConfigId", "months");
CREATE INDEX "mining_durations_enabled_months_idx" ON "MiningDuration"("enabled", "months");
CREATE INDEX "mining_durations_protocol_idx" ON "MiningDuration"("protocolConfigId");

CREATE TABLE "MiningActivation" (
  "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
  "userId" VARCHAR NOT NULL,
  "protocolConfigId" VARCHAR NOT NULL,
  "packageId" VARCHAR NOT NULL,
  "durationId" VARCHAR NOT NULL,
  "activationRequestId" VARCHAR NOT NULL,
  "paymentTransactionId" VARCHAR,
  "packageCodeSnapshot" VARCHAR NOT NULL,
  "packageNameSnapshot" VARCHAR NOT NULL,
  "paymentAsset" VARCHAR NOT NULL,
  "paymentAmount" DECIMAL(38,18) NOT NULL,
  "eligibleValueUsdt" DECIMAL(38,18) NOT NULL,
  "activationAmountUsdtSnapshot" DECIMAL(38,18) NOT NULL,
  "baseMp" DECIMAL(38,18) NOT NULL,
  "packageMultiplierSnapshot" DECIMAL(8,6) NOT NULL,
  "durationMultiplierSnapshot" DECIMAL(8,6) NOT NULL,
  "staticWeightedMpSnapshot" DECIMAL(38,18) NOT NULL,
  "durationMonthsSnapshot" INTEGER NOT NULL,
  "genesisEligible" BOOLEAN NOT NULL DEFAULT false,
  "genesisMultiplierSnapshot" DECIMAL(8,6) NOT NULL DEFAULT 1.000000,
  "genesisBoostStartsAt" TIMESTAMP(6),
  "genesisBoostEndsAt" TIMESTAMP(6),
  "paymentConfirmedAt" TIMESTAMP(6),
  "activatedAt" TIMESTAMP(6),
  "rewardEligibleFrom" TIMESTAMP(6),
  "expiresAt" TIMESTAMP(6),
  "exitRequestedAt" TIMESTAMP(6),
  "exitedAt" TIMESTAMP(6),
  "protocolVersion" VARCHAR NOT NULL,
  "termsVersion" VARCHAR NOT NULL,
  "status" VARCHAR NOT NULL DEFAULT 'requested',
  "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MiningActivation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mining_activation_payment_nonnegative" CHECK ("paymentAmount" >= 0),
  CONSTRAINT "mining_activation_eligible_value_nonnegative" CHECK ("eligibleValueUsdt" >= 0),
  CONSTRAINT "mining_activation_amount_positive" CHECK ("activationAmountUsdtSnapshot" > 0),
  CONSTRAINT "mining_activation_base_mp_positive" CHECK ("baseMp" > 0),
  CONSTRAINT "mining_activation_base_mp_matches_value" CHECK ("baseMp" = "eligibleValueUsdt"),
  CONSTRAINT "mining_activation_package_multiplier_positive" CHECK ("packageMultiplierSnapshot" > 0),
  CONSTRAINT "mining_activation_duration_multiplier_valid" CHECK ("durationMultiplierSnapshot" >= 1 AND "durationMultiplierSnapshot" <= 2.00),
  CONSTRAINT "mining_activation_static_mp_positive" CHECK ("staticWeightedMpSnapshot" > 0),
  CONSTRAINT "mining_activation_duration_months_positive" CHECK ("durationMonthsSnapshot" > 0),
  CONSTRAINT "mining_activation_genesis_multiplier_positive" CHECK ("genesisMultiplierSnapshot" > 0),
  CONSTRAINT "mining_activation_genesis_window_valid" CHECK ("genesisBoostEndsAt" IS NULL OR "genesisBoostStartsAt" IS NULL OR "genesisBoostEndsAt" > "genesisBoostStartsAt"),
  CONSTRAINT "mining_activation_reward_window_valid" CHECK ("expiresAt" IS NULL OR "rewardEligibleFrom" IS NULL OR "expiresAt" > "rewardEligibleFrom"),
  CONSTRAINT "mining_activation_status_valid" CHECK ("status" IN ('requested','payment_pending','payment_confirmed','active','completed','exited','cancelled','failed','refund_required'))
);

CREATE UNIQUE INDEX "mining_activations_request_unique" ON "MiningActivation"("activationRequestId");
CREATE UNIQUE INDEX "mining_activations_payment_transaction_unique" ON "MiningActivation"("paymentTransactionId");
CREATE INDEX "mining_activations_user_status_idx" ON "MiningActivation"("userId", "status");
CREATE INDEX "mining_activations_reward_window_idx" ON "MiningActivation"("status", "rewardEligibleFrom", "expiresAt");
CREATE INDEX "mining_activations_protocol_idx" ON "MiningActivation"("protocolConfigId");
CREATE INDEX "mining_activations_package_idx" ON "MiningActivation"("packageId");
CREATE INDEX "mining_activations_duration_idx" ON "MiningActivation"("durationId");

ALTER TABLE "MiningPackage"
  ADD CONSTRAINT "MiningPackage_protocolConfigId_fkey"
  FOREIGN KEY ("protocolConfigId") REFERENCES "MiningProtocolConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MiningDuration"
  ADD CONSTRAINT "MiningDuration_protocolConfigId_fkey"
  FOREIGN KEY ("protocolConfigId") REFERENCES "MiningProtocolConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MiningActivation"
  ADD CONSTRAINT "MiningActivation_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MiningActivation"
  ADD CONSTRAINT "MiningActivation_protocolConfigId_fkey"
  FOREIGN KEY ("protocolConfigId") REFERENCES "MiningProtocolConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MiningActivation"
  ADD CONSTRAINT "MiningActivation_packageId_fkey"
  FOREIGN KEY ("packageId") REFERENCES "MiningPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MiningActivation"
  ADD CONSTRAINT "MiningActivation_durationId_fkey"
  FOREIGN KEY ("durationId") REFERENCES "MiningDuration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MiningActivation"
  ADD CONSTRAINT "MiningActivation_paymentTransactionId_fkey"
  FOREIGN KEY ("paymentTransactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
