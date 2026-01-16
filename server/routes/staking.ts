import { Router } from "express";
import { storage } from "../storage";
import { requireAuth, validateCSRF } from "../auth/middleware";
import { STAKING_TIERS, type StakingTier } from "../../shared/schema";

const router = Router();

// Simple in-memory lock so staking rewards don't run in parallel
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
    const stakeAmount = parseFloat(amount);

    if (Number.isNaN(stakeAmount)) {
      return res.status(400).json({ message: "Invalid stake amount" });
    }

    if (stakeAmount < tierConfig.minAmount || stakeAmount > tierConfig.maxAmount) {
      return res.status(400).json({
        message: `Stake amount must be between ${tierConfig.minAmount} and ${tierConfig.maxAmount} XNRT`,
      });
    }

    const balance = await storage.getBalance(userId);
    if (!balance || parseFloat(balance.xnrtBalance) < stakeAmount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    const startDate = new Date();
    const endDate = new Date(
      startDate.getTime() + tierConfig.duration * 24 * 60 * 60 * 1000
    );

    const stake = await storage.createStake({
      userId,
      tier,
      amount: stakeAmount.toString(),
      dailyRate: tierConfig.dailyRate.toString(),
      duration: tierConfig.duration,
      startDate,
      endDate,
      totalProfit: "0",
      lastProfitDate: null,
      status: "active",
    });

    await storage.updateBalance(userId, {
      xnrtBalance: (parseFloat(balance.xnrtBalance) - stakeAmount).toString(),
      stakingBalance: (parseFloat(balance.stakingBalance) + stakeAmount).toString(),
    });

    await storage.createActivity({
      userId,
      type: "stake_created",
      description: `Staked ${stakeAmount.toLocaleString()} XNRT in ${tierConfig.name}`,
    });

    res.json(stake);
  } catch (error) {
    console.error("Error creating stake:", error);
    res.status(500).json({ message: "Failed to create stake" });
  }
});

router.post("/process-rewards", requireAuth, validateCSRF, async (_req, res) => {
  if (isProcessingStakingRewards) {
    // Avoid double-running if user spams the button / multiple tabs
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

    const stake = await storage.getStakeById(stakeId);

    if (!stake) return res.status(404).json({ message: "Stake not found" });
    if (stake.userId !== userId)
      return res.status(403).json({ message: "Unauthorized" });

    if (stake.status !== "completed" && stake.status !== "active") {
      return res.status(400).json({
        message: "Stake has already been withdrawn or is not ready for withdrawal",
      });
    }

    if (new Date(stake.endDate) > new Date()) {
      return res.status(400).json({ message: "Stake has not matured yet" });
    }

    const dailyRate = parseFloat(stake.dailyRate) / 100;
    const startDate = new Date(stake.startDate);
    const endDate = new Date(stake.endDate);
    const totalDurationDays = Math.floor(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const stakeAmount = parseFloat(stake.amount);
    const dailyProfit = stakeAmount * dailyRate;
    const totalProfit = dailyProfit * totalDurationDays;

    const withdrawnStake = await storage.atomicWithdrawStake(
      stakeId,
      totalProfit.toString()
    );
    if (!withdrawnStake)
      return res.status(409).json({ message: "Stake has already been withdrawn" });

    const balance = await storage.getBalance(userId);
    if (!balance) return res.status(404).json({ message: "Balance not found" });

    const totalWithdrawalAmount = stakeAmount + totalProfit;

    await storage.updateBalance(userId, {
      xnrtBalance: (parseFloat(balance.xnrtBalance) + totalWithdrawalAmount).toString(),
      stakingBalance: (parseFloat(balance.stakingBalance) - stakeAmount).toString(),
    });

    const tierConfig = STAKING_TIERS[stake.tier as StakingTier];
    await storage.createActivity({
      userId,
      type: "stake_withdrawn",
      description: `Withdrew ${stakeAmount.toLocaleString()} XNRT + ${totalProfit.toLocaleString()} profit from ${tierConfig.name}`,
    });

    res.json({ success: true, totalAmount: totalWithdrawalAmount, profit: totalProfit });
  } catch (error) {
    console.error("Error withdrawing stake:", error);
    res.status(500).json({ message: "Failed to withdraw stake" });
  }
});

export default router;
