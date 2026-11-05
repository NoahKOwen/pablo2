import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ListChecks,
  Sparkles,
  Calendar,
  Star,
  Pickaxe,
  User,
  Share2,
  Coins,
  type LucideIcon,
} from "lucide-react";
import type { Task, UserTask } from "@shared/schema";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useAuth } from "@/hooks/useAuth";
import { useConfetti } from "@/hooks/use-confetti";
import { TaskItem } from "@/components/tasks/task-item";

type UserTaskWithTask = UserTask & {
  task: Task;
};

const categoryConfig: Record<
  string,
  { icon: LucideIcon; label: string; description: string; colorClass: string }
> = {
  daily: {
    icon: Calendar,
    label: "Daily Tasks",
    description: "Complete daily to maintain your streak",
    colorClass: "text-chart-1",
  },
  weekly: {
    icon: Star,
    label: "Weekly Tasks",
    description: "Higher rewards for weekly completion",
    colorClass: "text-chart-2",
  },
  special: {
    icon: Sparkles,
    label: "Special Tasks",
    description: "Limited time tasks with bonus rewards",
    colorClass: "text-chart-5",
  },
  mining: {
    icon: Pickaxe,
    label: "Mining Tasks",
    description: "Earn rewards through mining activities",
    colorClass: "text-amber-500",
  },
  profile: {
    icon: User,
    label: "Profile Tasks",
    description: "Complete your profile setup",
    colorClass: "text-blue-500",
  },
  social: {
    icon: Share2,
    label: "Social Tasks",
    description: "Share and connect with the community",
    colorClass: "text-pink-500",
  },
  staking: {
    icon: Coins,
    label: "Staking Tasks",
    description: "Start staking to earn passive rewards",
    colorClass: "text-green-500",
  },
};

const CATEGORY_ORDER = [
  "daily",
  "weekly",
  "special",
  "mining",
  "staking",
  "profile",
  "social",
];

export default function Tasks() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { celebrate } = useConfetti();

  const {
    data: userTasks,
    isLoading,
  } = useQuery<UserTaskWithTask[]>({
    queryKey: ["/api/tasks/user"],
  });

  const completeTaskMutation = useMutation<
    { xpReward: number; xnrtReward: number },
    Error,
    string
  >({
    mutationFn: async (taskId: string) => {
      const res = await apiRequest("POST", `/api/tasks/${taskId}/complete`, {});
      const data = (await res.json()) as {
        xpReward: number;
        xnrtReward: number;
      };
      return data;
    },
    onSuccess: (data) => {
      const previousXP = user?.xp ?? 0;
      const newXP = previousXP + (data.xpReward || 0);
      const previousLevel = Math.floor(previousXP / 1000) + 1;
      const newLevel = Math.floor(newXP / 1000) + 1;
      const leveledUp = newLevel > previousLevel;

      toast({
        title: "Task Completed!",
        description: `You earned ${data.xpReward} XP and ${data.xnrtReward} XNRT!`,
      });

      if (leveledUp) {
        celebrate("levelup");
      }

      queryClient.invalidateQueries({ queryKey: ["/api/tasks/user"] });
      queryClient.invalidateQueries({ queryKey: ["/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/balance"] });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: error.message || "Failed to complete task",
        variant: "destructive",
      });
    },
  });

  const allTasks = userTasks ?? [];

  const tasksByCategory = allTasks.reduce(
    (acc, task) => {
      const category = task.task.category || "other";
      if (!acc[category]) acc[category] = [];
      acc[category].push(task);
      return acc;
    },
    {} as Record<string, UserTaskWithTask[]>,
  );

  const categories = Object.keys(tasksByCategory).sort((a, b) => {
    const indexA = CATEGORY_ORDER.indexOf(a);
    const indexB = CATEGORY_ORDER.indexOf(b);
    const safeA = indexA === -1 ? 999 : indexA;
    const safeB = indexB === -1 ? 999 : indexB;
    return safeA - safeB;
  });

  const completedCount = (tasks: UserTaskWithTask[]) =>
    tasks.filter((t) => t.completed).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-serif">Tasks</h1>
        <p className="text-muted-foreground">
          Complete tasks to earn XP and XNRT rewards
        </p>
      </div>

      {/* Top summary cards (first 3 categories) */}
      <div className="grid gap-4 md:grid-cols-3">
        {categories.slice(0, 3).map((category) => {
          const config =
            categoryConfig[category] || {
              icon: ListChecks,
              label:
                category.charAt(0).toUpperCase() +
                category.slice(1) +
                " Tasks",
              description: "Complete these tasks to earn rewards",
              colorClass: "text-muted-foreground",
            };

          const Icon = config.icon;
          const tasks = tasksByCategory[category] || [];

          return (
            <Card
              key={category}
              className="border-primary/10 bg-gradient-to-br from-card to-primary/5"
            >
              <CardContent className="p-6">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {config.label}
                  </p>
                  <Icon className={`h-5 w-5 ${config.colorClass}`} />
                </div>
                <p className="font-mono text-3xl font-bold">
                  {completedCount(tasks)}/{tasks.length}
                </p>
              </CardContent>
            </Card>
          );
        })}

        {categories.length === 0 && !isLoading && (
          <>
            <Card className="border-primary/10 bg-gradient-to-br from-card to-primary/5">
              <CardContent className="p-6">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Daily Tasks</p>
                  <Calendar className="h-5 w-5 text-chart-1" />
                </div>
                <p className="font-mono text-3xl font-bold">0/0</p>
              </CardContent>
            </Card>
            <Card className="border-primary/10 bg-gradient-to-br from-card to-chart-2/10">
              <CardContent className="p-6">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Weekly Tasks
                  </p>
                  <Star className="h-5 w-5 text-chart-2" />
                </div>
                <p className="font-mono text-3xl font-bold">0/0</p>
              </CardContent>
            </Card>
            <Card className="border-primary/10 bg-gradient-to-br from-card to-chart-5/10">
              <CardContent className="p-6">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Special Tasks
                  </p>
                  <Sparkles className="h-5 w-5 text-chart-5" />
                </div>
                <p className="font-mono text-3xl font-bold">0/0</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <Card>
          <CardContent className="space-y-3 p-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-md bg-muted/60"
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Category sections */}
      {!isLoading &&
        categories.map((category) => {
          const tasks = tasksByCategory[category] || [];
          if (tasks.length === 0) return null;

          const config =
            categoryConfig[category] || {
              icon: ListChecks,
              label:
                category.charAt(0).toUpperCase() +
                category.slice(1) +
                " Tasks",
              description: "Complete these tasks to earn rewards",
              colorClass: "text-muted-foreground",
            };
          const Icon = config.icon;

          return (
            <Card key={category}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icon className={`h-5 w-5 ${config.colorClass}`} />
                  {config.label}
                </CardTitle>
                <CardDescription>{config.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {tasks.map((userTask: UserTaskWithTask) => (
                  <TaskItem
                    key={userTask.id}
                    userTask={userTask}
                    onComplete={() =>
                      completeTaskMutation.mutate(
                        userTask.taskId as string,
                      )
                    }
                    isPending={completeTaskMutation.isPending}
                  />
                ))}
              </CardContent>
            </Card>
          );
        })}

      {/* Empty state */}
      {!isLoading && (!userTasks || userTasks.length === 0) && (
        <Card>
          <CardContent className="p-12 text-center">
            <ListChecks className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
            <p className="text-lg text-muted-foreground">No tasks available</p>
            <p className="text-sm text-muted-foreground">
              Check back later for new tasks
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
