ALTER TABLE "Stake"
  ADD COLUMN IF NOT EXISTS "isLoan" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "loanProgram" varchar,
  ADD COLUMN IF NOT EXISTS "unlockMet" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "requiredReferrals" integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS "requiredInvestingReferrals" integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "minInvestUsdtPerReferral" numeric(38,18) NOT NULL DEFAULT 50;
