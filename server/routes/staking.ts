import { Router } from "express";
import { storage } from "../storage";
import { requireAuth, validateCSRF } from "../auth/middleware";
import { STAKING_TIERS, type StakingTier } from "../../shared/schema";
import { prisma, Prisma } from "../db/client";

const router = Router();

// This is only an optimization for a single process. Database advisory locks in
// storage.processStakingRewards() provide the real cross-process protection.
let isProcessingStakingRewards = false;

router.get("/", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const stakes = await storage.getStakes(userId);
    res.json(stakes);
  } catch (error) {
    console.error("Error fetching stakes:", error);
    res.status(500).json({ message: "Failed to fetch stakes" });
  }
});

router.post("/", requireAuth, validateCSRF, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const { tier, amount } = req.body;

    if (!STAKING_TIERS[tier as StakingTier]) {
      return res.status(400).json({ message: "Invalid staking tier" });
    }

    const tierConfig = STAKING_TIERS[tier as StakingTier];
    const stakeAmount = Number(amount);

    if (!Number.isFinite(stakeAmount) || stakeAmount <= 0) {
      return res.status(400).json({ message: "Invalid stake amount" });
    }

    if (stakeAmount < tierConfig.minAmount || stakeAmount > tierConfig.maxAmount) {
      return res.status(400).json({
        message: `Stake amount must be between ${tierConfig.minAmount} and ${tierConfig.maxAmount} XNRT`,
      });
    }

    const startDate = new Date();
    const endDate = new Date(
      startDate.getTime() + tierConfig.duration * 24 * 60 * 60 * 1000,
    );
    const amountDec = new Prisma.Decimal(stakeAmount);

    // Debit the user's available balance and create the stake atomically. The
    // gte predicate is the concurrency guard: only one competing request can
    // spend the same available funds.
    const stake = await prisma.$transaction(async (tx: any) => {
      const debit = await tx.balance.updateMany({
        where: {
          userId,
          xnrtBalance: { gte: amountDec },
        },
        data: {
          xnrtBalance: { decrement: amountDec },
          stakingBalance: { increment: amountDec },
        },
      });

      if (debit.count !== 1) {
        throw new Error("INSUFFICIENT_BALANCE");
      }

      const created = await tx.stake.create({
        data: {
          userId,
          tier,
          amount: amountDec,
          dailyRate: new Prisma.Decimal(tierConfig.dailyRate),
          duration: tierConfig.duration,
          startDate,
          endDate,
          totalProfit: new Prisma.Decimal(0),
          lastProfitDate: null,
          status: "active",
          isLoan: false,
        },
      });

      await tx.activity.create({
        data: {
          userId,
          type: "stake_created",
          description: `Staked ${stakeAmount.toLocaleString()} XNRT in ${tierConfig.name}`,
        },
      });

      return created;
    });

    res.json(stake);
  } catch (error: any) {
    if (error?.message === "INSUFFICIENT_BALANCE") {
      return res.status(400).json({ message: "Insufficient balance" });
    }
    console.error("Error creating stake:", error);
    res.status(500).json({ message: "Failed to create stake" });
  }
});

router.post("/process-rewards", requireAuth, validateCSRF, async (_req, res) => {
  if (isProcessingStakingRewards) {
    return res.json({
      ok: false,
      skipped: true,
      reason: "Staking reward processing is already running",
    });
  }

  isProcessingStakingRewards = true;
  try {
    await storage.processStakingRewards();
    res.json({ ok: true, message: "Staking rewards processed successfully" });
  } catch (error) {
    console.error("Error processing staking rewards:", error);
    res.status(500).json({ message: "Failed to process staking rewards" });
  } finally {
    isProcessingStakingRewards = false;
  }
});

router.post("/:id/withdraw", requireAuth, validateCSRF, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const stakeId = req.params.id;
    const now = new Date();

    const result = await prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"stake:" + stakeId}))`;

      const stake = await tx.stake.findUnique({ where: { id: stakeId } });
      if (!stake) throw new Error("STAKE_NOT_FOUND");
      if (stake.userId !== userId) throw new Error("STAKE_FORBIDDEN");
      if (stake.status !== "completed" && stake.status !== "active") {
        throw new Error("STAKE_ALREADY_WITHDRAWN");
      }
      if (new Date(stake.endDate) > now) {
        throw new Error("STAKE_NOT_MATURE");
      }

      const dailyRate = Number(stake.dailyRate) / 100;
      const totalDurationDays = Math.floor(
        (new Date(stake.endDate).getTime() - new Date(stake.startDate).getTime()) /
          (24 * 60 * 60 * 1000),
      );
      const stakeAmount = Number(stake.amount);
      const totalProfit = stakeAmount * dailyRate * totalDurationDays;

      const principalDec = new Prisma.Decimal(stake.amount);
      const existingProfitDec = new Prisma.Decimal(stake.totalProfit);
      const totalProfitDec = new Prisma.Decimal(totalProfit);
      const profitDueDec = totalProfitDec.gt(existingProfitDec)
        ? totalProfitDec.minus(existingProfitDec)
        : new Prisma.Decimal(0);
      const lockedAlreadyDec = principalDec.plus(existingProfitDec);
      const payoutDec = principalDec.plus(totalProfitDec);

      // stakingBalance already contains principal + any profit that was
      // previously processed. Remove exactly that locked amount, then move the
      // full matured payout to main. Any not-yet-processed profit is newly
      // earned here and therefore increments totalEarned once.
      const release = await tx.balance.updateMany({
        where: {
          userId,
          stakingBalance: { gte: lockedAlreadyDec },
        },
        data: {
          stakingBalance: { decrement: lockedAlreadyDec },
          xnrtBalance: { increment: payoutDec },
          totalEarned: { increment: profitDueDec },
        },
      });

      if (release.count !== 1) {
        throw new Error("STAKE_BALANCE_INVARIANT");
      }

      const withdrawnStake = await tx.stake.update({
        where: { id: stakeId },
        data: {
          status: "withdrawn",
          totalProfit: totalProfitDec,
          lastProfitDate: stake.endDate,
        },
      });

      const tierConfig = STAKING_TIERS[stake.tier as StakingTier];
      await tx.activity.create({
        data: {
          userId,
          type: "stake_withdrawn",
          description: `Withdrew ${stakeAmount.toLocaleString()} XNRT + ${totalProfit.toLocaleString()} profit from ${tierConfig?.name ?? stake.tier}`,
        },
      });

      return {
        stake: withdrawnStake,
        totalAmount: Number(payoutDec.toString()),
        profit: Number(totalProfitDec.toString()),
      };
    });

    res.json({
      success: true,
      totalAmount: result.totalAmount,
      profit: result.profit,
    });
  } catch (error: any) {
    if (error?.message === "STAKE_NOT_FOUND") {
      return res.status(404).json({ message: "Stake not found" });
    }
    if (error?.message === "STAKE_FORBIDDEN") {
      return res.status(403).json({ message: "Unauthorized" });
    }
    if (error?.message === "STAKE_ALREADY_WITHDRAWN") {
      return res.status(409).json({ message: "Stake has already been withdrawn" });
    }
    if (error?.message === "STAKE_NOT_MATURE") {
      return res.status(400).json({ message: "Stake has not matured yet" });
    }
    if (error?.message === "STAKE_BALANCE_INVARIANT") {
      console.error("Stake balance invariant failed for", req.params.id);
      return res.status(409).json({
        message: "Stake balance is inconsistent; admin review is required",
      });
    }
    console.error("Error withdrawing stake:", error);
    res.status(500).json({ message: "Failed to withdraw stake" });
  }
});

export default router;
