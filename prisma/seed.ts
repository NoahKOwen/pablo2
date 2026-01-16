// prisma/seed.ts
import { prisma } from "../server/db/client";

async function main() {
  console.log("🌱 Prisma seed starting...");

  // Example: ensure every user has a Balance row
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

  console.log(`✅ Seed completed. Ensured balances for ${users.length} users.`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
