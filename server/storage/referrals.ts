import type { PrismaClient } from "../db/client";
import { Prisma } from "../db/client";
import { type User, type Referral, type InsertReferral } from "@shared/schema";
import { convertPrismaReferral, convertPrismaUser } from "./types";

export function createReferralMethods(prisma: PrismaClient, storage: any) {
  return {
    async getReferralsByReferrer(referrerId: string): Promise<Referral[]> {
      const referrals = await prisma.referral.findMany({
        where: { referrerId },
      });
      return referrals.map(convertPrismaReferral);
    },

    async createReferral(referral: InsertReferral): Promise<Referral> {
      const newReferral = await prisma.referral.create({
        data: {
          referrerId: referral.referrerId,
          referredUserId: referral.referredUserId,
          level: referral.level,
          totalCommission: new Prisma.Decimal(referral.totalCommission || "0"),
        },
      });
      return convertPrismaReferral(newReferral);
    },

    async updateReferral(id: string, updates: Partial<Referral>): Promise<Referral> {
      const data: any = {};

      if (updates.totalCommission !== undefined) {
        data.totalCommission = new Prisma.Decimal(updates.totalCommission);
      }

      const referral = await prisma.referral.update({ where: { id }, data });
      return convertPrismaReferral(referral);
    },

    /**
     * Credit the 3-level referral chain exactly once per source deposit.
     *
     * ReferralCommission is the idempotency ledger. Each level is committed in
     * one DB transaction with the beneficiary balance/referral aggregate, so a
     * crash cannot leave a ledger row without the corresponding credit (or vice
     * versa). Re-running this function is safe.
     */
    async distributeReferralCommissions(
      userId: string,
      amount: number,
      sourceTransactionId: string,
    ): Promise<void> {
      if (!sourceTransactionId) {
        throw new Error("Referral commission source transaction ID is required");
      }
      if (!Number.isFinite(amount) || amount <= 0) return;

      const sourceTransaction = await prisma.transaction.findUnique({
        where: { id: sourceTransactionId },
        select: {
          id: true,
          userId: true,
          type: true,
          status: true,
          referralProcessed: true,
        },
      });

      if (
        !sourceTransaction ||
        sourceTransaction.type !== "deposit" ||
        sourceTransaction.status !== "approved" ||
        sourceTransaction.userId !== userId
      ) {
        throw new Error("Invalid referral commission source transaction");
      }

      // Historical approved deposits are marked processed by the R1 migration.
      // This also makes direct accidental replays harmless.
      if (sourceTransaction.referralProcessed) return;

      const COMMISSION_RATES = { 1: 0.06, 2: 0.03, 3: 0.01 } as const;
      const referrerChain = await storage.getReferrerChain(userId, 3);
      const companyAdminEmail =
        process.env.COMPANY_ADMIN_EMAIL || "noahkeaneowen@hotmail.com";

      for (let level = 1 as 1 | 2 | 3; level <= 3; level = (level + 1) as 1 | 2 | 3) {
        const referrer = referrerChain[level - 1];
        const commission = amount * COMMISSION_RATES[level];

        let beneficiaryUserId: string;
        let beneficiaryEmail: string;
        let isFallback = false;

        if (referrer) {
          beneficiaryUserId = referrer.id;
          beneficiaryEmail = referrer.email || referrer.id;
        } else {
          const companyAccount = await prisma.user.findFirst({
            where: { email: companyAdminEmail, isAdmin: true },
            select: { id: true, email: true },
          });

          if (!companyAccount) {
            throw new Error(
              `Company admin account (${companyAdminEmail}) not found - cannot process commission fallback`,
            );
          }

          beneficiaryUserId = companyAccount.id;
          beneficiaryEmail = companyAccount.email;
          isFallback = true;
        }

        let credited = false;

        try {
          await prisma.$transaction(async (tx: any) => {
            // First write is the idempotency claim. The unique constraint on
            // sourceTransactionId + level allows only one winner, even if the referral chain changes before a retry.
            await tx.referralCommission.create({
              data: {
                sourceTransactionId,
                beneficiaryUserId,
                referredUserId: userId,
                level,
                amount: new Prisma.Decimal(commission),
                isFallback,
              },
            });

            if (!isFallback && referrer) {
              await tx.referral.upsert({
                where: {
                  referrerId_referredUserId_level: {
                    referrerId: referrer.id,
                    referredUserId: userId,
                    level,
                  },
                },
                create: {
                  referrerId: referrer.id,
                  referredUserId: userId,
                  level,
                  totalCommission: new Prisma.Decimal(commission),
                },
                update: {
                  totalCommission: { increment: new Prisma.Decimal(commission) },
                },
              });
            }

            await tx.balance.upsert({
              where: { userId: beneficiaryUserId },
              create: {
                userId: beneficiaryUserId,
                referralBalance: new Prisma.Decimal(commission),
                totalEarned: new Prisma.Decimal(commission),
              },
              update: {
                referralBalance: { increment: new Prisma.Decimal(commission) },
                totalEarned: { increment: new Prisma.Decimal(commission) },
              },
            });

            await tx.activity.create({
              data: {
                userId: beneficiaryUserId,
                type: isFallback ? "company_commission" : "referral_commission",
                description: isFallback
                  ? `Received ${commission.toFixed(2)} XNRT company commission from missing level ${level} referrer`
                  : `Earned ${commission.toFixed(2)} XNRT commission from level ${level} referral`,
              },
            });

            credited = true;
          });
        } catch (error: any) {
          if (error?.code === "P2002") {
            // Already credited for this source deposit/beneficiary/level.
            continue;
          }
          throw error;
        }

        if (credited && !isFallback) {
          const { notifyUser } = await import("../notifications");
          void notifyUser(beneficiaryUserId, {
            type: "referral_commission",
            title: "💰 Referral Bonus!",
            message: `You earned ${commission.toFixed(2)} XNRT commission from a level ${level} referral`,
            url: "/referrals",
            metadata: {
              amount: commission.toString(),
              level,
              referredUserId: userId,
              sourceTransactionId,
            } as any,
          }).catch((err) => {
            console.error(
              "Error sending referral commission notification (non-blocking):",
              err,
            );
          });
        }

        console.log(
          `[REFERRAL] Level ${level} commission ${credited ? "credited" : "skipped"} to ${beneficiaryEmail}`,
        );
      }

      await prisma.transaction.updateMany({
        where: {
          id: sourceTransactionId,
          type: "deposit",
        },
        data: { referralProcessed: true },
      });
    },

    async getReferrerChain(userId: string, maxLevels: number): Promise<User[]> {
      const chain: User[] = [];
      let currentUserId = userId;

      for (let i = 0; i < maxLevels; i++) {
        const currentUser = await prisma.user.findUnique({
          where: { id: currentUserId },
        });

        if (!currentUser || !currentUser.referredBy) break;

        const referrer = await prisma.user.findUnique({
          where: { id: currentUser.referredBy },
        });

        if (!referrer) break;

        chain.push(convertPrismaUser(referrer));
        currentUserId = referrer.id;
      }

      return chain;
    },
  };
}
