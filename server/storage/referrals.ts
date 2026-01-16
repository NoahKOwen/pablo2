import type { PrismaClient } from "../db/client";
import { Prisma } from "../db/client";
import { type User, type Referral, type InsertReferral } from "@shared/schema";
import { convertPrismaReferral, convertPrismaUser, decimalToString } from "./types";

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
          totalCommission: new Prisma.Decimal(
            referral.totalCommission || "0"
          ),
        },
      });
      return convertPrismaReferral(newReferral);
    },

    async updateReferral(
      id: string,
      updates: Partial<Referral>
    ): Promise<Referral> {
      const data: any = {};

      if (updates.totalCommission !== undefined) {
        data.totalCommission = new Prisma.Decimal(updates.totalCommission);
      }

      const referral = await prisma.referral.update({
        where: { id },
        data,
      });
      return convertPrismaReferral(referral);
    },

    async distributeReferralCommissions(
      userId: string,
      amount: number
    ): Promise<void> {
      console.log(
        `[REFERRAL] Starting distribution for userId: ${userId}, amount: ${amount}`
      );

      const COMMISSION_RATES = {
        1: 0.06,
        2: 0.03,
        3: 0.01,
      };

      const referrerChain = await storage.getReferrerChain(userId, 3);
      console.log(
        `[REFERRAL] Referrer chain length: ${referrerChain.length}`,
        referrerChain.map((r: any) => ({ id: r?.id, email: r?.email }))
      );

      for (let level = 1; level <= 3; level++) {
        const referrer = referrerChain[level - 1];
        const commission = amount * COMMISSION_RATES[level as 1 | 2 | 3];
        console.log(
          `[REFERRAL] Level ${level}: referrer=${
            referrer?.email || "null"
          }, commission=${commission}`
        );

        if (!referrer) {
          const COMPANY_ADMIN_EMAIL = "noahkeaneowen@hotmail.com";
          console.log(
            `[REFERRAL] No referrer at level ${level}, using company fallback: ${COMPANY_ADMIN_EMAIL}`
          );

          const companyAccount = await prisma.user.findFirst({
            where: {
              email: COMPANY_ADMIN_EMAIL,
              isAdmin: true,
            },
          });

          if (!companyAccount) {
            console.error(
              `[REFERRAL] Company admin account not found: ${COMPANY_ADMIN_EMAIL}`
            );
            throw new Error(
              `Company admin account (${COMPANY_ADMIN_EMAIL}) not found - cannot process commission fallback`
            );
          }

          console.log(
            `[REFERRAL] Company account found: ${companyAccount.id}, crediting ${commission} XNRT`
          );

          const companyBalance = await storage.getBalance(companyAccount.id);
          if (companyBalance) {
            const newReferralBalance = (
              parseFloat(companyBalance.referralBalance) + commission
            ).toString();
            const newTotalEarned = (
              parseFloat(companyBalance.totalEarned) + commission
            ).toString();
            console.log(
              `[REFERRAL] Updating company balance: referral ${companyBalance.referralBalance} → ${newReferralBalance}`
            );

            await storage.updateBalance(companyAccount.id, {
              referralBalance: newReferralBalance,
              totalEarned: newTotalEarned,
            });

            await storage.createActivity({
              userId: companyAccount.id,
              type: "company_commission",
              description: `Received ${commission.toFixed(
                2
              )} XNRT company commission from missing level ${level} referrer`,
            });
          }
          continue;
        }

        const existingReferral = await prisma.referral.findFirst({
          where: {
            referrerId: referrer.id,
            referredUserId: userId,
          },
        });

        if (existingReferral) {
          const newCommission =
            parseFloat(decimalToString(existingReferral.totalCommission)) +
            commission;
          await storage.updateReferral(existingReferral.id, {
            totalCommission: newCommission.toString(),
          });
        } else {
          await storage.createReferral({
            referrerId: referrer.id,
            referredUserId: userId,
            level,
            totalCommission: commission.toString(),
          });
        }

        const referrerBalance = await storage.getBalance(referrer.id);
        if (referrerBalance) {
          const newReferralBalance = (
            parseFloat(referrerBalance.referralBalance) + commission
          ).toString();
          const newTotalEarned = (
            parseFloat(referrerBalance.totalEarned) + commission
          ).toString();
          console.log(
            `[REFERRAL] Updating referrer ${referrer.email} balance: referral ${referrerBalance.referralBalance} → ${newReferralBalance}`
          );

          await storage.updateBalance(referrer.id, {
            referralBalance: newReferralBalance,
            totalEarned: newTotalEarned,
          });
        } else {
          console.warn(
            `[REFERRAL] No balance found for referrer ${referrer.email} (${referrer.id})`
          );
        }

        await storage.createActivity({
          userId: referrer.id,
          type: "referral_commission",
          description: `Earned ${commission.toFixed(
            2
          )} XNRT commission from level ${level} referral`,
        });

        const { notifyUser } = await import("../notifications");
        void notifyUser(referrer.id, {
          type: "referral_commission",
          title: "💰 Referral Bonus!",
          message: `You earned ${commission.toFixed(
            2
          )} XNRT commission from a level ${level} referral`,
          url: "/referrals",
          metadata: {
            amount: commission.toString(),
            level,
            referredUserId: userId,
          } as any,
        }).catch((err) => {
          console.error(
            "Error sending referral commission notification (non-blocking):",
            err
          );
        });

        console.log(
          `[REFERRAL] Level ${level} commission complete for ${referrer.email}`
        );
      }

      console.log(`[REFERRAL] Distribution complete for user ${userId}`);
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
