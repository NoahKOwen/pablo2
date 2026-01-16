// server/storage/mining.ts
import type { PrismaClient } from "../db/client";
import { type MiningSession, type InsertMiningSession } from "@shared/schema";
import { DEFAULT_MINING_BASE_REWARD, XP_TO_XNRT_RATE } from "./constants";

export function createMiningMethods(prisma: PrismaClient, storage: any) {
  /**
   * Complete a single mining session if its endTime has passed.
   * This is concurrency-safe: only the first caller that successfully
   * flips status from "active" -> "completed" will apply rewards.
   *
   * Returns true if the session was processed (rewards applied), false otherwise.
   */
  async function completeSessionIfDue(
    session: any,
    now: Date,
  ): Promise<boolean> {
    if (!session) return false;
    if (!session.endTime) return false;

    const endTime = new Date(session.endTime);
    if (now < endTime) {
      // Not yet finished
      return false;
    }

    const baseReward = session.baseReward ?? DEFAULT_MINING_BASE_REWARD;
    const boostPercentage = session.boostPercentage ?? 0;

    const finalReward =
      session.finalReward ??
      (baseReward + Math.floor((baseReward * boostPercentage) / 100));

    const xpReward = finalReward;
    const xnrtReward = finalReward * XP_TO_XNRT_RATE;

    // Concurrency guard: only process if we can atomically change status
    const updateResult = await prisma.miningSession.updateMany({
      where: {
        id: session.id,
        status: "active",
      },
      data: {
        status: "completed",
        finalReward,
        endTime: now,
      },
    });

    if (updateResult.count === 0) {
      // Someone else already completed this session (or it was not active),
      // so we MUST NOT apply rewards again.
      return false;
    }

    // Apply rewards through storage helpers (to keep consistency
    // with the rest of the storage layer).
    const user = await storage.getUser(session.userId);
    if (user) {
      await storage.updateUser(session.userId, {
        xp: (user.xp || 0) + xpReward,
      });
    }

    const balance = await storage.getBalance(session.userId);
    if (balance) {
      await storage.updateBalance(session.userId, {
        miningBalance: (
          parseFloat(balance.miningBalance) + xnrtReward
        ).toString(),
        totalEarned: (
          parseFloat(balance.totalEarned) + xnrtReward
        ).toString(),
      });
    }

    await storage.createActivity({
      userId: session.userId,
      type: "mining_completed",
      description: `Auto-completed mining session and earned ${xpReward} XP and ${xnrtReward.toFixed(
        1,
      )} XNRT`,
    });

    const { notifyUser } = await import("../notifications");
    void notifyUser(session.userId, {
      type: "mining_completed",
      title: "⛏️ Mining Complete!",
      message: `You earned ${xpReward} XP and ${xnrtReward.toFixed(
        1,
      )} XNRT from your 24-hour mining session`,
      url: "/mining",
      metadata: {
        xpReward,
        xnrtReward: xnrtReward.toString(),
        sessionId: session.id,
      },
    }).catch((err: unknown) => {
      console.error("Error sending mining notification (non-blocking):", err);
    });

    await storage.checkAndUnlockAchievements(session.userId);

    return true;
  }

  return {
    /**
     * Process all due mining sessions.
     *
     * NOTE: This can be used by a cron or an admin endpoint.
     * It is now safe if called multiple times – each session is
     * rewarded exactly once thanks to the concurrency guard.
     */
    async processMiningRewards(): Promise<void> {
      const now = new Date();

      const activeDueSessions = await prisma.miningSession.findMany({
        where: {
          status: "active",
          endTime: {
            lte: now,
          },
        },
      });

      for (const session of activeDueSessions) {
        await completeSessionIfDue(session, now);
      }
    },

    /**
     * Get the current active mining session for a user.
     * If the latest active session is already past its endTime,
     * we auto-complete it (idempotently) and return undefined.
     */
    async getCurrentMiningSession(
      userId: string,
    ): Promise<MiningSession | undefined> {
      const session = await prisma.miningSession.findFirst({
        where: {
          userId,
          status: "active",
        },
        orderBy: { createdAt: "desc" },
      });

      if (!session) {
        return undefined;
      }

      const now = new Date();
      const processed = await completeSessionIfDue(session, now);
      if (processed) {
        // Session was completed just now, so there's no active session anymore.
        return undefined;
      }

      return session || undefined;
    },

    async getMiningHistory(userId: string): Promise<MiningSession[]> {
      const sessions = await prisma.miningSession.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      return sessions;
    },

    async createMiningSession(
      session: InsertMiningSession,
    ): Promise<MiningSession> {
      const now = new Date();
      const startTime = session.startTime ?? now;

      const defaultEndTime = new Date(
        startTime.getTime() + 24 * 60 * 60 * 1000,
      );
      const defaultNextAvailable = new Date(
        defaultEndTime.getTime() + 60 * 60 * 1000,
      );

      const base = session.baseReward ?? DEFAULT_MINING_BASE_REWARD;
      const boost = session.boostPercentage ?? 0;
      const computedFinal =
        base + Math.floor((base * boost) / 100);

      const newSession = await prisma.miningSession.create({
        data: {
          userId: session.userId,
          baseReward: base,
          adBoostCount: session.adBoostCount ?? 0,
          boostPercentage: boost,
          finalReward: session.finalReward ?? computedFinal,
          startTime,
          endTime: session.endTime ?? defaultEndTime,
          nextAvailable: session.nextAvailable ?? defaultNextAvailable,
          status: session.status ?? "active",
        },
      });

      return newSession;
    },

    async updateMiningSession(
      id: string,
      updates: Partial<MiningSession>,
    ): Promise<MiningSession> {
      const data: any = {};
      if (updates.baseReward !== undefined) data.baseReward = updates.baseReward;
      if (updates.adBoostCount !== undefined)
        data.adBoostCount = updates.adBoostCount;
      if (updates.boostPercentage !== undefined)
        data.boostPercentage = updates.boostPercentage;
      if (updates.finalReward !== undefined) data.finalReward = updates.finalReward;
      if (updates.endTime !== undefined) data.endTime = updates.endTime;
      if (updates.nextAvailable !== undefined)
        data.nextAvailable = updates.nextAvailable;
      if (updates.status !== undefined) data.status = updates.status;

      const session = await prisma.miningSession.update({
        where: { id },
        data,
      });
      return session;
    },
  };
}
