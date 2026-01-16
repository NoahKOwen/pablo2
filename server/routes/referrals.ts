import { Router } from "express";
import { storage } from "../storage";
import { requireAuth } from "../auth/middleware";

const router = Router();

router.get("/stats", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const referrals = await storage.getReferralsByReferrer(userId);
    const balance = await storage.getBalance(userId);

    const level1Total = referrals
      .filter((r) => r.level === 1)
      .reduce((sum, r) => sum + parseFloat(r.totalCommission), 0);
    const level2Total = referrals
      .filter((r) => r.level === 2)
      .reduce((sum, r) => sum + parseFloat(r.totalCommission), 0);
    const level3Total = referrals
      .filter((r) => r.level === 3)
      .reduce((sum, r) => sum + parseFloat(r.totalCommission), 0);
    const directCommissions = level1Total + level2Total + level3Total;
    const actualBalance = parseFloat(balance?.referralBalance || "0");
    const companyCommissions = actualBalance - directCommissions;

    const stats = {
      level1Count: referrals.filter((r) => r.level === 1).length,
      level2Count: referrals.filter((r) => r.level === 2).length,
      level3Count: referrals.filter((r) => r.level === 3).length,
      level1Commission: level1Total.toString(),
      level2Commission: level2Total.toString(),
      level3Commission: level3Total.toString(),
      totalCommission: referrals
        .reduce((sum, r) => sum + parseFloat(r.totalCommission), 0)
        .toString(),
      actualBalance: actualBalance.toString(),
      companyCommissions: companyCommissions.toString(),
    };

    res.json(stats);
  } catch (error) {
    console.error("Error fetching referral stats:", error);
    res.status(500).json({ message: "Failed to fetch referral stats" });
  }
});

router.get("/tree", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const referrals = await storage.getReferralsByReferrer(userId);
    res.json(referrals);
  } catch (error) {
    console.error("Error fetching referral tree:", error);
    res.status(500).json({ message: "Failed to fetch referral tree" });
  }
});

export default router;
