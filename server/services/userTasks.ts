// server/services/userTasks.ts
import { prisma } from "../db/client";

/**
 * Make sure a user has UserTask rows for all active tasks.
 */
export async function ensureUserTasksForUser(userId: string) {
  const tasks: Array<{ id: string }> = await prisma.task.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  if (!tasks.length) return;

  const existing: Array<{ taskId: string }> = await prisma.userTask.findMany({
    where: { userId },
    select: { taskId: true },
  });

  const existingIds = new Set(existing.map((e: { taskId: string }) => e.taskId));
  const missing = tasks.filter((t: { id: string }) => !existingIds.has(t.id));

  if (!missing.length) return;

  await prisma.userTask.createMany({
    data: missing.map((t: { id: string }) => ({
      userId,
      taskId: t.id,
      progress: 0,
      maxProgress: 1,
      completed: false,
    })),
    skipDuplicates: true,
  });
}
