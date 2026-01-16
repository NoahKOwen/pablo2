// scripts/check-neon-connection.ts
import { prisma } from "../server/db/client";

async function main() {
  console.log("🔌 Checking Neon connection...");

  const r = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT NOW() as now`;
  console.log("✅ Connected. DB time:", r?.[0]?.now);

  // Small sanity checks
  const userCount = await prisma.user.count();
  console.log("👥 Users:", userCount);
}

main()
  .catch((e) => {
    console.error("❌ Connection check failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
