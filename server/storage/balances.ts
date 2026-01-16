import type { PrismaClient } from "../db/client";
import { Prisma } from "../db/client";
import { type Balance, type InsertBalance } from "@shared/schema";
import { convertPrismaBalance } from "./types";

export function createBalanceMethods(prisma: PrismaClient) {
  return {
    async getBalance(userId: string): Promise<Balance | undefined> {
      const balance = await prisma.balance.findUnique({
        where: { userId },
      });
      return balance ? convertPrismaBalance(balance) : undefined;
    },

    async createBalance(balance: InsertBalance): Promise<Balance> {
      const newBalance = await prisma.balance.create({
        data: {
          userId: balance.userId,
          xnrtBalance: new Prisma.Decimal(balance.xnrtBalance || "0"),
          stakingBalance: new Prisma.Decimal(balance.stakingBalance || "0"),
          miningBalance: new Prisma.Decimal(balance.miningBalance || "0"),
          referralBalance: new Prisma.Decimal(balance.referralBalance || "0"),
          totalEarned: new Prisma.Decimal(balance.totalEarned || "0"),
        },
      });
      return convertPrismaBalance(newBalance);
    },

    async updateBalance(
      userId: string,
      updates: Partial<Balance>
    ): Promise<Balance> {
      const data: any = { updatedAt: new Date() };

      if (updates.xnrtBalance !== undefined)
        data.xnrtBalance = new Prisma.Decimal(updates.xnrtBalance);
      if (updates.stakingBalance !== undefined)
        data.stakingBalance = new Prisma.Decimal(updates.stakingBalance);
      if (updates.miningBalance !== undefined)
        data.miningBalance = new Prisma.Decimal(updates.miningBalance);
      if (updates.referralBalance !== undefined)
        data.referralBalance = new Prisma.Decimal(updates.referralBalance);
      if (updates.totalEarned !== undefined)
        data.totalEarned = new Prisma.Decimal(updates.totalEarned);

      const balance = await prisma.balance.update({
        where: { userId },
        data,
      });
      return convertPrismaBalance(balance);
    },

    async adjustStakingBalance({
      userId,
      amount,
      operation = "add",
    }: {
      userId: string;
      amount: string;
      operation?: "add" | "subtract";
    }): Promise<Balance> {
      const balance = await prisma.balance.update({
        where: { userId },
        data: {
          stakingBalance: {
            [operation === "add" ? "increment" : "decrement"]:
              new Prisma.Decimal(amount),
          },
        },
      });
      return convertPrismaBalance(balance);
    },
  };
}
