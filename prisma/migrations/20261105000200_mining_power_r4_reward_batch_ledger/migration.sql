-- R4: additive reward-allocation accounting. No existing R1/R2/R3 tables
-- or legacy reward/payout behavior changed. No rows seeded, no worker started.
CREATE TABLE "MiningRewardBatch" (
 "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
 "emissionDayId" VARCHAR NOT NULL,
 "reservedEmission" DECIMAL(38,18) NOT NULL,
 "allocatedEmission" DECIMAL(38,18) NOT NULL,
 "unallocatedDust" DECIMAL(38,18) NOT NULL,
 "settlementDecimals" INTEGER NOT NULL DEFAULT 9,
 "totalEffectiveMp" DECIMAL(38,18) NOT NULL,
 "allocationCount" INTEGER NOT NULL,
 "status" VARCHAR NOT NULL DEFAULT 'allocating',
 "calculationVersion" VARCHAR NOT NULL DEFAULT 'mining-power-r4-v1',
 "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "preparedAt" TIMESTAMP(6),
 "completedAt" TIMESTAMP(6),
 CONSTRAINT "MiningRewardBatch_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "r4_batch_budget_conservation" CHECK (
   "reservedEmission" >= 0 AND "reservedEmission" <= 150000000 AND
   "allocatedEmission" >= 0 AND "unallocatedDust" >= 0 AND
   "allocatedEmission" + "unallocatedDust" = "reservedEmission" AND
   "settlementDecimals" = 9 AND round("allocatedEmission", 9) = "allocatedEmission"),
 CONSTRAINT "r4_batch_power_and_count" CHECK ("totalEffectiveMp" >= 0 AND "allocationCount" >= 0 AND
   ("allocatedEmission" = 0 OR "totalEffectiveMp" > 0)),
 CONSTRAINT "r4_batch_status" CHECK ("status" IN ('allocating','ready','paying','completed')),
 CONSTRAINT "r4_batch_version" CHECK ("calculationVersion" = 'mining-power-r4-v1')
);
CREATE UNIQUE INDEX "r4_batch_day_unique" ON "MiningRewardBatch"("emissionDayId");
CREATE INDEX "r4_batch_status_idx" ON "MiningRewardBatch"("status", "createdAt");
ALTER TABLE "MiningRewardBatch" ADD CONSTRAINT "MiningRewardBatch_emissionDayId_fkey"
 FOREIGN KEY ("emissionDayId") REFERENCES "MiningEmissionDay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "MiningRewardAllocation" (
 "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
 "batchId" VARCHAR NOT NULL,
 "powerSnapshotId" VARCHAR NOT NULL,
 "activationId" VARCHAR NOT NULL,
 "userId" VARCHAR NOT NULL,
 "effectiveMp" DECIMAL(38,18) NOT NULL,
 "rewardAmount" DECIMAL(38,18) NOT NULL,
 "status" VARCHAR NOT NULL DEFAULT 'pending',
 "creditedAt" TIMESTAMP(6),
 "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "MiningRewardAllocation_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "r4_allocation_amount" CHECK (
  "effectiveMp" > 0 AND "rewardAmount" >= 0 AND "rewardAmount" <= 150000000 AND
  round("rewardAmount", 9) = "rewardAmount"),
 CONSTRAINT "r4_allocation_status" CHECK (
  ("status" = 'skipped' AND "rewardAmount" = 0 AND "creditedAt" IS NULL) OR
  ("status" = 'pending' AND "rewardAmount" > 0 AND "creditedAt" IS NULL) OR
  ("status" = 'credited' AND "rewardAmount" > 0 AND "creditedAt" IS NOT NULL)
 )
);
CREATE UNIQUE INDEX "r4_allocation_batch_activation_unique" ON "MiningRewardAllocation"("batchId", "activationId");
CREATE UNIQUE INDEX "r4_allocation_snapshot_unique" ON "MiningRewardAllocation"("powerSnapshotId");
CREATE INDEX "r4_allocation_pending_idx" ON "MiningRewardAllocation"("batchId", "status", "id");
CREATE INDEX "r4_allocation_user_idx" ON "MiningRewardAllocation"("userId", "createdAt");
ALTER TABLE "MiningRewardAllocation" ADD CONSTRAINT "MiningRewardAllocation_batchId_fkey"
 FOREIGN KEY ("batchId") REFERENCES "MiningRewardBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MiningRewardAllocation" ADD CONSTRAINT "MiningRewardAllocation_powerSnapshotId_fkey"
 FOREIGN KEY ("powerSnapshotId") REFERENCES "MiningDailyPowerSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MiningRewardAllocation" ADD CONSTRAINT "MiningRewardAllocation_activationId_fkey"
 FOREIGN KEY ("activationId") REFERENCES "MiningActivation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MiningRewardAllocation" ADD CONSTRAINT "MiningRewardAllocation_userId_fkey"
 FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "MiningRewardLedger" (
 "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
 "allocationId" VARCHAR NOT NULL,
 "batchId" VARCHAR NOT NULL,
 "userId" VARCHAR NOT NULL,
 "amount" DECIMAL(38,18) NOT NULL,
 "source" VARCHAR NOT NULL DEFAULT 'mining_power_r4',
 "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "MiningRewardLedger_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "r4_ledger_positive_amount" CHECK ("amount" > 0 AND "amount" <= 150000000 AND round("amount",9) = "amount"),
 CONSTRAINT "r4_ledger_source" CHECK ("source" = 'mining_power_r4')
);
CREATE UNIQUE INDEX "r4_ledger_allocation_unique" ON "MiningRewardLedger"("allocationId");
CREATE INDEX "r4_ledger_batch_idx" ON "MiningRewardLedger"("batchId", "createdAt");
CREATE INDEX "r4_ledger_user_idx" ON "MiningRewardLedger"("userId", "createdAt");
ALTER TABLE "MiningRewardLedger" ADD CONSTRAINT "MiningRewardLedger_allocationId_fkey"
 FOREIGN KEY ("allocationId") REFERENCES "MiningRewardAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MiningRewardLedger" ADD CONSTRAINT "MiningRewardLedger_batchId_fkey"
 FOREIGN KEY ("batchId") REFERENCES "MiningRewardBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MiningRewardLedger" ADD CONSTRAINT "MiningRewardLedger_userId_fkey"
 FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A reserved R3 day and its participant set become DB-frozen once an R4 batch exists.
