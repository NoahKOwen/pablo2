import { Router } from "express";
import { storage } from "../storage";
import { requireAuth, validateCSRF } from "../auth/middleware";
import { prisma } from "./shared";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const allAchievements = await storage.getAllAchievements();
    const userAchievements = await storage.getUserAchievements(userId);

    const populated = allAchievements.map((achievement: any) => {
      const ua = (userAchievements as any[]).find(
        (x) => x.achievementId === achievement.id,
      );

      const unlocked = !!ua;
      const claimed = !!ua?.claimed;
      const claimedAt = ua?.claimedAt ?? null;

      return {
        ...achievement,
        unlocked,
        // Prisma model has unlockedAt; no createdAt field needed as fallback
        unlockedAt: ua?.unlockedAt ?? null,
        claimed,
        claimedAt,
        claimable: unlocked && !claimed,
      };
    });

    res.json(populated);
  } catch (error) {
    console.error("Error fetching achievements:", error);
    res.status(500).json({ message: "Failed to fetch achievements" });
  }
});

router.post("/:id/claim", requireAuth, validateCSRF, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const achievementId = req.params.id;

    // 1) Ensure achievement exists
    const achievement = await prisma.achievement.findUnique({
      where: { id: achievementId },
    });
    if (!achievement) {
      return res.status(404).json({ message: "Achievement not found" });
    }

    // 2) Use a transaction with a claimed: false guard to avoid double-claim
    const result = await prisma.$transaction(async (tx: any) => {
      // Re-fetch inside transaction to avoid stale reads
      const userAchievement = await tx.userAchievement.findFirst({
        where: { userId, achievementId },
      });

      if (!userAchievement) {
        throw new Error("ACHIEVEMENT_NOT_UNLOCKED");
      }

      if (userAchievement.claimed) {
        throw new Error("ACHIEVEMENT_ALREADY_CLAIMED");
      }

      const now = new Date();

      const updateResult = await tx.userAchievement.updateMany({
        where: { id: userAchievement.id, claimed: false },
        data: {
          claimed: true,
          claimedAt: now,
        },
      });

      if (updateResult.count === 0) {
        // Another concurrent transaction claimed it first
        throw new Error("ACHIEVEMENT_ALREADY_CLAIMED");
      }

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          xp: { increment: achievement.xpReward },
        },
        select: { xp: true },
      });

      return {
        claimedAt: now,
        newXp: updatedUser.xp,
      };
    });

    // 3) Activity log (via Drizzle / storage)
    await storage.createActivity({
      userId,
      type: "achievement_claimed",
      description: `Claimed achievement: ${achievement.title}`,
      metadata: JSON.stringify({
        achievementId: achievement.id,
        xpReward: achievement.xpReward,
        newXp: result.newXp,
      }),
    });

    // 4) Response
    res.json({
      achievementId,
      claimed: true,
      claimedAt: result.claimedAt,
      newXp: result.newXp,
    });
  } catch (error: any) {
    if (error?.message === "ACHIEVEMENT_NOT_UNLOCKED") {
      return res.status(400).json({ message: "Achievement not unlocked yet" });
    }
    if (error?.message === "ACHIEVEMENT_ALREADY_CLAIMED") {
      return res.status(400).json({ message: "Achievement already claimed" });
    }

    console.error("Error claiming achievement:", error);
    res.status(500).json({ message: "Failed to claim achievement" });
  }
});

export default router;
