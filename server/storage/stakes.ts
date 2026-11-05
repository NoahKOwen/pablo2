import type { PrismaClient } from "../db/client";
import { Prisma } from "../db/client";
import { type Stake, type InsertStake } from "@shared/schema";
import { convertPrismaStake } from "./types";

export function createStakeMethods(prisma: PrismaClient, storage: any) {
  return {
    async getStakes(userId: string): Promise<Stake[]> {
      const stakes = await prisma.stake.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });
      return stakes.map(convertPrismaStake);
    },

    async getStakeById(id: string): Promise<Stake | undefined> {
      const stake = await prisma.stake.findUnique({
        where: { id },
      });
      return stake ? convertPrismaStake(stake) : undefined;
    },

    async createStake(stake: InsertStake): Promise<Stake> {
      const newStake = await prisma.stake.create({
        data: {
          userId: stake.userId,
          tier: stake.tier,
          amount: new Prisma.Decimal(stake.amount),
          dailyRate: new Prisma.Decimal(stake.dailyRate),
          duration: stake.duration,
          startDate: stake.startDate || new Date(),
          endDate: stake.endDate,
          totalProfit: new Prisma.Decimal(stake.totalProfit || "0"),
          lastProfitDate: stake.lastProfitDate,
          status: stake.status || "active",
          isLoan: stake.isLoan ?? false,
          loanProgram: stake.loanProgram,
          unlockMet: stake.unlockMet ?? false,
          requiredReferrals: stake.requiredReferrals,
          requiredInvestingReferrals: stake.requiredInvestingReferrals,
          minInvestUsdtPerReferral: stake.minInvestUsdtPerReferral
            ? new Prisma.Decimal(stake.minInvestUsdtPerReferral)
            : undefined,
        },
      });
      return convertPrismaStake(newStake);
    },

    async updateStake(id: string, updates: Partial<Stake>): Promise<Stake> {
      const data: any = {};

      if (updates.totalProfit !== undefined) {
        data.totalProfit = new Prisma.Decimal(updates.totalProfit);
      }
      if (updates.lastProfitDate !== undefined) {
        data.lastProfitDate = updates.lastProfitDate;
      }
      if (updates.status !== undefined) {
        data.status = updates.status;
      }
      if (updates.unlockMet !== undefined) {
        data.unlockMet = updates.unlockMet;
      }

      const stake = await prisma.stake.update({
        where: { id },
        data,
      });
      return convertPrismaStake(stake);
    },

    async atomicWithdrawStake(
      id: string,
      totalProfit: string
    ): Promise<Stake | null> {
      try {
        const stake = await prisma.stake.updateMany({
          where: {
            id,
            OR: [{ status: "completed" }, { status: "active" }],
          },
          data: {
            status: "withdrawn",
            totalProfit: new Prisma.Decimal(totalProfit),
          },
        });

        if (stake.count === 0) return null;

        const updatedStake = await prisma.stake.findUnique({
          where: { id },
        });

        return updatedStake ? convertPrismaStake(updatedStake) : null;
      } catch {
        return null;
      }
    },

    async getAllActiveStakes(): Promise<Stake[]> {
      const stakes = await prisma.stake.findMany({
        where: { status: "active" },
      });
      return stakes.map(convertPrismaStake);
    },

    async processStakingRewards(): Promise<void> {
      const activeStakes = await storage.getAllActiveStakes();
      if (!activeStakes.length) return;

      const now = new Date();
      const DAY_MS = 24 * 60 * 60 * 1000;
      const usersWithRewards = new Set<string>();

      for (const candidate of activeStakes) {
        const outcome = await prisma.$transaction(async (tx: any) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"stake:" + candidate.id}))`;

          // Re-read under the lock so a second worker cannot calculate from a
          // stale lastProfitDate/totalProfit snapshot.
          const stake = await tx.stake.findUnique({ where: { id: candidate.id } });
          if (!stake || stake.status !== "active") return null;

          const lastProfitDate = new Date(stake.lastProfitDate || stake.startDate);
          const endDate = new Date(stake.endDate);
          const effectiveNow = now > endDate ? endDate : now;

          const creditedDays = Math.max(
            0,
            Math.floor((effectiveNow.getTime() - lastProfitDate.getTime()) / DAY_MS),
          );

          let profitToAdd = 0;
          let newLastProfitDate = stake.lastProfitDate;

          if (creditedDays >= 1) {
            const amountNum = Number(stake.amount);
            const dailyRateNum = Number(stake.dailyRate);
            const dailyProfit = (amountNum * dailyRateNum) / 100;
            profitToAdd = dailyProfit * creditedDays;

            const calculated = new Date(lastProfitDate.getTime() + creditedDays * DAY_MS);
            newLastProfitDate = calculated > endDate ? endDate : calculated;

            await tx.stake.update({
              where: { id: stake.id },
              data: {
                totalProfit: { increment: new Prisma.Decimal(profitToAdd) },
                lastProfitDate: newLastProfitDate,
                ...(now >= endDate ? { status: "completed" } : {}),
              },
            });

            await tx.balance.upsert({
              where: { userId: stake.userId },
              create: {
                userId: stake.userId,
                stakingBalance: new Prisma.Decimal(profitToAdd),
                totalEarned: new Prisma.Decimal(profitToAdd),
              },
              update: {
                stakingBalance: { increment: new Prisma.Decimal(profitToAdd) },
                totalEarned: { increment: new Prisma.Decimal(profitToAdd) },
              },
            });

            await tx.activity.create({
              data: {
                userId: stake.userId,
                type: "staking_reward",
                description: `Earned ${profitToAdd.toFixed(2)} XNRT from staking (${creditedDays} day${creditedDays > 1 ? "s" : ""})`,
              },
            });
          } else if (now >= endDate) {
            await tx.stake.update({
              where: { id: stake.id },
              data: { status: "completed" },
            });
          }

          return {
            userId: stake.userId,
            stakeId: stake.id,
            creditedDays,
            profitToAdd,
          };
        });

        if (!outcome || outcome.profitToAdd <= 0) continue;

        usersWithRewards.add(outcome.userId);
        const { notifyUser } = await import("../notifications");
        void notifyUser(outcome.userId, {
          type: "staking_reward",
          title: "💎 Staking Rewards!",
          message: `You earned ${outcome.profitToAdd.toFixed(2)} XNRT from ${outcome.creditedDays} day${outcome.creditedDays > 1 ? "s" : ""} of staking`,
          url: "/staking",
          metadata: {
            amount: outcome.profitToAdd.toString(),
            days: outcome.creditedDays,
            stakeId: outcome.stakeId,
          },
        }).catch((err: unknown) => {
          console.error("Error sending staking reward notification (non-blocking):", err);
        });
      }

      for (const userId of usersWithRewards) {
        await storage.checkAndUnlockAchievements(userId);
      }
    },
  };
}
