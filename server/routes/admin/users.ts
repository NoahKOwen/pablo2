import { Router } from "express";
import { storage } from "../../storage";
import { requireAuth, requireAdmin } from "../../auth/middleware";

const router = Router();

router.get("/", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const allUsers = await storage.getAllUsers();

    const usersWithData = await Promise.all(
      allUsers.map(async (user) => {
        const balance = await storage.getBalance(user.id);
        const stakes = await storage.getStakes(user.id);
        const referrals = await storage.getReferralsByReferrer(user.id);
        const transactions = await storage.getTransactionsByUser(user.id);

        const activeStakes = stakes.filter((s) => s.status === "active").length;
        const totalStaked = stakes
          .filter((s) => s.status === "active")
          .reduce((sum, s) => sum + parseFloat(s.amount), 0);

        const depositCount = transactions.filter(
          (t) => t.type === "deposit" && t.status === "approved"
        ).length;
        const withdrawalCount = transactions.filter(
          (t) => t.type === "withdrawal" && t.status === "approved"
        ).length;

        return {
          id: user.id,
          email: user.email,
          username: user.username,
          referralCode: user.referralCode,
          isAdmin: user.isAdmin,
          xp: user.xp,
          level: user.level,
          streak: user.streak,
          createdAt: user.createdAt,
          balance: balance
            ? {
                xnrtBalance: balance.xnrtBalance,
                stakingBalance: balance.stakingBalance,
                miningBalance: balance.miningBalance,
                referralBalance: balance.referralBalance,
                totalEarned: balance.totalEarned,
              }
            : null,
          stats: {
            activeStakes,
            totalStaked: totalStaked.toString(),
            referralsCount: referrals.length,
            depositCount,
            withdrawalCount,
          },
        };
      })
    );

    res.json(usersWithData);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

export default router;
