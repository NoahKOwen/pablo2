-- AlterTable
ALTER TABLE "Stake" ADD COLUMN     "isLoan" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "loanProgram" TEXT,
ADD COLUMN     "minInvestUsdtPerReferral" DECIMAL(38,18) NOT NULL DEFAULT 50.0,
ADD COLUMN     "requiredInvestingReferrals" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "requiredReferrals" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "unlockMet" BOOLEAN NOT NULL DEFAULT false;
