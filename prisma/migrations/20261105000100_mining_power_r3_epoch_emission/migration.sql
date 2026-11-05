-- Mining Power R3 — Seven-Year Epoch & Emission reservation (NOT token issuance).
-- Does not alter R1/R2 financial records, payment approval, or reward balances.
-- No default program is inserted or activated. No existing activations are modified.

CREATE TABLE "MiningEmissionProgram" (
  "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
  "protocolConfigId" VARCHAR NOT NULL,
  "genesisAt" TIMESTAMP(6) NOT NULL,
  "termMonths" INTEGER NOT NULL DEFAULT 84,
  "rewardPoolTokens" DECIMAL(38,18) NOT NULL,
  "fullEmissionBaseMpThreshold" DECIMAL(38,18) NOT NULL,
  "status" VARCHAR NOT NULL DEFAULT 'draft',
  "calculationVersion" VARCHAR NOT NULL DEFAULT 'mining-power-r3-v1',
  "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MiningEmissionProgram_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mining_emission_program_term_84" CHECK ("termMonths" = 84),
  CONSTRAINT "mining_emission_program_genesis_month_utc" CHECK ("genesisAt" = date_trunc('month', "genesisAt")),
  CONSTRAINT "mining_emission_program_pool_cap" CHECK ("rewardPoolTokens" > 0 AND "rewardPoolTokens" <= 150000000),
  CONSTRAINT "mining_emission_program_threshold_positive" CHECK ("fullEmissionBaseMpThreshold" > 0),
  CONSTRAINT "mining_emission_program_status_valid" CHECK ("status" IN ('draft','active','paused','retired')),
  CONSTRAINT "mining_emission_program_calculation_version" CHECK ("calculationVersion" = 'mining-power-r3-v1')
);
CREATE UNIQUE INDEX "mining_emission_program_protocol_unique" ON "MiningEmissionProgram"("protocolConfigId");
CREATE UNIQUE INDEX "mining_emission_one_active_program" ON "MiningEmissionProgram"("status") WHERE "status" = 'active';
CREATE INDEX "mining_emission_program_status_idx" ON "MiningEmissionProgram"("status");
ALTER TABLE "MiningEmissionProgram" ADD CONSTRAINT "MiningEmissionProgram_protocolConfigId_fkey"
  FOREIGN KEY ("protocolConfigId") REFERENCES "MiningProtocolConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "MiningEmissionDay" (
  "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
  "programId" VARCHAR NOT NULL,
  "dayUtc" TIMESTAMP(6) NOT NULL,
  "epochNumber" INTEGER NOT NULL,
  "theoreticalCeiling" DECIMAL(38,18) NOT NULL,
  "qualifiedBaseMp" DECIMAL(38,18) NOT NULL,
  "qualifiedEffectiveMp" DECIMAL(38,18) NOT NULL,
  "qualifiedActivationCount" INTEGER NOT NULL,
  "utilizationRatio" DECIMAL(20,18) NOT NULL,
  "reservedEmission" DECIMAL(38,18) NOT NULL,
  "status" VARCHAR NOT NULL DEFAULT 'reserved',
  "calculationVersion" VARCHAR NOT NULL,
  "reservedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MiningEmissionDay_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mining_emission_day_boundary" CHECK ("dayUtc" = date_trunc('day', "dayUtc")),
  CONSTRAINT "mining_emission_day_epoch" CHECK ("epochNumber" BETWEEN 1 AND 4),
  CONSTRAINT "mining_emission_day_nonnegative" CHECK (
    "theoreticalCeiling" >= 0 AND "qualifiedBaseMp" >= 0 AND "qualifiedEffectiveMp" >= 0
    AND "qualifiedActivationCount" >= 0 AND "reservedEmission" >= 0 AND "reservedEmission" <= "theoreticalCeiling"
  ),
  CONSTRAINT "mining_emission_day_utilization" CHECK ("utilizationRatio" >= 0 AND "utilizationRatio" <= 1),
  CONSTRAINT "mining_emission_day_status" CHECK ("status" = 'reserved'),
  CONSTRAINT "mining_emission_day_calc_version" CHECK ("calculationVersion" = 'mining-power-r3-v1'),
  CONSTRAINT "mining_emission_day_zero_denominator" CHECK ("reservedEmission" = 0 OR "qualifiedEffectiveMp" > 0)
);
CREATE UNIQUE INDEX "mining_emission_day_utc_unique" ON "MiningEmissionDay"("dayUtc");
CREATE UNIQUE INDEX "mining_emission_day_program_day_unique" ON "MiningEmissionDay"("programId", "dayUtc");
CREATE INDEX "mining_emission_day_program_day_idx" ON "MiningEmissionDay"("programId", "dayUtc");
ALTER TABLE "MiningEmissionDay" ADD CONSTRAINT "MiningEmissionDay_programId_fkey"
  FOREIGN KEY ("programId") REFERENCES "MiningEmissionProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "MiningDailyPowerSnapshot" (
  "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
  "emissionDayId" VARCHAR NOT NULL,
  "activationId" VARCHAR NOT NULL,
  "userId" VARCHAR NOT NULL,
  "baseMp" DECIMAL(38,18) NOT NULL,
  "effectiveMp" DECIMAL(38,18) NOT NULL,
  "genesisMultiplier" DECIMAL(8,6) NOT NULL,
  "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MiningDailyPowerSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mining_daily_mp_positive" CHECK ("baseMp" > 0 AND "effectiveMp" > 0),
  CONSTRAINT "mining_daily_genesis_multiplier" CHECK ("genesisMultiplier" >= 1 AND "genesisMultiplier" <= 2.5)
);
CREATE UNIQUE INDEX "mining_daily_mp_day_activation_unique" ON "MiningDailyPowerSnapshot"("emissionDayId", "activationId");
CREATE INDEX "mining_daily_mp_day_user_idx" ON "MiningDailyPowerSnapshot"("emissionDayId", "userId");
ALTER TABLE "MiningDailyPowerSnapshot" ADD CONSTRAINT "MiningDailyPowerSnapshot_emissionDayId_fkey"
  FOREIGN KEY ("emissionDayId") REFERENCES "MiningEmissionDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MiningDailyPowerSnapshot" ADD CONSTRAINT "MiningDailyPowerSnapshot_activationId_fkey"
  FOREIGN KEY ("activationId") REFERENCES "MiningActivation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
