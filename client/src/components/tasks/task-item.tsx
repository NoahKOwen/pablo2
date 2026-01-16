import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  Calendar,
  Sparkles,
  Star,
  Pickaxe,
  User,
  Share2,
  Coins,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Task, UserTask } from "@shared/schema";

type UserTaskWithTask = UserTask & { task: Task };

export interface TaskItemProps {
  userTask: UserTaskWithTask;
  onComplete: () => void;
  isPending: boolean;
}

const categoryIconMap: Record<string, LucideIcon> = {
  daily: Calendar,
  weekly: Star,
  special: Sparkles,
  mining: Pickaxe,
  profile: User,
  social: Share2,
  staking: Coins,
};

export function TaskItem({ userTask, onComplete, isPending }: TaskItemProps) {
  const { task } = userTask;
  const [linkOpened, setLinkOpened] = useState(false);

  const progress =
    userTask.maxProgress > 0
      ? (userTask.progress / userTask.maxProgress) * 100
      : 0;

  const CategoryIcon = categoryIconMap[task.category ?? ""] ?? Sparkles;

  const xnrtRewardNumber =
    typeof task.xnrtReward === "number"
      ? task.xnrtReward
      : Number(task.xnrtReward ?? 0);

  const urlRegex = /(https?:\/\/\S+)/;
  const urlMatch = task.description?.match(urlRegex);
  let taskUrl = urlMatch?.[0] ?? null;

  if (task.title === "Join WhatsApp Community") {
    taskUrl = "https://chat.whatsapp.com/KjAjDTb1LX4I6cyXMctV1s";
  }

  const descriptionWithoutUrl = task.description
    ? task.description
        .replace(urlRegex, "")
        .replace(/[:\-–]+\s*$/, "")
        .trim()
    : "";

  const titleLower = task.title.toLowerCase();
  let appIconSrc: string | null = null;

  if (titleLower.includes("whatsapp")) {
    appIconSrc = "/icons/whatsapp.png";
  } else if (titleLower.includes("telegram")) {
    appIconSrc = "/icons/telegram.png";
  } else if (
    titleLower.includes("twitter") ||
    titleLower.includes("x (twitter)") ||
    titleLower.includes(" x ")
  ) {
    appIconSrc = "/icons/X.png";
  } else if (titleLower.includes("facebook")) {
    appIconSrc = "/icons/facebook.png";
  } else if (titleLower.includes("instagram")) {
    appIconSrc = "/icons/instagram.png";
  }

  const showAppIcon = task.category === "special" && appIconSrc;

  const requiresProgress = userTask.maxProgress > 1;
  const requiresLinkOpen = task.category === "special" && !!taskUrl;
  const isLockedByProgress =
    requiresProgress && userTask.progress < userTask.maxProgress;
  const isLockedByLink = requiresLinkOpen && !linkOpened;
  const completeDisabled = isPending || isLockedByProgress || isLockedByLink;

  // SPECIAL TASK CARD (social / campaign tasks)
  if (task.category === "special") {
    return (
      <div
        className="rounded-2xl border border-primary/10 bg-linear-to-br from-slate-900 to-slate-950 px-4 py-4 md:px-6 md:py-5 shadow-xl shadow-black/40"
        data-testid={`task-${userTask.id}`}
      >
        <div className="flex items-start gap-3">
          <div className="mt-1 flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-800">
            {showAppIcon ? (
              <img
                src={appIconSrc!}
                alt={task.title}
                className="h-7 w-7 rounded-xl object-contain"
              />
            ) : userTask.completed ? (
              <CheckCircle2 className="h-6 w-6 text-chart-2" />
            ) : (
              <CategoryIcon className="h-6 w-6 text-muted-foreground" />
            )}
          </div>

          <div className="flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-sm md:text-base">{task.title}</p>
              <Badge className="bg-amber-500/20 text-amber-200 border border-amber-400/40 text-[11px] uppercase">
                Special
              </Badge>
            </div>
            <p className="text-xs md:text-sm text-muted-foreground">
              {descriptionWithoutUrl}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full border border-chart-1/40 bg-chart-1/10 px-3 py-1 text-[11px] font-medium text-chart-1">
              +{task.xpReward} XP
            </span>
            {xnrtRewardNumber > 0 && (
              <span className="inline-flex items-center rounded-full border border-chart-2/40 bg-chart-2/10 px-3 py-1 text-[11px] font-medium text-chart-2">
                +{xnrtRewardNumber.toLocaleString()} XNRT
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-2 self-start md:self-auto">
            {taskUrl && (
              <Button
                size="sm"
                variant="outline"
                className="rounded-full px-4 border-amber-400/60 bg-transparent text-amber-200 hover:bg-amber-500/10"
                onClick={(e) => {
                  e.stopPropagation();
                  setLinkOpened(true);
                  window.open(taskUrl, "_blank");
                }}
              >
                Open link
              </Button>
            )}

            {userTask.completed ? (
              <Badge
                variant="default"
                className="bg-chart-2 text-xs px-4 py-1 rounded-full"
              >
                Completed
              </Badge>
            ) : (
              <Button
                size="sm"
                className="rounded-full px-6"
                disabled={completeDisabled}
                onClick={(e) => {
                  e.stopPropagation();
                  onComplete();
                }}
                data-testid={`button-complete-${userTask.id}`}
              >
                Complete
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // DEFAULT TASK CARD (daily / weekly / mining / profile / social / staking / other)
  return (
    <div
      className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between rounded-md border border-border p-4 hover-elevate"
      data-testid={`task-${userTask.id}`}
    >
      <div className="flex flex-1 items-start gap-4">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-md ${
            userTask.completed ? "bg-chart-2/20" : "bg-muted"
          }`}
        >
          {userTask.completed ? (
            <CheckCircle2 className="h-6 w-6 text-chart-2" />
          ) : (
            <CategoryIcon className="h-6 w-6 text-muted-foreground" />
          )}
        </div>

        <div className="flex-1">
          <div className="mb-1 flex items-center gap-2">
            <p className="font-semibold">{task.title}</p>
            <Badge variant="secondary" className="capitalize">
              {task.category}
            </Badge>
          </div>
          <p className="mb-2 text-sm text-muted-foreground">
            {renderDescriptionWithLink(task.description ?? "")}
          </p>

          {!userTask.completed && userTask.maxProgress > 1 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-semibold">
                  {userTask.progress}/{userTask.maxProgress}
                </span>
              </div>
              <Progress value={progress} />
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col items-start gap-2 md:items-end">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="bg-chart-1/10">
            +{task.xpReward} XP
          </Badge>
          {xnrtRewardNumber > 0 && (
            <Badge variant="outline" className="bg-chart-2/10">
              +{xnrtRewardNumber.toLocaleString()} XNRT
            </Badge>
          )}
        </div>

        {userTask.completed ? (
          <Badge variant="default" className="bg-chart-2">
            Completed
          </Badge>
        ) : (
          <Button
            size="sm"
            disabled={userTask.progress < userTask.maxProgress || isPending}
            onClick={onComplete}
            data-testid={`button-complete-${userTask.id}`}
            aria-label={`Complete task ${task.title}`}
          >
            Complete
          </Button>
        )}
      </div>
    </div>
  );
}

function renderDescriptionWithLink(description: string) {
  if (!description) return null;

  const match = description.match(/https?:\/\/\S+/);
  if (!match) return <span>{description}</span>;

  const url = match[0];
  const [before, after] = description.split(url);
  const display = url.length > 45 ? `${url.slice(0, 42)}…` : url;

  return (
    <>
      {before}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline-offset-2 hover:underline"
      >
        {display}
      </a>
      {after}
    </>
  );
}
