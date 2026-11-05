// server/routes/trust-loan.ts
import { Router } from "express";
import { requireAuth, validateCSRF } from "../auth/middleware";
import { getDirectReferralStats } from "./shared";
import { STAKING_TIERS, type StakingTier } from "../../shared/schema";
import { TRUST_LOAN_CONFIG } from "../../shared/trust-loan";
import { prisma } from "../db/client";

const router = Router();

router.post("/claim", requireAuth, validateCSRF, async (req, res) => {
  try {
    const userId = req.authUser!.id;

    const tierKey = TRUST_LOAN_CONFIG.programKey as StakingTier;
    const tier = STAKING_TIERS[tierKey];
    if (!tier) {
      return res.status(400).json({ message: "Trust Loan tier not configured." });
    }

    // ✅ Enforce eligibility: directs OR investing
    const { directCount, investingCount } = await getDirectReferralStats(userId);

    const requiredReferrals = TRUST_LOAN_CONFIG.requiredReferrals;
    const requiredInvestingReferrals = TRUST_LOAN_CONFIG.requiredInvestingReferrals;

    const eligible =
      directCount >= requiredReferrals ||
      investingCount >= requiredInvestingReferrals;

    if (!eligible) {
      return res.status(400).json({
        message: `Not eligible yet. Need ${requiredReferrals} directs OR ${requiredInvestingReferrals} investing referrals.`,
      });
    }

    const now = new Date();
    const endDate = new Date(
      now.getTime() + TRUST_LOAN_CONFIG.durationDays * 24 * 60 * 60 * 1000,
    );

    // ✅ Race-safe: advisory lock + transaction
    const result = await prisma.$transaction(async (tx: any) => {
      // Postgres advisory lock scoped to this transaction
      // Prevents two concurrent claims for same user+tier
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtext(${userId} || ':' || ${tierKey}))
      `;

      const existing = await tx.stake.findFirst({
        where: {
          userId,
          tier: tierKey,
          isLoan: true,
          loanProgram: tierKey,
        },
      });

      if (existing) {
        return { already: true, stake: existing };
      }

      const stake = await tx.stake.create({
        data: {
          userId,
          tier: tierKey,
          amount: TRUST_LOAN_CONFIG.amountXnrt, // Decimal field accepts number
          duration: TRUST_LOAN_CONFIG.durationDays,
          dailyRate: tier.dailyRate, // ✅ use tier config
          startDate: now,
          endDate,
          totalProfit: 0,
          lastProfitDate: null,
          status: "active",

          isLoan: true,
          loanProgram: tierKey,
          unlockMet: true, // requirement has been met at claim-time

          requiredReferrals: TRUST_LOAN_CONFIG.requiredReferrals,
          requiredInvestingReferrals: TRUST_LOAN_CONFIG.requiredInvestingReferrals,
          minInvestUsdtPerReferral: TRUST_LOAN_CONFIG.minInvestUsdtPerReferral,
        },
      });

      // Ensure balance row exists, then increment stakingBalance
      await tx.balance.upsert({
        where: { userId },
        create: {
          userId,
          stakingBalance: TRUST_LOAN_CONFIG.amountXnrt,
          xnrtBalance: 0,
          miningBalance: 0,
          referralBalance: 0,
          totalEarned: 0,
        },
        update: {
          stakingBalance: { increment: TRUST_LOAN_CONFIG.amountXnrt },
        },
      });

      return { already: false, stake };
    });

    if (result.already) {
      return res.status(409).json({ message: "Trust Loan already claimed." });
    }

    // activity log (outside tx OK)
    await prisma.activity.create({
      data: {
        userId,
        type: "trust_loan_claimed",
        description: `Trust Loan claimed: ${TRUST_LOAN_CONFIG.amountXnrt} XNRT for ${TRUST_LOAN_CONFIG.durationDays} days`,
      },
    });

    return res.json({ ok: true, stake: result.stake });
  } catch (e) {
    console.error("[trust-loan/claim] error:", e);
    return res.status(500).json({ message: "Failed to claim Trust Loan" });
  }
});

router.get("/status", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser!.id;

    const loan = await prisma.stake.findFirst({
      where: {
        userId,
        tier: TRUST_LOAN_CONFIG.programKey,
        isLoan: true,
        loanProgram: TRUST_LOAN_CONFIG.programKey,
      },
      orderBy: { createdAt: "desc" },
    });

    const { directCount, investingCount } = await getDirectReferralStats(userId);

    return res.json({
      hasLoanStake: Boolean(loan),
      hasClaimedEver: Boolean(loan),
      stake: loan ?? null,
      directCount,
      investingCount,
      requiredReferrals: TRUST_LOAN_CONFIG.requiredReferrals,
      requiredInvestingReferrals: TRUST_LOAN_CONFIG.requiredInvestingReferrals,
      minInvestUsdtPerReferral: String(TRUST_LOAN_CONFIG.minInvestUsdtPerReferral),
      program: TRUST_LOAN_CONFIG.programKey,
      amountXnrt: TRUST_LOAN_CONFIG.amountXnrt,
      durationDays: TRUST_LOAN_CONFIG.durationDays,
    });
  } catch (e) {
    console.error("[trust-loan/status] error:", e);
    return res.status(500).json({ message: "Failed to get Trust Loan status" });
  }
});

export default router;
