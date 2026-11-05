// server/routes/balance.ts
import { Router } from "express";
import { storage } from "../storage";
import { requireAuth } from "../auth/middleware";

const router = Router();

router.get("/balance", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const balance = await storage.getBalance(userId);
    res.json(
      balance || {
        xnrtBalance: "0",
        stakingBalance: "0",
        miningBalance: "0",
        referralBalance: "0",
        totalEarned: "0",
      },
    );
  } catch (error) {
    console.error("Error fetching balance:", error);
    res.status(500).json({ message: "Failed to fetch balance" });
  }
});

router.get("/stats", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const stakes = await storage.getStakes(userId);
    const miningSessions = await storage.getMiningHistory(userId);
    const referrals = await storage.getReferralsByReferrer(userId);
    const recentActivity = await storage.getActivities(userId, 5);

    res.json({
      activeStakes: stakes.filter((s) => s.status === "active").length,
      miningSessions: miningSessions.filter(
        (s) => s.status === "completed",
      ).length,
      totalReferrals: referrals.length,
      recentActivity,
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({ message: "Failed to fetch stats" });
  }
});

export default router;
