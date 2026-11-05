import type { PrismaClient } from "../db/client";
import { type User, type UpsertUser } from "@shared/schema";
import { convertPrismaUser, generateReferralCode } from "./types";

export function createUserMethods(prisma: PrismaClient, storage: any) {
  return {
    async getUser(id: string): Promise<User | undefined> {
      const user = await prisma.user.findUnique({
        where: { id },
      });
      return user ? convertPrismaUser(user) : undefined;
    },

    async upsertUser(userData: UpsertUser, refCode?: string): Promise<User> {
      const existingUser = await storage.getUser(userData.id!);

      if (existingUser) {
        const updateData: any = {};
        if (userData.email !== undefined && userData.email !== null)
          updateData.email = userData.email;
        if (userData.username !== undefined && userData.username !== null)
          updateData.username = userData.username;
        if (userData.isAdmin !== undefined) updateData.isAdmin = userData.isAdmin;
        if (userData.xp !== undefined) updateData.xp = userData.xp;
        if (userData.level !== undefined) updateData.level = userData.level;
        if (userData.streak !== undefined) updateData.streak = userData.streak;
        if (userData.lastCheckIn !== undefined)
          updateData.lastCheckIn = userData.lastCheckIn;
        updateData.updatedAt = new Date();

        const user = await prisma.user.update({
          where: { id: userData.id! },
          data: updateData,
        });
        return convertPrismaUser(user);
      }

      const referralCode = generateReferralCode();
      const user = await prisma.user.create({
        data: {
          id: userData.id,
          email: userData.email || "",
          username:
            userData.username ||
            userData.email?.split("@")[0] ||
            `user${Date.now()}`,
          passwordHash: (userData as any).passwordHash || "",
          referralCode,
          referredBy: refCode || null,
          isAdmin: userData.isAdmin || false,
          xp: userData.xp || 0,
          level: userData.level || 1,
          streak: userData.streak || 0,
          lastCheckIn: userData.lastCheckIn || null,
        },
      });

      await storage.createBalance({
        userId: user.id,
        xnrtBalance: "0",
        stakingBalance: "0",
        miningBalance: "0",
        referralBalance: "0",
        totalEarned: "0",
      });

      // Assign all active tasks to new user
      await storage.assignTasksToUser(user.id);

      if (refCode) {
        const referrer = await prisma.user.findUnique({
          where: { referralCode: refCode },
        });
        if (referrer) {
          await storage.createReferral({
            referrerId: referrer.id,
            referredUserId: user.id,
            level: 1,
            totalCommission: "0",
          });

          await storage.createNotification({
            userId: referrer.id,
            type: "new_referral",
            title: "🎉 New Referral!",
            message: `${
              user.username || "A new user"
            } just joined using your referral code!`,
            metadata: {
              referredUserId: user.id,
              referredUsername: user.username,
            } as any,
          });

          await storage.checkAndUnlockAchievements(referrer.id);
        }
      }

      return convertPrismaUser(user);
    },

    async updateUser(userId: string, updates: Partial<User>): Promise<User> {
      const updateData: any = {};

      if (updates.email !== undefined) updateData.email = updates.email;
      if (updates.username !== undefined) updateData.username = updates.username;
      if (updates.isAdmin !== undefined) updateData.isAdmin = updates.isAdmin;
      if (updates.xp !== undefined) updateData.xp = updates.xp;
      if (updates.level !== undefined) updateData.level = updates.level;
      if (updates.streak !== undefined) updateData.streak = updates.streak;
      if (updates.lastCheckIn !== undefined)
        updateData.lastCheckIn = updates.lastCheckIn;
      updateData.updatedAt = new Date();

      const user = await prisma.user.update({
        where: { id: userId },
        data: updateData,
      });
      return convertPrismaUser(user);
    },

    async getAllUsers(): Promise<User[]> {
      const users = await prisma.user.findMany();
      return users.map(convertPrismaUser);
    },
  };
}
