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

      // Group by user so we can call achievements once per user
      const stakesByUser = new Map<string, Stake[]>();
      for (const stake of activeStakes) {
        const list = stakesByUser.get(stake.userId) ?? [];
        list.push(stake);
        stakesByUser.set(stake.userId, list);
      }

      for (const [userId, userStakes] of stakesByUser) {
        let anyProfitCredited = false;

        for (const stake of userStakes) {
          const lastProfitDate = new Date(stake.lastProfitDate || stake.startDate);
          const endDate = new Date(stake.endDate);

          const daysSinceLastProfit = Math.floor(
            (now.getTime() - lastProfitDate.getTime()) / DAY_MS
          );
          const daysUntilEnd = Math.floor(
            (endDate.getTime() - lastProfitDate.getTime()) / DAY_MS
          );

          const creditedDays = Math.max(
            0,
            Math.min(daysSinceLastProfit, daysUntilEnd)
          );

          if (creditedDays >= 1) {
            const amountNum = parseFloat(stake.amount);
            const dailyRateNum = parseFloat(stake.dailyRate);
            const totalProfitNum = parseFloat(stake.totalProfit);

            const dailyProfit = (amountNum * dailyRateNum) / 100;
            const profitToAdd = dailyProfit * creditedDays;
            const newTotalProfit = totalProfitNum + profitToAdd;

            const calculatedLastProfitDate = new Date(
              lastProfitDate.getTime() + creditedDays * DAY_MS
            );
            const newLastProfitDate =
              calculatedLastProfitDate > endDate ? endDate : calculatedLastProfitDate;

            await storage.updateStake(stake.id, {
              totalProfit: newTotalProfit.toString(),
              lastProfitDate: newLastProfitDate,
            });

            const balance = await storage.getBalance(stake.userId);
            if (balance) {
              await storage.updateBalance(stake.userId, {
                stakingBalance: (
                  parseFloat(balance.stakingBalance) + profitToAdd
                ).toString(),
                totalEarned: (
                  parseFloat(balance.totalEarned) + profitToAdd
                ).toString(),
              });
            }

            await storage.createActivity({
              userId: stake.userId,
              type: "staking_reward",
              description: `Earned ${profitToAdd.toFixed(
                2
              )} XNRT from staking (${creditedDays} day${
                creditedDays > 1 ? "s" : ""
              })`,
            });

            const { notifyUser } = await import("../notifications");
            void notifyUser(stake.userId, {
              type: "staking_reward",
              title: "💎 Staking Rewards!",
              message: `You earned ${profitToAdd.toFixed(
                2
              )} XNRT from ${creditedDays} day${
                creditedDays > 1 ? "s" : ""
              } of staking`,
              url: "/staking",
              metadata: {
                amount: profitToAdd.toString(),
                days: creditedDays,
                stakeId: stake.id,
              },
            }).catch((err: unknown) => {
              console.error(
                "Error sending staking reward notification (non-blocking):",
                err
              );
            });

            anyProfitCredited = true;
          }

          if (now >= new Date(stake.endDate)) {
            await storage.updateStake(stake.id, {
              status: "completed",
            });
          }
        }

        if (anyProfitCredited) {
          await storage.checkAndUnlockAchievements(userId);
        }
      }
    },
  };
}