-- No effect on R3-only days or the R3 integration fixture cleanup.
CREATE OR REPLACE FUNCTION r4_guard_emission_day_after_batch() RETURNS trigger AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM "MiningRewardBatch" WHERE "emissionDayId" = OLD."id") THEN
  RAISE EXCEPTION 'R4: emission day with reward batch is immutable';
 END IF;
 RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER r4_emission_day_freeze
 BEFORE UPDATE OR DELETE ON "MiningEmissionDay"
 FOR EACH ROW EXECUTE FUNCTION r4_guard_emission_day_after_batch();

CREATE OR REPLACE FUNCTION r4_guard_snapshot_after_batch() RETURNS trigger AS $$
DECLARE old_day VARCHAR; new_day VARCHAR;
BEGIN
 old_day := CASE WHEN TG_OP <> 'INSERT' THEN OLD."emissionDayId" ELSE NULL END;
 new_day := CASE WHEN TG_OP <> 'DELETE' THEN NEW."emissionDayId" ELSE NULL END;
 IF EXISTS (SELECT 1 FROM "MiningRewardBatch" WHERE "emissionDayId" IN (old_day, new_day)) THEN
  RAISE EXCEPTION 'R4: snapshots for a prepared reward day are immutable';
 END IF;
 RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER r4_snapshot_freeze
 BEFORE INSERT OR UPDATE OR DELETE ON "MiningDailyPowerSnapshot"
 FOR EACH ROW EXECUTE FUNCTION r4_guard_snapshot_after_batch();

-- Keep batch denomination and authorized target immutable after creation.
CREATE OR REPLACE FUNCTION r4_guard_batch_economic_fields() RETURNS trigger AS $$
BEGIN
 IF ROW(NEW."emissionDayId", NEW."reservedEmission", NEW."allocatedEmission", NEW."unallocatedDust",
        NEW."settlementDecimals", NEW."totalEffectiveMp", NEW."allocationCount", NEW."calculationVersion")
 IS DISTINCT FROM
    ROW(OLD."emissionDayId", OLD."reservedEmission", OLD."allocatedEmission", OLD."unallocatedDust",
        OLD."settlementDecimals", OLD."totalEffectiveMp", OLD."allocationCount", OLD."calculationVersion") THEN
  RAISE EXCEPTION 'R4: batch economic fields are immutable';
 END IF;
 IF NOT (NEW."status" = OLD."status" OR
  (OLD."status"='allocating' AND NEW."status" IN ('ready','completed')) OR
  (OLD."status"='ready' AND NEW."status" IN ('paying','completed')) OR
  (OLD."status"='paying' AND NEW."status"='completed')) THEN
  RAISE EXCEPTION 'R4: invalid batch status transition';
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER r4_batch_economic_freeze
 BEFORE UPDATE ON "MiningRewardBatch"
 FOR EACH ROW EXECUTE FUNCTION r4_guard_batch_economic_fields();

