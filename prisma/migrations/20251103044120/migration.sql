/*
  Warnings:

  - A unique constraint covering the columns `[depositAddress]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "depositAddress" VARCHAR,
ADD COLUMN     "derivationIndex" INTEGER;

-- CreateTable
CREATE TABLE "LinkedWallet" (
    "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
    "userId" VARCHAR NOT NULL,
    "address" VARCHAR NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinkedWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletNonce" (
    "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
    "userId" VARCHAR NOT NULL,
    "walletAddress" VARCHAR NOT NULL,
    "nonce" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletNonce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScannerState" (
    "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
    "scannerId" VARCHAR NOT NULL,
    "lastProcessedBlock" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScannerState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepositReport" (
    "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
    "txHash" VARCHAR NOT NULL,
    "amount" DECIMAL(38,18) NOT NULL,
    "toAddress" VARCHAR NOT NULL,
    "status" VARCHAR NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(6),

    CONSTRAINT "DepositReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnmatchedDeposit" (
    "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
    "txHash" VARCHAR NOT NULL,
    "amount" DECIMAL(38,18) NOT NULL,
    "toAddress" VARCHAR NOT NULL,
    "reason" VARCHAR NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnmatchedDeposit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LinkedWallet_address_unique" ON "LinkedWallet"("address");

-- CreateIndex
CREATE INDEX "linked_wallets_userId_idx" ON "LinkedWallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletNonce_walletAddress_unique" ON "WalletNonce"("walletAddress");

-- CreateIndex
CREATE INDEX "wallet_nonces_userId_idx" ON "WalletNonce"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ScannerState_scannerId_unique" ON "ScannerState"("scannerId");

-- CreateIndex
CREATE UNIQUE INDEX "DepositReport_txHash_unique" ON "DepositReport"("txHash");

-- CreateIndex
CREATE INDEX "deposit_reports_toAddress_idx" ON "DepositReport"("toAddress");

-- CreateIndex
CREATE INDEX "deposit_reports_status_idx" ON "DepositReport"("status");

-- CreateIndex
CREATE UNIQUE INDEX "UnmatchedDeposit_txHash_unique" ON "UnmatchedDeposit"("txHash");

-- CreateIndex
CREATE INDEX "unmatched_deposits_toAddress_idx" ON "UnmatchedDeposit"("toAddress");

-- CreateIndex
CREATE INDEX "unmatched_deposits_resolved_idx" ON "UnmatchedDeposit"("resolved");

-- CreateIndex
CREATE UNIQUE INDEX "User_depositAddress_unique" ON "User"("depositAddress");

-- AddForeignKey
ALTER TABLE "LinkedWallet" ADD CONSTRAINT "LinkedWallet_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "WalletNonce" ADD CONSTRAINT "WalletNonce_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
