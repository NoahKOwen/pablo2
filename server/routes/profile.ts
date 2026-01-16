import { Router, Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { requireAuth, validateCSRF } from "../auth/middleware";
import { prisma } from "./shared";

const router = Router();

interface UserTask {
  completed: boolean;
  [key: string]: any;
}

router.get("/stats", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.authUser!.id;
    const stakes = await storage.getStakes(userId);
    const miningSessions = await storage.getMiningHistory(userId);
    const referrals = await storage.getReferralsByReferrer(userId);
    const userTasks = await storage.getUserTasks(userId);
    const userAchievements = await storage.getUserAchievements(userId);

    res.json({
      totalReferrals: referrals.length,
      activeStakes: stakes.filter((s) => s.status === "active").length,
      totalStaked: stakes.reduce((sum, s) => sum + parseFloat(s.amount), 0),
      miningSessions: miningSessions.filter((s) => s.status === "completed").length,
      totalMined: miningSessions.reduce((sum, s) => sum + s.finalReward, 0),
      referralEarnings: referrals.reduce(
        (sum, r) => sum + parseFloat(r.totalCommission),
        0
      ),
      // ✅ Fix: explicit type for t
      tasksCompleted: userTasks.filter((t: UserTask) => t.completed).length,
      achievementsUnlocked: userAchievements.length,
    });
  } catch (error) {
    console.error("Error fetching profile stats:", error);
    res.status(500).json({ message: "Failed to fetch profile stats" });
  }
});

export default router;

export const checkinRouter = Router();

checkinRouter.post("/", requireAuth, validateCSRF, async (req: Request, res: Response) => {
  try {
    const userId = req.authUser!.id;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const lastCheckIn = user.lastCheckIn ? new Date(user.lastCheckIn) : null;
    const lastCheckInDay = lastCheckIn
      ? new Date(
          lastCheckIn.getFullYear(),
          lastCheckIn.getMonth(),
          lastCheckIn.getDate()
        )
      : null;
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let newStreak = 1;
    if (lastCheckInDay && lastCheckInDay.getTime() === yesterday.getTime()) {
      newStreak = (user.streak || 0) + 1;
    }

    const streakReward = Math.min(newStreak * 10, 100);
    const xpReward = Math.min(newStreak * 5, 50);

    if (lastCheckIn && lastCheckInDay && lastCheckInDay.getTime() === today.getTime()) {
      return res.status(400).json({ message: "Already checked in today" });
    }

    await storage.updateUser(userId, {
      lastCheckIn: now,
      streak: newStreak,
      xp: (user.xp || 0) + xpReward,
    });

    const balance = await storage.getBalance(userId);
    if (balance) {
      await storage.updateBalance(userId, {
        xnrtBalance: (parseFloat(balance.xnrtBalance) + streakReward).toString(),
        totalEarned: (parseFloat(balance.totalEarned) + streakReward).toString(),
      });
    }

    await storage.createActivity({
      userId,
      type: "daily_checkin",
      description: `Day ${newStreak} streak! Earned ${streakReward} XNRT and ${xpReward} XP`,
    });

    await storage.checkAndUnlockAchievements(userId);

    res.json({
      streak: newStreak,
      xnrtReward: streakReward,
      xpReward,
      message: `Day ${newStreak} check-in complete!`,
    });
  } catch (error) {
    console.error("Error during check-in:", error);
    res.status(500).json({ message: "Failed to check in" });
  }
});

checkinRouter.get("/history", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.authUser!.id;
    const { year, month } = req.query;

    const now = new Date();
    const targetYear = year ? parseInt(year as string, 10) : now.getFullYear();

    let targetMonth: number;
    if (typeof month !== "undefined") {
      const monthNum = parseInt(month as string, 10);
      const clamped = Math.min(Math.max(monthNum, 1), 12);
      targetMonth = clamped - 1;
    } else {
      targetMonth = now.getMonth();
    }

    const startDate = new Date(targetYear, targetMonth, 1);
    const endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);

    const checkinActivities = await prisma.activity.findMany({
      where: {
        userId,
        type: "daily_checkin",
        createdAt: { gte: startDate, lte: endDate },
      },
      orderBy: { createdAt: "asc" },
    });

    const checkinDates = checkinActivities.map(
      (activity: { createdAt: Date | null }) =>
        new Date(activity.createdAt!).toISOString().split("T")[0]
    );

    res.json({ dates: checkinDates, year: targetYear, month: targetMonth });
  } catch (error) {
    console.error("Error fetching check-in history:", error);
    res.status(500).json({ message: "Failed to fetch check-in history" });
  }
});
