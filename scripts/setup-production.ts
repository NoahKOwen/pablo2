// scripts/setup-production.ts
import { prisma } from "../server/db/client";

type SeedResult = {
  achievementsCreated: number;
  achievementsUpdated: number;
};

const DEFAULT_ACHIEVEMENTS = [
  // earnings
  {
    title: "First Earnings",
    description: "Earn your first 100 XNRT",
    icon: "💸",
    category: "earnings",
    requirement: 100,
    xpReward: 50,
  },
  {
    title: "1K Earned",
    description: "Earn a total of 1,000 XNRT",
    icon: "🏅",
    category: "earnings",
    requirement: 1000,
    xpReward: 150,
  },
  // referrals
  {
    title: "First Referral",
    description: "Invite your first direct referral",
    icon: "🤝",
    category: "referrals",
    requirement: 1,
    xpReward: 75,
  },
  {
    title: "10 Referrals",
    description: "Reach 10 direct referrals",
    icon: "🧲",
    category: "referrals",
    requirement: 10,
    xpReward: 250,
  },
  // streaks
  {
    title: "3 Day Streak",
    description: "Maintain a 3-day check-in streak",
    icon: "🔥",
    category: "streaks",
    requirement: 3,
    xpReward: 60,
  },
  {
    title: "7 Day Streak",
    description: "Maintain a 7-day check-in streak",
    icon: "⚡",
    category: "streaks",
    requirement: 7,
    xpReward: 140,
  },
  // mining
  {
    title: "First Mine",
    description: "Complete your first mining session",
    icon: "⛏️",
    category: "mining",
    requirement: 1,
    xpReward: 60,
  },
  {
    title: "10 Mines",
    description: "Complete 10 mining sessions",
    icon: "🪨",
    category: "mining",
    requirement: 10,
    xpReward: 200,
  },
] as const;

async function seedDefaults(): Promise<SeedResult> {
  let created = 0;
  let updated = 0;

  for (const a of DEFAULT_ACHIEVEMENTS) {
    const existing = await prisma.achievement.findUnique({
      where: { title: a.title },
      select: { id: true },
    });

    if (!existing) {
      await prisma.achievement.create({ data: a as any });
      created++;
    } else {
      await prisma.achievement.update({
        where: { title: a.title },
        data: a as any,
      });
      updated++;
    }
  }

  return { achievementsCreated: created, achievementsUpdated: updated };
}

async function ensureBalancesForAllUsers(): Promise<number> {
  const users = await prisma.user.findMany({ select: { id: true } });
  for (const u of users) {
    await prisma.balance.upsert({
      where: { userId: u.id },
      update: {},
      create: {
        userId: u.id,
        xnrtBalance: "0",
        stakingBalance: "0",
        miningBalance: "0",
        referralBalance: "0",
        totalEarned: "0",
      },
    });
  }
  return users.length;
}

async function main() {
  console.log("🚀 setup-production starting...");

  const dbOk = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT NOW() as now`;
  console.log("✅ DB OK:", dbOk?.[0]?.now);

  const balancesCount = await ensureBalancesForAllUsers();
  console.log(`✅ Ensured balances for ${balancesCount} users`);

  const seeded = await seedDefaults();
  console.log(
    `✅ Seeded achievements: created=${seeded.achievementsCreated}, updated=${seeded.achievementsUpdated}`,
  );

  console.log("✅ setup-production done.");
}

main()
  .catch((e) => {
    console.error("❌ setup-production failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
