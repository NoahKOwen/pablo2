import { Router } from "express";
import { storage } from "../../storage";
import { requireAuth, requireAdmin } from "../../auth/middleware";
import { prisma } from "../shared";

const router = Router();

router.get("/", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const allUsers = await storage.getAllUsers();
    const allDeposits = await storage.getAllTransactions("deposit");
    const allWithdrawals = await storage.getAllTransactions("withdrawal");
    const activeStakes = await storage.getAllActiveStakes();

    const pendingDeposits = allDeposits.filter((d) => d.status === "pending");
    const pendingWithdrawals = allWithdrawals.filter((w) => w.status === "pending");

    const totalDeposits = allDeposits
      .filter((d) => d.status === "approved")
      .reduce((sum, d) => sum + parseFloat(d.amount), 0);
    const totalWithdrawals = allWithdrawals
      .filter((w) => w.status === "approved")
      .reduce((sum, w) => sum + parseFloat(w.amount), 0);

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const todayDeposits = allDeposits
      .filter(
        (d) =>
          d.status === "approved" && d.createdAt && new Date(d.createdAt) >= today
      )
      .reduce((sum, d) => sum + parseFloat(d.amount), 0);

    const todayWithdrawals = allWithdrawals
      .filter(
        (w) =>
          w.status === "approved" && w.createdAt && new Date(w.createdAt) >= today
      )
      .reduce((sum, w) => sum + parseFloat(w.amount), 0);

    const todayNewUsers = allUsers.filter(
      (u) => u.createdAt && new Date(u.createdAt) >= today
    ).length;

    const activeStakesCount = activeStakes.length;

    res.json({
      totalUsers: allUsers.length,
      totalDeposits: totalDeposits.toString(),
      totalWithdrawals: totalWithdrawals.toString(),
      pendingDepositsCount: pendingDeposits.length,
      pendingWithdrawalsCount: pendingWithdrawals.length,
      todayDeposits: todayDeposits.toString(),
      todayWithdrawals: todayWithdrawals.toString(),
      todayNewUsers,
      activeStakesCount,
    });
  } catch (error) {
    console.error("Error fetching admin stats:", error);
    res.status(500).json({ message: "Failed to fetch admin stats" });
  }
});

