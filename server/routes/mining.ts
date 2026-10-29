// server/routes/mining.ts
import { Router } from "express";
import { storage } from "../storage";
import { requireAuth, requireAdmin, validateCSRF } from "../auth/middleware";
import { MINING_BASE_REWARD_XP } from "./shared";

const router = Router();

/**
 * GET /api/mining/current
 * Returns the current active mining session for the authenticated user,
 * or a simple `{ nextAvailable }` object when nothing is active.
 *
 * Note: storage.getCurrentMiningSession() will auto-complete an expired
 * session in an idempotent way and then return undefined.
 */
router.get("/current", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser!.id;

    const session = await storage.getCurrentMiningSession(userId);

    if (!session) {
      // Nothing active right now – frontend uses this to show "Ready to mine"
      return res.json({
        nextAvailable: new Date().toISOString(),
      });
    }

    res.json(session);
  } catch (error) {
    console.error("Error fetching current mining session:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch current mining session" });
  }
});

/**
 * GET /api/mining/history
 * Returns recent mining sessions for the authenticated user.
 */
router.get("/history", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const sessions = await storage.getMiningHistory(userId);
    res.json(sessions);
  } catch (error) {
    console.error("Error fetching mining history:", error);
    res.status(500).json({ message: "Failed to fetch mining history" });
  }
});

/**
 * POST /api/mining/start
 * Starts a new 24h mining session if the user has no active one.
 *
 * storage.getCurrentMiningSession() will auto-complete any expired session,
 * so if it returns a session here, it's guaranteed to still be active.
 */
router.post("/start", requireAuth, validateCSRF, async (req, res) => {
  try {
    const userId = req.authUser!.id;

    const currentSession = await storage.getCurrentMiningSession(userId);
    if (currentSession && currentSession.status === "active") {
      return res
        .status(400)
        .json({ message: "You already have an active mining session" });
    }

    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + 24 * 60 * 60 * 1000);
    const nextAvailable = new Date(endTime.getTime() + 60 * 60 * 1000); // 1h cooldown (stored for future use)

    const session = await storage.createMiningSession({
      userId,
      baseReward: MINING_BASE_REWARD_XP,
      adBoostCount: 0,
      boostPercentage: 0,
      // Let storage compute finalReward by default, but it's fine if we pass it too:
      finalReward: MINING_BASE_REWARD_XP,
      startTime,
      endTime,
      nextAvailable,
      status: "active",
    });

    res.json(session);
  } catch (error: any) {
    if (error?.code === "P2002") {
      return res
        .status(409)
        .json({ message: "You already have an active mining session" });
    }
    console.error("Error starting mining:", error);
    res.status(500).json({ message: "Failed to start mining" });
  }
});

/**
 * POST /api/mining/process-rewards
 * Optional admin endpoint to trigger processing of any completed mining sessions.
 *
 * This is safe to call multiple times because storage.processMiningRewards()
 * is idempotent (each session is rewarded exactly once).
 *
 * NOTE: The regular client no longer auto-calls this; it's mainly for
 * admin tools or cron-style jobs if you decide to use HTTP for that.
 */
router.post(
  "/process-rewards",
  requireAuth,
  requireAdmin,
  validateCSRF,
  async (_req, res) => {
    try {
      await storage.processMiningRewards();
      res.json({ ok: true });
    } catch (error) {
      console.error("Error processing mining rewards:", error);
      res.status(500).json({ message: "Failed to process mining rewards" });
    }
  },
);

export default router;
