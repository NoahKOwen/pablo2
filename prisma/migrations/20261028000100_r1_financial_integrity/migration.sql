-- XNRT R1 — Financial Integrity & Idempotency

ALTER TABLE "Transaction"
ADD COLUMN "fundsReserved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "referralProcessed" BOOLEAN NOT NULL DEFAULT false;

-- Existing approved deposits predate the R1 idempotency ledger and may already
-- have paid commissions. Mark them processed so R1 never re-credits history.
UPDATE "Transaction"
SET "referralProcessed" = true
WHERE "type" = 'deposit' AND "status" = 'approved';

CREATE TABLE "ReferralCommission" (
    "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
    "sourceTransactionId" VARCHAR NOT NULL,
    "beneficiaryUserId" VARCHAR NOT NULL,
    "referredUserId" VARCHAR NOT NULL,
    "level" INTEGER NOT NULL,
    "amount" DECIMAL(38,18) NOT NULL,
    "isFallback" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralCommission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "referral_commission_source_level_unique"
ON "ReferralCommission"("sourceTransactionId", "level");

CREATE INDEX "referral_commissions_beneficiary_idx"
ON "ReferralCommission"("beneficiaryUserId");

CREATE INDEX "referral_commissions_referred_user_idx"
ON "ReferralCommission"("referredUserId");

CREATE INDEX "referral_commissions_source_transaction_idx"
ON "ReferralCommission"("sourceTransactionId");


-- Keep the aggregate referral edge unique as well. Multiple different deposit
-- payouts may update the same edge concurrently, but must not create duplicates.
CREATE UNIQUE INDEX "referrals_referrer_referred_level_unique"
ON "Referral"("referrerId", "referredUserId", "level");

-- Database-enforced concurrency guards.
-- These intentionally fail migration if existing production data already violates
-- the invariant, so operators can reconcile the data rather than silently deleting it.
CREATE UNIQUE INDEX "mining_sessions_one_active_per_user"
ON "MiningSession"("userId")
WHERE "status" = 'active';

CREATE UNIQUE INDEX "stakes_one_trust_loan_claim_per_program"
ON "Stake"("userId", "loanProgram")
WHERE "isLoan" = true AND "loanProgram" IS NOT NULL;
