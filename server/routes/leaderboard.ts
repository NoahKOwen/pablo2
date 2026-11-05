import { Router } from "express";
import { storage, generateAnonymizedHandle } from "../storage";
import { requireAuth } from "../auth/middleware";

const router = Router();

router.get("/referrals", requireAuth, async (req, res) => {
  try {
    const period = (req.query.period as string) || "all-time";
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const currentUserId = req.authUser!.id;

    const currentUser = await storage.getUser(currentUserId);
    const isAdmin = currentUser?.isAdmin || false;

    let dateFilter: string | null = null;
    const now = new Date();

    if (period === "daily") {
      dateFilter = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      ).toISOString();
    } else if (period === "weekly") {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      dateFilter = weekAgo.toISOString();
    } else if (period === "monthly") {
      const monthAgo = new Date(now);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      dateFilter = monthAgo.toISOString();
    }

    const query = `
      SELECT 
        u.id as "userId",
        u.username,
        u.email,
        COUNT(r.id) as "totalReferrals",
        COALESCE(SUM(r."totalCommission"), 0) as "totalCommission",
        COUNT(CASE WHEN r.level = 1 THEN 1 END) as "level1Count",
        COUNT(CASE WHEN r.level = 2 THEN 1 END) as "level2Count",
        COUNT(CASE WHEN r.level = 3 THEN 1 END) as "level3Count"
      FROM "User" u
      LEFT JOIN "Referral" r ON r."referrerId" = u.id
        ${dateFilter ? `AND r."createdAt" >= $1` : ""}
      GROUP BY u.id, u.username, u.email
      HAVING COUNT(r.id) > 0
      ORDER BY COUNT(r.id) DESC, COALESCE(SUM(r."totalCommission"), 0) DESC
      LIMIT $${dateFilter ? "2" : "1"}
    `;

    const leaderboard: any[] = dateFilter
      ? await storage.raw(query, [dateFilter, limit])
      : await storage.raw(query, [limit]);

    const userQuery = `
      SELECT 
        u.id as "userId",
        u.username,
        u.email,
        COUNT(r.id) as "totalReferrals",
        COALESCE(SUM(r."totalCommission"), 0) as "totalCommission",
        COUNT(CASE WHEN r.level = 1 THEN 1 END) as "level1Count",
        COUNT(CASE WHEN r.level = 2 THEN 1 END) as "level2Count",
        COUNT(CASE WHEN r.level = 3 THEN 1 END) as "level3Count"
      FROM "User" u
      LEFT JOIN "Referral" r ON r."referrerId" = u.id
        ${dateFilter ? `AND r."createdAt" >= $1` : ""}
      WHERE u.id = $${dateFilter ? "2" : "1"}
      GROUP BY u.id, u.username, u.email
    `;

    const userStats: any[] = dateFilter
      ? await storage.raw(userQuery, [dateFilter, currentUserId])
      : await storage.raw(userQuery, [currentUserId]);

    const userIndexInLeaderboard = leaderboard.findIndex(
      (item) => item.userId === currentUserId
    );

    const formattedLeaderboard = leaderboard.map((item, index) => {
      const baseData = {
        totalReferrals: parseInt(item.totalReferrals),
        totalCommission: item.totalCommission.toString(),
        level1Count: parseInt(item.level1Count),
        level2Count: parseInt(item.level2Count),
        level3Count: parseInt(item.level3Count),
        rank: index + 1,
      };

      if (isAdmin) {
        return {
          ...baseData,
          userId: item.userId,
          username: item.username,
          email: item.email,
          displayName: item.username || item.email,
        };
      } else {
        return {
          ...baseData,
          displayName: generateAnonymizedHandle(item.userId),
        };
      }
    });

    let userPosition: any = null;
    if (userStats.length > 0) {
      const raw = userStats[0];
      const baseData = {
        totalReferrals: parseInt(raw.totalReferrals),
        totalCommission: raw.totalCommission.toString(),
        level1Count: parseInt(raw.level1Count),
        level2Count: parseInt(raw.level2Count),
        level3Count: parseInt(raw.level3Count),
        rank: userIndexInLeaderboard === -1 ? null : userIndexInLeaderboard + 1,
      };

      if (isAdmin) {
        userPosition = {
          ...baseData,
          userId: raw.userId,
          username: raw.username,
          email: raw.email,
          displayName: raw.username || raw.email,
        };
      } else {
        userPosition = {
          ...baseData,
          displayName: userIndexInLeaderboard === -1 ? "You" : "You",
        };
      }
    }

    res.json({
      leaderboard: formattedLeaderboard,
      userPosition,
    });
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    res.status(500).json({ message: "Failed to fetch leaderboard" });
  }
});

router.get("/xp", requireAuth, async (req, res) => {
  try {
    const period = (req.query.period as string) || "all-time";
    const category = (req.query.category as string) || "overall";
    const currentUserId = req.authUser!.id;

    const currentUser = await storage.getUser(currentUserId);
    const isAdmin = currentUser?.isAdmin || false;

    const result = await storage.getXPLeaderboard(
      currentUserId,
      period,
      category,
      isAdmin
    );
    res.json(result);
  } catch (error) {
    console.error("Error fetching XP leaderboard:", error);
    res.status(500).json({ message: "Failed to fetch XP leaderboard" });
  }
});

export default router;
