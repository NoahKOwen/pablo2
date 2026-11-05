// scripts/seed-tasks.ts
import { prisma } from "../server/db/client";

const socialTasks = [
  {
    title: "Join WhatsApp Community",
    description:
      "Join our official WhatsApp community: https://chat.whatsapp.com/J2muMVwoE0JLJ4NXyMfUud",
    category: "special",
    xpReward: 10,
    xnrtReward: 50,
    requirements: "Tap the link, join the group, then click Complete.",
  },
  {
    title: "Join WhatsApp Channel",
    description:
      "Join our WhatsApp channel for official updates: https://whatsapp.com/channel/0029VbAxIu37tkj916KzQf1Z",
    category: "special",
    xpReward: 10,
    xnrtReward: 50,
    requirements: "Join the channel, then return here and press Complete.",
  },
  {
    title: "Join Telegram (Main)",
    description:
      "Join our main Telegram community: https://t.me/nextgen_xnrt",
    category: "special",
    xpReward: 10,
    xnrtReward: 50,
    requirements: "Join the group with your XNRT account email/username.",
  },
  {
    title: "Join Telegram (Token Updates)",
    description: "Join token updates channel: https://t.me/xnrt_token",
    category: "special",
    xpReward: 10,
    xnrtReward: 50,
    requirements: "Join and keep notifications on.",
  },
  {
    title: "Join Telegram (Official)",
    description: "Join official XNRT channel: https://t.me/xnrt_official",
    category: "special",
    xpReward: 10,
    xnrtReward: 50,
    requirements: "Join the official channel.",
  },
  {
    title: "Follow XNRT on X (Twitter)",
    description: "Follow our X account: https://x.com/XNRT112065",
    category: "special",
    xpReward: 10,
    xnrtReward: 50,
    requirements: "Follow the account and like the latest post.",
  },
  {
    title: "Follow XNRT on Facebook",
    description:
      "Like our official Facebook page: https://web.facebook.com/profile.php?id=61582524188909",
    category: "special",
    xpReward: 10,
    xnrtReward: 50,
    requirements: "Like the page and enable notifications.",
  },
  {
    title: "Follow XNRT on Instagram",
    description:
      "Follow our Instagram and like the latest post: https://www.instagram.com/p/DQIF4OdEXij/",
    category: "special",
    xpReward: 10,
    xnrtReward: 50,
    requirements: "Follow the account and like the pinned/last post.",
  },
];

async function main() {
  console.log("Seeding social tasks…");

  for (const t of socialTasks) {
    const existing = await prisma.task.findFirst({
      where: { title: t.title },
    });

    if (existing) {
      console.log(`Updating existing task: ${t.title}`);
      await prisma.task.update({
        where: { id: existing.id },
        data: {
          xpReward: t.xpReward,
          xnrtReward: t.xnrtReward,
          description: t.description,
          category: t.category,
          requirements: t.requirements,
          isActive: true,
        },
      });
      continue;
    }

    await prisma.task.create({
      data: {
        title: t.title,
        description: t.description,
        category: t.category,
        xpReward: t.xpReward,
        xnrtReward: t.xnrtReward,
        requirements: t.requirements,
        isActive: true,
      },
    });

    console.log(`Created task: ${t.title}`);
  }

  console.log("✅ Social tasks seeding done.");
}

main()
  .catch((err) => {
    console.error("❌ Error seeding tasks:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
