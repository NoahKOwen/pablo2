import express, { type Express } from "express";
import { createServer, type Server } from "http";
import authRoutes from "../auth/routes";
import { ensureDefaultAchievements, prisma } from "./shared";

import balanceRouter from "./balance";
import stakingRouter from "./staking";
import miningRouter from "./mining";
import referralsRouter from "./referrals";
import notificationsRouter, { pushRouter } from "./notifications";
import leaderboardRouter from "./leaderboard";
import transactionsRouter from "./transactions";
import walletRouter from "./wallet";
import tasksRouter from "./tasks";
import achievementsRouter from "./achievements";
import profileRouter, { checkinRouter } from "./profile";
import announcementsRouter from "./announcements";
import trustLoanRouter from "./trust-loan";
import adminRouter from "./admin";

export { prisma };

export async function registerRoutes(app: Express): Promise<Server> {
  const skipAchievements =
    (process.env.SKIP_ACHIEVEMENTS_SEED ?? "false").toLowerCase() === "true";

  if (skipAchievements) {
    console.log("[Achievements] Seeding skipped because SKIP_ACHIEVEMENTS_SEED=true");
  } else {
    try {
      await ensureDefaultAchievements();
    } catch (err) {
      console.error("[Achievements] ensureDefaultAchievements failed during startup:", err);
    }
  }

  app.post(
    "/csp-report",
    express.json({ type: "application/csp-report" }),
    (req, res) => {
      if (req.body && Object.keys(req.body).length > 0) {
        console.log("[CSP Violation]", JSON.stringify(req.body, null, 2));
      }
      res.status(204).end();
    },
  );

  app.use("/auth", authRoutes);

  app.use("/api", balanceRouter);
  app.use("/api/stakes", stakingRouter);
  app.use("/api/mining", miningRouter);
  app.use("/api/referrals", referralsRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/push", pushRouter);
  app.use("/api/leaderboard", leaderboardRouter);
  app.use("/api/transactions", transactionsRouter);
  app.use("/api/wallet", walletRouter);
  app.use("/api/tasks", tasksRouter);
  app.use("/api/achievements", achievementsRouter);
  app.use("/api/profile", profileRouter);
  app.use("/api/checkin", checkinRouter);
  app.use("/api/announcements", announcementsRouter);
  app.use("/api/trust-loan", trustLoanRouter);
  app.use("/api/admin", adminRouter);

  return createServer(app);
}
