/*
  Warnings:

  - A unique constraint covering the columns `[userId,walletAddress]` on the table `WalletNonce` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."WalletNonce_walletAddress_unique";

-- AlterTable
ALTER TABLE "DepositReport" ADD COLUMN     "resolvedAt" TIMESTAMP(6),
ADD COLUMN     "userId" VARCHAR;

-- AlterTable
ALTER TABLE "LinkedWallet" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "linkedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "signature" VARCHAR;

-- AlterTable
ALTER TABLE "UnmatchedDeposit" ADD COLUMN     "confirmations" INTEGER DEFAULT 0,
ADD COLUMN     "fromAddress" VARCHAR;

-- AlterTable
ALTER TABLE "WalletNonce" ADD COLUMN     "expiresAt" TIMESTAMP(6);

-- CreateIndex
CREATE INDEX "DepositReport_userId_idx" ON "DepositReport"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletNonce_userId_walletAddress_unique" ON "WalletNonce"("userId", "walletAddress");

-- AddForeignKey
ALTER TABLE "DepositReport" ADD CONSTRAINT "DepositReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
