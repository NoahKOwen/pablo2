CREATE TABLE "Achievement" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar NOT NULL,
	"description" text NOT NULL,
	"icon" varchar NOT NULL,
	"category" varchar NOT NULL,
	"requirement" integer NOT NULL,
	"xpReward" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "achievements_title_unique" UNIQUE("title")
);
--> statement-breakpoint
CREATE TABLE "Activity" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" varchar NOT NULL,
	"type" varchar NOT NULL,
	"description" text NOT NULL,
	"metadata" varchar,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Announcement" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"type" varchar DEFAULT 'info' NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdBy" varchar NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"expiresAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "Balance" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" varchar NOT NULL,
	"xnrtBalance" numeric(38, 18) DEFAULT '0' NOT NULL,
	"stakingBalance" numeric(38, 18) DEFAULT '0' NOT NULL,
	"miningBalance" numeric(38, 18) DEFAULT '0' NOT NULL,
	"referralBalance" numeric(38, 18) DEFAULT '0' NOT NULL,
	"totalEarned" numeric(38, 18) DEFAULT '0' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "Balance_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE "MiningSession" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" varchar NOT NULL,
	"baseReward" integer DEFAULT 10 NOT NULL,
	"adBoostCount" integer DEFAULT 0 NOT NULL,
	"boostPercentage" integer DEFAULT 0 NOT NULL,
	"finalReward" integer DEFAULT 10 NOT NULL,
	"startTime" timestamp DEFAULT now() NOT NULL,
	"endTime" timestamp,
	"nextAvailable" timestamp NOT NULL,
	"status" varchar DEFAULT 'active' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Notification" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" varchar NOT NULL,
	"type" varchar NOT NULL,
	"title" varchar NOT NULL,
	"message" text NOT NULL,
	"metadata" varchar,
	"read" boolean DEFAULT false NOT NULL,
	"deliveryAttempts" integer,
	"deliveredAt" timestamp,
	"lastAttemptAt" timestamp,
	"pendingPush" boolean DEFAULT false NOT NULL,
	"pushError" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "PasswordReset" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" varchar NOT NULL,
	"userId" varchar NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"usedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "PasswordReset_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "PushSubscription" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" varchar NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"expirationTime" timestamp,
	"enabled" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_user_endpoint_unique" UNIQUE("userId","endpoint")
);
--> statement-breakpoint
CREATE TABLE "Referral" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referrerId" varchar NOT NULL,
	"referredUserId" varchar NOT NULL,
	"level" integer NOT NULL,
	"totalCommission" numeric(38, 18) DEFAULT '0' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Session" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jwtId" varchar NOT NULL,
	"userId" varchar NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"revokedAt" timestamp,
	CONSTRAINT "Session_jwtId_unique" UNIQUE("jwtId")
);
--> statement-breakpoint
CREATE TABLE "Stake" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" varchar NOT NULL,
	"tier" varchar NOT NULL,
	"amount" numeric(38, 18) NOT NULL,
	"dailyRate" numeric(8, 6) NOT NULL,
	"duration" integer NOT NULL,
	"startDate" timestamp DEFAULT now() NOT NULL,
	"endDate" timestamp NOT NULL,
	"totalProfit" numeric(38, 18) DEFAULT '0' NOT NULL,
	"lastProfitDate" timestamp,
	"status" varchar DEFAULT 'active' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Task" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar NOT NULL,
	"description" text NOT NULL,
	"xpReward" integer NOT NULL,
	"xnrtReward" numeric(38, 18) DEFAULT '0' NOT NULL,
	"category" varchar NOT NULL,
	"requirements" text,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_title_unique" UNIQUE("title")
);
--> statement-breakpoint
CREATE TABLE "Transaction" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" varchar NOT NULL,
	"type" varchar NOT NULL,
	"amount" numeric(38, 18) NOT NULL,
	"usdtAmount" numeric(38, 18),
	"source" varchar,
	"walletAddress" text,
	"transactionHash" text,
	"proofImageUrl" varchar,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"adminNotes" text,
	"fee" numeric(38, 18),
	"netAmount" numeric(38, 18),
	"approvedBy" varchar,
	"approvedAt" timestamp,
	"verified" boolean DEFAULT false NOT NULL,
	"confirmations" integer DEFAULT 0 NOT NULL,
	"verificationData" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_txhash_unique" UNIQUE("transactionHash")
);
--> statement-breakpoint
CREATE TABLE "UserAchievement" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" varchar NOT NULL,
	"achievementId" varchar NOT NULL,
	"unlockedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "UserTask" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" varchar NOT NULL,
	"taskId" varchar NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"maxProgress" integer DEFAULT 1 NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"completedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_tasks_user_task_unique" UNIQUE("userId","taskId")
);
--> statement-breakpoint
CREATE TABLE "User" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar NOT NULL,
	"username" varchar NOT NULL,
	"passwordHash" varchar NOT NULL,
	"referralCode" varchar NOT NULL,
	"referredBy" varchar,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"emailVerificationToken" varchar,
	"emailVerificationExpires" timestamp,
	"isAdmin" boolean DEFAULT false NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"streak" integer DEFAULT 0 NOT NULL,
	"lastCheckIn" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "User_email_unique" UNIQUE("email"),
	CONSTRAINT "User_username_unique" UNIQUE("username"),
	CONSTRAINT "User_referralCode_unique" UNIQUE("referralCode")
);
--> statement-breakpoint
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_createdBy_User_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Balance" ADD CONSTRAINT "Balance_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "MiningSession" ADD CONSTRAINT "MiningSession_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerId_User_id_fk" FOREIGN KEY ("referrerId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referredUserId_User_id_fk" FOREIGN KEY ("referredUserId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Stake" ADD CONSTRAINT "Stake_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_achievementId_Achievement_id_fk" FOREIGN KEY ("achievementId") REFERENCES "public"."Achievement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "UserTask" ADD CONSTRAINT "UserTask_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "UserTask" ADD CONSTRAINT "UserTask_taskId_Task_id_fk" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_user_id_idx" ON "Activity" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "activities_created_at_idx" ON "Activity" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "activities_userId_createdAt_idx" ON "Activity" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE INDEX "announcements_isActive_idx" ON "Announcement" USING btree ("isActive");--> statement-breakpoint
CREATE INDEX "announcements_createdAt_idx" ON "Announcement" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "mining_sessions_userId_idx" ON "MiningSession" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "mining_sessions_status_idx" ON "MiningSession" USING btree ("status");--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "Notification" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "notifications_read_idx" ON "Notification" USING btree ("read");--> statement-breakpoint
CREATE INDEX "notifications_created_at_idx" ON "Notification" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "notifications_pending_push_idx" ON "Notification" USING btree ("pendingPush");--> statement-breakpoint
CREATE INDEX "password_resets_userId_idx" ON "PasswordReset" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "password_resets_token_idx" ON "PasswordReset" USING btree ("token");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_id_idx" ON "PushSubscription" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "push_subscriptions_endpoint_idx" ON "PushSubscription" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "referrals_referrerId_idx" ON "Referral" USING btree ("referrerId");--> statement-breakpoint
CREATE INDEX "referrals_referredUserId_idx" ON "Referral" USING btree ("referredUserId");--> statement-breakpoint
CREATE INDEX "sessions_userId_idx" ON "Session" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "sessions_jwtId_idx" ON "Session" USING btree ("jwtId");--> statement-breakpoint
CREATE INDEX "stakes_userId_idx" ON "Stake" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "stakes_status_idx" ON "Stake" USING btree ("status");--> statement-breakpoint
CREATE INDEX "stakes_userId_createdAt_idx" ON "Stake" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE INDEX "transactions_userId_idx" ON "Transaction" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "transactions_type_idx" ON "Transaction" USING btree ("type");--> statement-breakpoint
CREATE INDEX "transactions_status_idx" ON "Transaction" USING btree ("status");--> statement-breakpoint
CREATE INDEX "transactions_createdAt_idx" ON "Transaction" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "transactions_userId_createdAt_idx" ON "Transaction" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE INDEX "user_achievements_userId_idx" ON "UserAchievement" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "user_achievements_achievementId_idx" ON "UserAchievement" USING btree ("achievementId");--> statement-breakpoint
CREATE INDEX "user_tasks_userId_idx" ON "UserTask" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "user_tasks_taskId_idx" ON "UserTask" USING btree ("taskId");