CREATE OR REPLACE FUNCTION r4_guard_allocation_economic_fields() RETURNS trigger AS $$
BEGIN
 IF ROW(NEW."batchId", NEW."powerSnapshotId", NEW."activationId", NEW."userId", NEW."effectiveMp", NEW."rewardAmount")
 IS DISTINCT FROM ROW(OLD."batchId", OLD."powerSnapshotId", OLD."activationId", OLD."userId", OLD."effectiveMp", OLD."rewardAmount") THEN
  RAISE EXCEPTION 'R4: allocation economic fields are immutable';
 END IF;
 IF NOT (NEW."status"=OLD."status" AND NEW."creditedAt" IS NOT DISTINCT FROM OLD."creditedAt") AND
    NOT (OLD."status"='pending' AND NEW."status"='credited' AND NEW."creditedAt" IS NOT NULL) THEN
  RAISE EXCEPTION 'R4: allocation status transition forbidden';
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER r4_allocation_economic_freeze
 BEFORE UPDATE ON "MiningRewardAllocation"
 FOR EACH ROW EXECUTE FUNCTION r4_guard_allocation_economic_fields();

-- Lock the credited ledger against tampering through UPDATE. Deletions are
-- restricted by application procedures and FK order; use DB audit/permissions
-- for stronger operational append-only enforcement in production hardening.
CREATE OR REPLACE FUNCTION r4_guard_ledger_update() RETURNS trigger AS $$
BEGIN
 RAISE EXCEPTION 'R4: ledger rows cannot be modified';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER r4_ledger_no_update
 BEFORE UPDATE ON "MiningRewardLedger"
 FOR EACH ROW EXECUTE FUNCTION r4_guard_ledger_update();

-- Prevent inserting new participants after a batch becomes ready and ensure
-- each allocation comes from exactly one R3 snapshot of the SAME reward day.
CREATE OR REPLACE FUNCTION r4_guard_allocation_insert() RETURNS trigger AS $$
DECLARE b RECORD; s RECORD;
BEGIN
 SELECT "status", "emissionDayId" INTO b FROM "MiningRewardBatch"
 WHERE "id" = NEW."batchId" FOR SHARE;
 IF NOT FOUND OR b."status" <> 'allocating' THEN
  RAISE EXCEPTION 'R4: allocations allowed only during preparation';
 END IF;
 SELECT "activationId", "userId", "effectiveMp", "emissionDayId" INTO s
 FROM "MiningDailyPowerSnapshot" WHERE "id" = NEW."powerSnapshotId";
 IF NOT FOUND OR s."activationId" <> NEW."activationId" OR
   s."userId" <> NEW."userId" OR s."effectiveMp" <> NEW."effectiveMp" OR
   s."emissionDayId" <> b."emissionDayId" THEN
  RAISE EXCEPTION 'R4: allocation must match its frozen R3 snapshot';
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER r4_allocation_source_guard
 BEFORE INSERT ON "MiningRewardAllocation"
 FOR EACH ROW EXECUTE FUNCTION r4_guard_allocation_insert();

-- A ledger posting may never exceed or redirect an approved allocation.
CREATE OR REPLACE FUNCTION r4_guard_ledger_insert() RETURNS trigger AS $$
DECLARE a RECORD; state VARCHAR;
BEGIN
 SELECT "batchId", "userId", "rewardAmount", "status" INTO a
 FROM "MiningRewardAllocation" WHERE "id" = NEW."allocationId";
 SELECT "status" INTO state FROM "MiningRewardBatch" WHERE "id" = NEW."batchId";
 IF NOT FOUND OR state NOT IN ('ready','paying') OR
   a."batchId" IS DISTINCT FROM NEW."batchId" OR
   a."userId" IS DISTINCT FROM NEW."userId" OR
   a."rewardAmount" IS DISTINCT FROM NEW."amount" OR
   a."status" IS DISTINCT FROM 'credited' THEN
  RAISE EXCEPTION 'R4: ledger posting does not match a credited batch allocation';
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER r4_ledger_source_guard
 BEFORE INSERT ON "MiningRewardLedger"
 FOR EACH ROW EXECUTE FUNCTION r4_guard_ledger_insert();
