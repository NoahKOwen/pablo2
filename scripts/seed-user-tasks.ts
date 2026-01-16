import { prisma } from "../server/db/client";

async function main() {
  console.log("Linking tasks to users…");

  const users = await prisma.user.findMany();
  const tasks = await prisma.task.findMany({
    where: { isActive: true },
  });

  console.log(`Found ${users.length} users and ${tasks.length} active tasks`);

  for (const user of users) {
    const existingUserTasks = await prisma.userTask.findMany({
      where: { userId: user.id },
      select: { taskId: true },
    });
    const existingIds = new Set(existingUserTasks.map((ut: any) => ut.taskId));

    const missingTasks = tasks.filter((t: any) => !existingIds.has(t.id));
    if (missingTasks.length === 0) continue;

    await prisma.userTask.createMany({
      data: missingTasks.map((task: any) => ({
        userId: user.id,
        taskId: task.id,
        progress: 0,
        maxProgress: 1,
        completed: false,
      })),
      skipDuplicates: true,
    });

    console.log(
      `User ${user.email} → created ${missingTasks.length} userTask rows`
    );
  }

  console.log("✅ Finished linking tasks to users");
}

main()
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
