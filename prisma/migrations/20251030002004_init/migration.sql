-- CreateTable
CREATE TABLE "User" (
    "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR NOT NULL,
    "username" VARCHAR NOT NULL,
    "passwordHash" VARCHAR NOT NULL,
    "referralCode" VARCHAR NOT NULL,
    "referredBy" VARCHAR,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerificationToken" VARCHAR,
    "emailVerificationExpires" TIMESTAMP(6),
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "lastCheckIn" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
    "jwtId" VARCHAR NOT NULL,
    "userId" VARCHAR NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(6),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Balance" (
    "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
    "userId" VARCHAR NOT NULL,
    "xnrtBalance" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "stakingBalance" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "miningBalance" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "referralBalance" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "totalEarned" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Balance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stake" (
    "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
    "userId" VARCHAR NOT NULL,
    "tier" VARCHAR NOT NULL,
    "amount" DECIMAL(38,18) NOT NULL,
    "dailyRate" DECIMAL(8,6) NOT NULL,
    "duration" INTEGER NOT NULL,
    "startDate" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(6) NOT NULL,
    "totalProfit" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "lastProfitDate" TIMESTAMP(6),
    "status" VARCHAR NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Stake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiningSession" (
    "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
    "userId" VARCHAR NOT NULL,
    "baseReward" INTEGER NOT NULL DEFAULT 10,
    "adBoostCount" INTEGER NOT NULL DEFAULT 0,
    "boostPercentage" INTEGER NOT NULL DEFAULT 0,
    "finalReward" INTEGER NOT NULL DEFAULT 10,
    "startTime" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(6),
    "nextAvailable" TIMESTAMP(6) NOT NULL,
    "status" VARCHAR NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MiningSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
    "referrerId" VARCHAR NOT NULL,
    "referredUserId" VARCHAR NOT NULL,
    "level" INTEGER NOT NULL,
    "totalCommission" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
    "userId" VARCHAR NOT NULL,
    "type" VARCHAR NOT NULL,
    "amount" DECIMAL(38,18) NOT NULL,
    "usdtAmount" DECIMAL(38,18),
    "source" VARCHAR,
    "walletAddress" TEXT,
    "transactionHash" TEXT,
    "proofImageUrl" VARCHAR,
    "status" VARCHAR NOT NULL DEFAULT 'pending',
    "adminNotes" TEXT,
    "fee" DECIMAL(38,18),
    "netAmount" DECIMAL(38,18),
    "approvedBy" VARCHAR,
    "approvedAt" TIMESTAMP(6),
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "confirmations" INTEGER NOT NULL DEFAULT 0,
    "verificationData" JSONB,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR NOT NULL,
    "description" TEXT NOT NULL,
    "xpReward" INTEGER NOT NULL,
    "xnrtReward" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "category" VARCHAR NOT NULL,
    "requirements" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserTask" (
    "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
    "userId" VARCHAR NOT NULL,
    "taskId" VARCHAR NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "maxProgress" INTEGER NOT NULL DEFAULT 1,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Achievement" (
    "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR NOT NULL,
    "description" TEXT NOT NULL,
    "icon" VARCHAR NOT NULL,
    "category" VARCHAR NOT NULL,
    "requirement" INTEGER NOT NULL,
    "xpReward" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAchievement" (
    "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
    "userId" VARCHAR NOT NULL,
    "achievementId" VARCHAR NOT NULL,
    "unlockedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAchievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
    "userId" VARCHAR NOT NULL,
    "type" VARCHAR NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" VARCHAR,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordReset" (
    "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
    "token" VARCHAR NOT NULL,
    "userId" VARCHAR NOT NULL,
    "expiresAt" TIMESTAMP(6) NOT NULL,
    "usedAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
    "userId" VARCHAR NOT NULL,
    "type" VARCHAR NOT NULL,
    "title" VARCHAR NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" VARCHAR,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "deliveryAttempts" INTEGER,
    "deliveredAt" TIMESTAMP(6),
    "lastAttemptAt" TIMESTAMP(6),
    "pendingPush" BOOLEAN NOT NULL DEFAULT false,
    "pushError" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
    "userId" VARCHAR NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "expirationTime" TIMESTAMP(6),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" VARCHAR NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(255) NOT NULL,
    "content" TEXT NOT NULL,
    "type" VARCHAR NOT NULL DEFAULT 'info',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" VARCHAR NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(6),

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_unique" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_unique" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_unique" ON "User"("referralCode");

-- CreateIndex
CREATE UNIQUE INDEX "Session_jwtId_unique" ON "Session"("jwtId");

-- CreateIndex
CREATE INDEX "sessions_jwtId_idx" ON "Session"("jwtId");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Balance_userId_unique" ON "Balance"("userId");

-- CreateIndex
CREATE INDEX "stakes_status_idx" ON "Stake"("status");

-- CreateIndex
CREATE INDEX "stakes_userId_createdAt_idx" ON "Stake"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "stakes_userId_idx" ON "Stake"("userId");

-- CreateIndex
CREATE INDEX "mining_sessions_status_idx" ON "MiningSession"("status");

-- CreateIndex
CREATE INDEX "mining_sessions_userId_idx" ON "MiningSession"("userId");

-- CreateIndex
CREATE INDEX "referrals_referredUserId_idx" ON "Referral"("referredUserId");

-- CreateIndex
CREATE INDEX "referrals_referrerId_idx" ON "Referral"("referrerId");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_txhash_unique" ON "Transaction"("transactionHash");

-- CreateIndex
CREATE INDEX "transactions_createdAt_idx" ON "Transaction"("createdAt");

-- CreateIndex
CREATE INDEX "transactions_status_idx" ON "Transaction"("status");

-- CreateIndex
CREATE INDEX "transactions_type_idx" ON "Transaction"("type");

-- CreateIndex
CREATE INDEX "transactions_userId_createdAt_idx" ON "Transaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "transactions_userId_idx" ON "Transaction"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_title_unique" ON "Task"("title");

-- CreateIndex
CREATE INDEX "user_tasks_taskId_idx" ON "UserTask"("taskId");

-- CreateIndex
CREATE INDEX "user_tasks_userId_idx" ON "UserTask"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_tasks_user_task_unique" ON "UserTask"("userId", "taskId");

-- CreateIndex
CREATE UNIQUE INDEX "achievements_title_unique" ON "Achievement"("title");

-- CreateIndex
CREATE INDEX "user_achievements_achievementId_idx" ON "UserAchievement"("achievementId");

-- CreateIndex
CREATE INDEX "user_achievements_userId_idx" ON "UserAchievement"("userId");

-- CreateIndex
CREATE INDEX "activities_created_at_idx" ON "Activity"("createdAt");

-- CreateIndex
CREATE INDEX "activities_userId_createdAt_idx" ON "Activity"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "activities_user_id_idx" ON "Activity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_token_unique" ON "PasswordReset"("token");

-- CreateIndex
CREATE INDEX "password_resets_token_idx" ON "PasswordReset"("token");

-- CreateIndex
CREATE INDEX "password_resets_userId_idx" ON "PasswordReset"("userId");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "notifications_pending_push_idx" ON "Notification"("pendingPush");

-- CreateIndex
CREATE INDEX "notifications_read_idx" ON "Notification"("read");

-- CreateIndex
CREATE INDEX "notifications_user_id_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "push_subscriptions_endpoint_idx" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_user_id_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_user_endpoint_unique" ON "PushSubscription"("userId", "endpoint");

-- CreateIndex
CREATE INDEX "announcements_createdAt_idx" ON "Announcement"("createdAt");

-- CreateIndex
CREATE INDEX "announcements_isActive_idx" ON "Announcement"("isActive");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Balance" ADD CONSTRAINT "Balance_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Stake" ADD CONSTRAINT "Stake_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "MiningSession" ADD CONSTRAINT "MiningSession_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referredUserId_User_id_fk" FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerId_User_id_fk" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "UserTask" ADD CONSTRAINT "UserTask_taskId_Task_id_fk" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "UserTask" ADD CONSTRAINT "UserTask_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_achievementId_Achievement_id_fk" FOREIGN KEY ("achievementId") REFERENCES "Achievement"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_createdBy_User_id_fk" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
