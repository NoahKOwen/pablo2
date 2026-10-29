// server/storage/tasks.ts
import { Prisma } from "../db/client";

/**
 * Storage module for:
 * - Task
 * - UserTask
 * - Achievement
 * - UserAchievement
 *
 * Must export createTaskMethods() (required by server/storage/index.ts)
 * NO Express routers here.
 */
export function createTaskMethods(prisma: any, _storage: any) {
  const prismaAny = prisma as any;

  const DecimalCtor = (Prisma as any).Decimal as new (value: any) => any;
  type Decimal = InstanceType<typeof DecimalCtor>;

  const toNum = (v: unknown): number => {
    if (v == null) return 0;
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    if (typeof v === "bigint") return Number(v);
    if (typeof v === "string") {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    }
    const s = (v as any)?.toString?.();
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  };

  const toDec = (v: unknown): Decimal => {
    if (v instanceof DecimalCtor) return v as Decimal;
    const s = (v as any)?.toString?.();
    if (typeof s === "string" && s.length) return new DecimalCtor(s);
    return new DecimalCtor(toNum(v));
  };

  // ─────────────────────────────────────────────────────────────
  // Tasks

  async function getAllTasks() {
    return prismaAny.task.findMany({
      orderBy: { createdAt: "asc" },
    });
  }

  async function getUserTasks(userId: string) {
    return prismaAny.userTask.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
  }

  async function createUserTask(userTask: any) {
    return prismaAny.userTask.create({ data: userTask });
  }

  async function updateUserTask(id: string, updates: any) {
    return prismaAny.userTask.update({
      where: { id },
      data: updates,
    });
  }

  /**
   * Called by server/routes/tasks.ts
   * Returns: { xpReward: number, xnrtReward: number, taskTitle: string }
   * Throws: TASK_NOT_FOUND | TASK_ALREADY_COMPLETED | TASK_NOT_READY
   */
  async function completeTaskWithRewards(userId: string, taskId: string) {
    const task = await prismaAny.task.findUnique({ where: { id: taskId } });

    if (!task || task.isActive === false) {
      throw new Error("TASK_NOT_FOUND");
    }

    const xpReward: number = toNum(task.xpReward);
    const xnrtRewardDec: Decimal = toDec(task.xnrtReward);
    const xnrtReward: number = toNum(xnrtRewardDec.toString());
    const taskTitle: string = String(task.title ?? "Task");

    await prismaAny.$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`task:${userId}:${taskId}`}))`;

      // Re-read after acquiring the lock. This prevents two tabs/processes from
      // both observing completed=false and crediting the same reward twice.
      const existing = await tx.userTask.findUnique({
        where: { userId_taskId: { userId, taskId } },
      });

      if (existing?.completed) {
        throw new Error("TASK_ALREADY_COMPLETED");
      }

      if (existing?.id) {
        const progress = toNum(existing.progress);
        const maxProgress = toNum(existing.maxProgress) || 1;

        if (progress < maxProgress) {
          throw new Error("TASK_NOT_READY");
        }

        const claimed = await tx.userTask.updateMany({
          where: { id: existing.id, completed: false },
          data: { completed: true, completedAt: new Date() },
        });
        if (claimed.count !== 1) {
          throw new Error("TASK_ALREADY_COMPLETED");
        }
      } else {
        await tx.userTask.create({
          data: {
            userId,
            taskId,
            progress: 1,
            maxProgress: 1,
            completed: true,
            completedAt: new Date(),
          },
        });
      }

      if (xnrtRewardDec.gt(0)) {
        await tx.balance.upsert({
          where: { userId },
          create: {
            userId,
            xnrtBalance: xnrtRewardDec,
            totalEarned: xnrtRewardDec,
          },
          update: {
            xnrtBalance: { increment: xnrtRewardDec },
            totalEarned: { increment: xnrtRewardDec },
          },
        });
      }

      if (xpReward > 0) {
        await tx.user.update({
          where: { id: userId },
          data: { xp: { increment: xpReward } },
        });
      }
    });

    return { xpReward, xnrtReward, taskTitle };
  }

  // ─────────────────────────────────────────────────────────────
  // Achievements

  async function getAllAchievements() {
    return prismaAny.achievement.findMany({
      orderBy: { createdAt: "asc" },
    });
  }

  async function getUserAchievements(userId: string) {
    return prismaAny.userAchievement.findMany({
      where: { userId },
      orderBy: { unlockedAt: "asc" },
    });
  }

  async function createUserAchievement(userAchievement: any) {
    return prismaAny.userAchievement.create({ data: userAchievement });
  }

  /**
   * Unlocker uses category-driven metrics:
   * - contains "xp"     => User.xp
   * - contains "level"  => User.level
   * - contains "streak" => User.streak
   * - otherwise         => completed tasks count
   */
  async function checkAndUnlockAchievements(userId: string) {
    const [user, achievements, userAchievements, completedTasks] =
      await Promise.all([
        prismaAny.user.findUnique({
          where: { id: userId },
          select: { id: true, xp: true, level: true, streak: true },
        }),
        prismaAny.achievement.findMany(),
        prismaAny.userAchievement.findMany({
          where: { userId },
          select: { achievementId: true },
        }),
        prismaAny.userTask.findMany({
          where: { userId, completed: true },
          select: { id: true },
        }),
      ]);

    if (!user) return [];

    const unlocked = new Set<string>(
      (userAchievements as any[]).map((ua) => ua.achievementId as string),
    );

    const completedCount = (completedTasks as any[]).length;
    const newlyUnlocked: any[] = [];

    for (const a of achievements as any[]) {
      if (!a?.id || unlocked.has(a.id)) continue;

      const requirement = toNum(a.requirement);
      if (requirement <= 0) continue;

      const cat = String(a.category ?? "").toLowerCase();

      let value = completedCount;
      if (cat.includes("xp")) value = toNum(user.xp);
      else if (cat.includes("level")) value = toNum(user.level);
      else if (cat.includes("streak")) value = toNum(user.streak);

      if (value < requirement) continue;

      try {
        const ua = await prismaAny.userAchievement.create({
          data: { userId, achievementId: a.id },
        });
        newlyUnlocked.push(ua);
        unlocked.add(a.id);
      } catch {
        // ignore duplicates/races (unique constraint on [userId, achievementId])
      }
    }

    return newlyUnlocked;
  }

  async function getAchievementsWithUnlockCount() {
    const [achievements, userAchievements] = await Promise.all([
      prismaAny.achievement.findMany(),
      prismaAny.userAchievement.findMany({ select: { achievementId: true } }),
    ]);

    const counts = new Map<string, number>();
    for (const ua of userAchievements as any[]) {
      const id = ua.achievementId as string;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }

    return (achievements as any[]).map((a) => ({
      ...a,
      unlockCount: counts.get(a.id) ?? 0,
    }));
  }

  return {
    // Tasks
    getAllTasks,
    getUserTasks,
    createUserTask,
    updateUserTask,
    completeTaskWithRewards,

    // Achievements
    getAllAchievements,
    getUserAchievements,
    createUserAchievement,
    checkAndUnlockAchievements,
    getAchievementsWithUnlockCount,
  };
}
