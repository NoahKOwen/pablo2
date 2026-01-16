// server/routes/tasks.ts
import { Router } from "express";
import { storage } from "../storage";
import { requireAuth, validateCSRF } from "../auth/middleware";
import { ensureUserTasksForUser } from "../services/userTasks";

const router = Router();

type TaskRow = {
  id: string;
  title?: string | null;
  description?: string | null;
  xpReward?: number | string | null;
  xnrtReward?: unknown;
  category?: string | null;
  requirements?: string | null;
  isActive?: boolean | null;
  createdAt?: Date | string | null;
};

type UserTaskRow = {
  id: string;
  userId: string;
  taskId: string;
  progress: number;
  maxProgress: number;
  completed: boolean;
  completedAt?: Date | string | null;
  createdAt?: Date | string | null;
};

router.get("/user", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser!.id;

    // Ensure the user has rows for all active tasks (and fix progress for 1-step tasks)
    await ensureUserTasksForUser(userId);

    const userTasks = (await storage.getUserTasks(userId)) as UserTaskRow[];
    const allTasks = (await storage.getAllTasks()) as TaskRow[];

    const tasksById = new Map<string, TaskRow>(
      allTasks.map((t: TaskRow) => [t.id, t]),
    );

    const populated = userTasks
      .map((ut: UserTaskRow) => {
        const task = tasksById.get(ut.taskId);
        if (!task || task.isActive === false) {
          console.warn(
            `UserTask ${ut.id} refers to missing or inactive task ${ut.taskId}`,
          );
          return null;
        }
        return { ...ut, task };
      })
      .filter(
        (x): x is UserTaskRow & { task: TaskRow } => x !== null,
      );

    res.json(populated);
  } catch (error) {
    console.error("Error fetching user tasks:", error);
    res.status(500).json({ message: "Failed to fetch user tasks" });
  }
});

router.post(
  "/:taskId/complete",
  requireAuth,
  validateCSRF,
  async (req, res) => {
    try {
      const userId = req.authUser!.id;
      const { taskId } = req.params;

      const { xpReward, xnrtReward, taskTitle } =
        await storage.completeTaskWithRewards(userId, taskId);

      await storage.createActivity({
        userId,
        type: "task_completed",
        description: `Completed task: ${taskTitle}`,
      });

      await storage.checkAndUnlockAchievements(userId);

      res.json({ xpReward, xnrtReward });
    } catch (error: any) {
      if (error?.message === "TASK_NOT_FOUND") {
        return res.status(404).json({ message: "Task not found" });
      }
      if (error?.message === "TASK_ALREADY_COMPLETED") {
        return res.status(400).json({ message: "Task already completed" });
      }
      if (error?.message === "TASK_NOT_READY") {
        return res.status(400).json({ message: "Task is not yet complete" });
      }
      console.error("Error completing task:", error);
      res.status(500).json({ message: "Failed to complete task" });
    }
  },
);

export default router;