router.get("/analytics", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const allTransactions = await storage.getAllTransactions();
    const allUsers = await storage.getAllUsers();
    const allStakes = await storage.getAllActiveStakes();

    const dailyData: Record<
      string,
      { deposits: number; withdrawals: number; revenue: number }
    > = {};
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    allTransactions.forEach((tx) => {
      if (tx.createdAt) {
        const txDate = new Date(tx.createdAt);
        if (txDate >= thirtyDaysAgo) {
          const dateKey = txDate.toISOString().split("T")[0];
          if (!dailyData[dateKey]) {
            dailyData[dateKey] = { deposits: 0, withdrawals: 0, revenue: 0 };
          }

          if (tx.type === "deposit" && tx.status === "approved") {
            dailyData[dateKey].deposits += parseFloat(tx.amount);
          } else if (tx.type === "withdrawal" && tx.status === "approved") {
            dailyData[dateKey].withdrawals += parseFloat(tx.amount);
            dailyData[dateKey].revenue += parseFloat(tx.amount) * 0.02;
          }
        }
      }
    });

    const dailyUsers: Record<string, number> = {};
    allUsers.forEach((user) => {
      if (user.createdAt) {
        const userDate = new Date(user.createdAt);
        if (userDate >= thirtyDaysAgo) {
          const dateKey = userDate.toISOString().split("T")[0];
          dailyUsers[dateKey] = (dailyUsers[dateKey] || 0) + 1;
        }
      }
    });

    const stakingTiers = {
      "Royal Sapphire": 0,
      "Legendary Emerald": 0,
      "Imperial Platinum": 0,
      "Mythic Diamond": 0,
    };

    allStakes.forEach((stake) => {
      const amount = parseFloat(stake.amount);
      if (amount >= 100000) stakingTiers["Mythic Diamond"]++;
      else if (amount >= 50000) stakingTiers["Imperial Platinum"]++;
      else if (amount >= 10000) stakingTiers["Legendary Emerald"]++;
      else stakingTiers["Royal Sapphire"]++;
    });

    const [balancesAgg, referralsAgg] = await Promise.all([
      prisma.balance.aggregate({
        _sum: { referralBalance: true },
      }),
      prisma.referral.groupBy({
        by: ["referrerId"],
        _count: { referrerId: true },
      }),
    ]);

    const totalReferralBalance = balancesAgg._sum.referralBalance || 0;
    const activeReferrers = referralsAgg.length;
    const totalReferrals = referralsAgg.reduce(
      (sum: number, r: any) => sum + (r._count.referrerId || 0),
      0
    );

    const referralStats = {
      totalCommissions: Number(totalReferralBalance),
      totalReferrals,
      activeReferrers,
    };

    const totalRevenue = Object.values(dailyData).reduce(
      (sum, day) => sum + day.revenue,
      0
    );

    res.json({
      dailyTransactions: Object.entries(dailyData)
        .map(([date, data]) => ({
          date,
          deposits: data.deposits,
          withdrawals: data.withdrawals,
          revenue: data.revenue,
        }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      userGrowth: Object.entries(dailyUsers)
        .map(([date, count]) => ({ date, newUsers: count }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      stakingTiers,
      referralStats,
      totalRevenue,
      totalUsers: allUsers.length,
      totalStakes: allStakes.length,
    });
  } catch (error) {
    console.error("Error fetching analytics:", error);
    res.status(500).json({ message: "Failed to fetch analytics" });
  }
});

router.get("/analytics/realtime", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const activeUsers = await prisma.activity.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: fifteenMinutesAgo } },
    });

    const todayDeposits = await prisma.transaction.aggregate({
      where: {
        type: "deposit",
        status: "approved",
        createdAt: { gte: startOfToday },
      },
      _count: true,
      _sum: { amount: true },
    });

    const todayWithdrawals = await prisma.transaction.aggregate({
      where: {
        type: "withdrawal",
        status: "approved",
        createdAt: { gte: startOfToday },
      },
      _count: true,
      _sum: { amount: true },
    });

    const [pendingDeposits, pendingWithdrawals] = await Promise.all([
      prisma.transaction.count({
        where: { type: "deposit", status: "pending" },
      }),
      prisma.transaction.count({
        where: { type: "withdrawal", status: "pending" },
      }),
    ]);

    res.json({
      activeUsers: activeUsers.length,
      todayDeposits: {
        count: todayDeposits._count,
        total: Number(todayDeposits._sum.amount || 0),
      },
      todayWithdrawals: {
        count: todayWithdrawals._count,
        total: Number(todayWithdrawals._sum.amount || 0),
      },
      pendingTransactions: {
        deposits: pendingDeposits,
        withdrawals: pendingWithdrawals,
        total: pendingDeposits + pendingWithdrawals,
      },
    });
  } catch (error) {
    console.error("Error fetching real-time analytics:", error);
    res.status(500).json({ message: "Failed to fetch real-time analytics" });
  }
});

