// server/routes/shared.ts
import rateLimit from "express-rate-limit";
import webpush from "web-push";
import { TRUST_LOAN_CONFIG } from "../../shared/trust-loan";
import { prisma, Prisma } from "../db/client";

export { prisma };

// Use Prisma.Decimal safely (works with our db/client.ts export)
const DecimalCtor = (Prisma as any).Decimal as new (value: any) => any;

export async function getDirectReferralStats(userId: string) {
  const directs = await prisma.referral.findMany({
    where: { referrerId: userId, level: 1 },
    select: { referredUserId: true },
  });

  const directCount = directs.length;
  if (!directCount) return { directCount: 0, investingCount: 0 };

  const ids = directs.map((d: { referredUserId: string }) => d.referredUserId);

  const investingRows = await prisma.transaction.groupBy({
    by: ["userId"],
    where: {
      userId: { in: ids },
      type: "deposit",
      status: "approved",
      usdtAmount: {
        gte: new DecimalCtor(TRUST_LOAN_CONFIG.minInvestUsdtPerReferral),
      },
    },
    _count: { _all: true },
  });

  const investingCount = investingRows.length;
  return { directCount, investingCount };
}

const VAPID_PUBLIC_KEY = (process.env.VAPID_PUBLIC_KEY || "")
  .replace(/^"publicKey":"/, "")
  .replace(/"$/, "");

const VAPID_PRIVATE_KEY = (process.env.VAPID_PRIVATE_KEY || "")
  .replace(/^"privateKey":"/, "")
  .replace(/}$/, "")
  .replace(/"$/, "");

const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:support@xnrt.org";

export { VAPID_PUBLIC_KEY };

export const MINING_BASE_REWARD_XP = 5;
export const MINING_XP_TO_XNRT_RATE = 4;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export const pushSubscriptionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { message: "Too many subscription requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "development",
});

export const DEFAULT_ACHIEVEMENTS = [
  {
    title: "Sign-in Bonus",
    description: "Claim your first daily check-in reward",
    icon: "✅",
    category: "streaks",
    requirement: 1,
    xpReward: 5,
  },
  {
    title: "First Earnings",
    description: "Earn a total of 1,000 XNRT from any source",
    icon: "💰",
    category: "earnings",
    requirement: 1000,
    xpReward: 25,
  },
  {
    title: "Rising Earner",
    description: "Earn a total of 5,000 XNRT",
    icon: "📈",
    category: "earnings",
    requirement: 5000,
    xpReward: 75,
  },
  {
    title: "Pro Earner",
    description: "Earn a total of 25,000 XNRT",
    icon: "🏅",
    category: "earnings",
    requirement: 25000,
    xpReward: 150,
  },
  {
    title: "First Referral",
    description: "Invite your first friend to XNRT",
    icon: "👥",
    category: "referrals",
    requirement: 1,
    xpReward: 25,
  },
  {
    title: "Team Builder",
    description: "Refer 5 direct users",
    icon: "🧱",
    category: "referrals",
    requirement: 5,
    xpReward: 75,
  },
  {
    title: "Community Leader",
    description: "Refer 25 direct users",
    icon: "👑",
    category: "referrals",
    requirement: 25,
    xpReward: 200,
  },
  {
    title: "3-Day Streak",
    description: "Check in 3 days in a row",
    icon: "🔥",
    category: "streaks",
    requirement: 3,
    xpReward: 30,
  },
  {
    title: "Weekly Grinder",
    description: "Maintain a 7-day login streak",
    icon: "📆",
    category: "streaks",
    requirement: 7,
    xpReward: 70,
  },
  {
    title: "Monthly Legend",
    description: "Maintain a 30-day login streak",
    icon: "🏆",
    category: "streaks",
    requirement: 30,
    xpReward: 200,
  },
  {
    title: "First Mining Session",
    description: "Complete your first mining session",
    icon: "⛏️",
    category: "mining",
    requirement: 1,
    xpReward: 15,
  },
  {
    title: "Daily Miner",
    description: "Complete 10 mining sessions",
    icon: "🪙",
    category: "mining",
    requirement: 10,
    xpReward: 60,
  },
  {
    title: "Pro Miner",
    description: "Complete 50 mining sessions",
    icon: "⚙️",
    category: "mining",
    requirement: 50,
    xpReward: 200,
  },
];

export function parseAchievementPayload(body: any) {
  const {
    title,
    description,
    icon = "🏆",
    category = "earnings",
    requirement,
    xpReward,
  } = body || {};

  if (!title || !description) {
    throw new Error("Title and description are required");
  }

  const requirementNum = Number(requirement);
  const xpRewardNum = Number(xpReward);

  if (!Number.isFinite(requirementNum) || requirementNum < 0) {
    throw new Error("Invalid requirement");
  }
  if (!Number.isFinite(xpRewardNum) || xpRewardNum < 0) {
    throw new Error("Invalid XP reward");
  }

  const allowedCategories = new Set(["earnings", "referrals", "streaks", "mining"]);
  const categoryStr = String(category);

  return {
    title: String(title),
    description: String(description),
    icon: String(icon || "🏆"),
    category: allowedCategories.has(categoryStr) ? categoryStr : "earnings",
    requirement: Math.floor(requirementNum),
    xpReward: Math.floor(xpRewardNum),
  };
}

export async function ensureDefaultAchievements() {
  for (const def of DEFAULT_ACHIEVEMENTS) {
    try {
      await prisma.achievement.upsert({
        where: { title: def.title },
        create: def,
        update: {
          description: def.description,
          icon: def.icon,
          category: def.category,
          requirement: def.requirement,
          xpReward: def.xpReward,
        },
      });
    } catch (err) {
      console.error(
        "[Achievements] Failed to upsert default achievement",
        def.title,
        err,
      );
    }
  }
}
