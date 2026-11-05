/*
  Warnings:

  - A unique constraint covering the columns `[userId,achievementId]` on the table `UserAchievement` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "UserAchievement" ADD COLUMN     "claimed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "claimedAt" TIMESTAMP(6);

-- CreateIndex
CREATE UNIQUE INDEX "user_achievements_user_achievement_unique" ON "UserAchievement"("userId", "achievementId");