router.get("/analytics/export", requireAuth, requireAdmin, async (req, res) => {
  try {
    const format = (req.query.format as string) || "csv";

    const allTransactions = await storage.getAllTransactions();
    const allUsers = await storage.getAllUsers();
    const allStakes = await storage.getAllActiveStakes();

    const dailyData: Record<
      string,
      { deposits: number; withdrawals: number; revenue: number }
    > = {};
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    allTransactions.forEach((tx) => {
      if (tx.createdAt) {
        const txDate = new Date(tx.createdAt);
        if (txDate >= thirtyDaysAgo) {
          const dateKey = txDate.toISOString().split("T")[0];
          if (!dailyData[dateKey]) {
            dailyData[dateKey] = { deposits: 0, withdrawals: 0, revenue: 0 };
          }

          if (tx.type === "deposit" && tx.status === "approved") {
            dailyData[dateKey].deposits += parseFloat(tx.amount);
          } else if (tx.type === "withdrawal" && tx.status === "approved") {
            dailyData[dateKey].withdrawals += parseFloat(tx.amount);
            dailyData[dateKey].revenue += parseFloat(tx.amount) * 0.02;
          }
        }
      }
    });

    const totalRevenue = Object.values(dailyData).reduce(
      (sum, day) => sum + day.revenue,
      0
    );

    if (format === "csv") {
      let csv = "Date,Deposits (XNRT),Withdrawals (XNRT),Revenue (XNRT)\n";
      Object.entries(dailyData)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .forEach(([date, data]) => {
          csv += `${date},${data.deposits},${data.withdrawals},${data.revenue}\n`;
        });

      csv += `\nSummary\n`;
      csv += `Total Users,${allUsers.length}\n`;
      csv += `Total Active Stakes,${allStakes.length}\n`;
      csv += `Total Revenue (30 days),${totalRevenue}\n`;

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=xnrt-analytics-${
          new Date().toISOString().split("T")[0]
        }.csv`
      );
      res.send(csv);
    } else {
      const jsonData = {
        exportDate: new Date().toISOString(),
        summary: {
          totalUsers: allUsers.length,
          totalActiveStakes: allStakes.length,
          totalRevenue30Days: totalRevenue,
        },
        dailyTransactions: Object.entries(dailyData)
          .map(([date, data]) => ({
            date,
            deposits: data.deposits,
            withdrawals: data.withdrawals,
            revenue: data.revenue,
          }))
          .sort((a, b) => a.date.localeCompare(b.date)),
      };

      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=xnrt-analytics-${
          new Date().toISOString().split("T")[0]
        }.json`
      );
      res.json(jsonData);
    }
  } catch (error) {
    console.error("Error exporting analytics:", error);
    res.status(500).json({ message: "Failed to export analytics" });
  }
});

router.get("/activities", requireAuth, requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;

    const adminUsers = await prisma.user.findMany({
      where: { isAdmin: true },
      select: { id: true },
    });
    const adminUserIds = adminUsers.map((u: any) => u.id);

    const activities = await prisma.activity.findMany({
      where: {
        OR: [
          { userId: { in: adminUserIds } },
          {
            type: {
              in: [
                "deposit_approved",
                "deposit_rejected",
                "withdrawal_approved",
                "withdrawal_rejected",
              ],
            },
          },
        ],
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            isAdmin: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    res.json(activities);
  } catch (error) {
    console.error("Error fetching admin activities:", error);
    res.status(500).json({ message: "Failed to fetch admin activities" });
  }
});

router.get("/info", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [
      totalUsers,
      totalDeposits,
      totalWithdrawals,
      totalStakes,
      totalActivities,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.transaction.count({ where: { type: "deposit" } }),
      prisma.transaction.count({ where: { type: "withdrawal" } }),
      prisma.stake.count(),
      prisma.activity.count(),
    ]);

    const stakingTiers = [
      { name: "Royal Sapphire", min: 1000, max: 9999, apy: 5, duration: 30 },
      { name: "Legendary Emerald", min: 10000, max: 49999, apy: 8, duration: 60 },
      { name: "Imperial Platinum", min: 50000, max: 99999, apy: 12, duration: 90 },
      { name: "Mythic Diamond", min: 100000, max: null, apy: 15, duration: 180 },
    ];

    res.json({
      platform: {
        name: "XNRT",
        version: "1.0.0",
        environment: process.env.NODE_ENV || "development",
      },
      statistics: {
        totalUsers,
        totalDeposits,
        totalWithdrawals,
        totalStakes,
        totalActivities,
      },
      configuration: {
        stakingTiers,
        depositRate: 100,
        withdrawalFee: 2,
        companyWallet: "0x715C32deC9534d2fB34e0B567288AF8d895efB59",
      },
    });
  } catch (error) {
    console.error("Error fetching platform info:", error);
    res.status(500).json({ message: "Failed to fetch platform info" });
  }
});

export default router;
