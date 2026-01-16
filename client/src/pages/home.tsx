// client/src/pages/home.tsx
import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SkeletonDashboard } from "@/components/skeletons";
import {
  TrendingUp,
  Gem,
  Users,
  Pickaxe,
  Flame,
  Award,
  ArrowRight,
  CalendarCheck,
  Sparkles,
} from "lucide-react";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Balance } from "@shared/schema";
import { useAuth } from "@/hooks/useAuth";
import { useConfetti } from "@/hooks/use-confetti";
import { AnnouncementBanner } from "@/components/announcement-banner";
import { nf } from "@/lib/number";

const XNRT_PER_USDT = 100;

function formatUsdtFromXnrt(
  amount: string | number | null | undefined
): string {
  const numeric =
    typeof amount === "number"
      ? amount
      : amount
      ? parseFloat(String(amount))
      : 0;
  const usdt = numeric / XNRT_PER_USDT;

  if (!Number.isFinite(usdt)) return "0.00";

  return usdt.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function CoinGlyph({ className = "h-10 w-10" }: { className?: string }) {
  const id = React.useId();
  const gradId = `coinRing-${id}`;

  return (
    <div className="relative">
      {/* soft glow */}
      <div className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-amber-400/20 blur-xl" />
      <svg
        viewBox="0 0 48 48"
        className={className + " drop-shadow-[0_0_18px_rgba(245,158,11,0.45)]"}
        aria-hidden="true"
        role="img"
      >
        <defs>
          <linearGradient id={gradId} x1="0" x2="1">
            <stop offset="0" stopColor="hsl(42, 90%, 50%)" />
            <stop offset="1" stopColor="hsl(42, 90%, 60%)" />
          </linearGradient>
        </defs>
        <circle
          cx="24"
          cy="24"
          r="18"
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth="4"
        />
        <circle
          cx="24"
          cy="24"
          r="10"
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth="2"
        />
        <path d="M16 24h16" stroke={`url(#${gradId})`} strokeWidth="2" />
        <path d="M20 18h8M20 30h8" stroke={`url(#${gradId})`} strokeWidth="2" />
        <circle
          cx="24"
          cy="24"
          r="21"
          fill="none"
          stroke="hsl(42, 90%, 50%)"
          strokeOpacity="0.12"
          strokeWidth="6"
        />
      </svg>
    </div>
  );
}

function StatTile({
  label,
  value,
  colorClass,
  icon,
  href,
}: {
  label: string;
  value: string | number;
  colorClass: string;
  icon: React.ReactNode;
  href: string;
}) {
  const num = nf(value);
  const numericValue =
    typeof value === "number" ? value : parseFloat(String(value || "0"));
  const isXnrtStat = label === "Total Earned";
  const usdt = isXnrtStat
    ? formatUsdtFromXnrt(Number.isFinite(numericValue) ? numericValue : 0)
    : null;

  const body = (
    <Card
      className="group relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-background/70 via-background/90 to-card shadow-[0_18px_40px_rgba(15,23,42,0.35)] transition-all duration-300 hover:-translate-y-1 hover:border-primary/70 hover:shadow-[0_22px_55px_rgba(15,23,42,0.6)] dark:from-background/60 dark:via-background/80 dark:to-card"
      data-testid={`card-stat-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      {/* accent glow */}
      <div className="pointer-events-none absolute -right-10 -top-16 h-32 w-32 rounded-full bg-primary/10 blur-3xl opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <CardContent className="relative flex items-center justify-between p-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p
            className="mt-1 text-2xl font-semibold"
            data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            {num}
          </p>
          {isXnrtStat && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              ≈ ${usdt} USDT
            </p>
          )}
        </div>
        <div
          className={`grid h-11 w-11 place-items-center rounded-full ${colorClass} transition-transform duration-300 group-hover:scale-110 group-hover:rotate-[2deg]`}
        >
          {icon}
        </div>
      </CardContent>
    </Card>
  );

  return href ? <Link href={href}>{body}</Link> : body;
}

function QuickActionRow({
  href,
  icon,
  title,
  hint,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <Button
      asChild
      variant="outline"
      className="group w-full justify-between rounded-xl border-border/60 bg-gradient-to-r from-background/60 via-background/80 to-background/95 px-4 py-6 text-left shadow-sm backdrop-blur-sm transition-all duration-300 hover:-translate-y-[2px] hover:border-primary/60 hover:shadow-[0_14px_30px_rgba(15,23,42,0.45)]"
      data-testid={`button-quick-${title.toLowerCase().replace(/\s+/g, "-")}`}
      aria-label={`${title} – ${hint}`}
    >
      <Link href={href}>
        <span className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-110 group-hover:bg-primary/15">
            {icon}
          </span>
          <span className="text-left">
            <span className="block font-semibold">{title}</span>
            <span className="block text-xs text-muted-foreground">{hint}</span>
          </span>
        </span>
        <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
      </Link>
    </Button>
  );
}

type Activity = {
  id: string;
  type: string;
  description: string;
  createdAt: string;
};

type CheckinResponse = {
  streak: number;
  xnrtReward: number;
  xpReward: number;
};

export default function Home() {
  const { toast } = useToast();
  const { celebrate } = useConfetti();
  const { user, isLoading: userLoading } = useAuth();

  const { data: balance, isLoading: balanceLoading } = useQuery<Balance>({
    queryKey: ["/api/balance"],
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });

  const { data: stats, isLoading: statsLoading } = useQuery<{
    activeStakes: number;
    miningSessions: number;
    totalReferrals: number;
    recentActivity: Activity[];
  }>({
    queryKey: ["/api/stats"],
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });

  const checkinMutation = useMutation<CheckinResponse, Error>({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/checkin");
      if (!res.ok) throw new Error((await res.text()) || "Check-in failed");
      return await res.json();
    },
    onSuccess: (data) => {
      const streakMilestones = [7, 14, 30, 60, 90, 180, 365];
      const isStreakMilestone = streakMilestones.includes(data.streak);

      const previousXP = user?.xp ?? 0;
      const newXP = previousXP + (data.xpReward || 0);
      const previousLevel = Math.floor(previousXP / 1000) + 1;
      const newLevel = Math.floor(newXP / 1000) + 1;
      const leveledUp = newLevel > previousLevel;

      toast({
        title: "Check-in Successful!",
        description: `Day ${data.streak} streak! Earned ${data.xnrtReward} XNRT and ${data.xpReward} XP`,
      });

      if (isStreakMilestone) celebrate("streak");
      if (leveledUp) celebrate("levelup");

      queryClient.invalidateQueries({ queryKey: ["/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/balance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
    onError: (error) => {
      toast({
        title: "Check-in Failed",
        description: error.message || "Already checked in today",
        variant: "destructive",
      });
    },
  });

  if (userLoading) return <SkeletonDashboard />;

  const level = user?.level ?? 1;
  const xp = user?.xp ?? 0;
  const streak = user?.streak ?? 0;
  const xnrtBalance = balance?.xnrtBalance || "0";
  const displayName =
    user?.username ||
    (user as any)?.name ||
    user?.email?.split("@")?.[0] ||
    "User";

  const pct = Math.max(0, Math.min(100, (xp % 1000) / 10));

  return (
    <div className="space-y-6">
      <AnnouncementBanner />

      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur-sm">
            <Sparkles className="h-3 w-3 text-primary" />
            <span>NextGen Earning Dashboard</span>
          </div>
          <h1 className="font-serif text-3xl font-bold">
            Welcome,{" "}
            <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              {displayName}
            </span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Beyond a coin. It&apos;s hope.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <Badge
            variant="outline"
            className="group flex items-center gap-2 rounded-full border-border/60 bg-gradient-to-r from-primary/5 via-primary/10 to-secondary/10 px-3 py-2 text-xs font-semibold shadow-sm backdrop-blur-sm transition-colors hover:border-primary/70 hover:from-primary/10 hover:via-primary/15 hover:to-secondary/15"
            data-testid="badge-streak"
          >
            <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/15">
              <Flame className="h-3.5 w-3.5 text-primary transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3" />
            </span>
            <span className="text-sm">{streak} Day Streak</span>
          </Badge>
          <Button
            onClick={() => checkinMutation.mutate()}
            disabled={checkinMutation.isPending}
            data-testid="button-checkin"
            className="gap-2 rounded-full px-4 shadow-md hover:shadow-lg"
          >
            <CalendarCheck className="h-4 w-4" />
            {checkinMutation.isPending ? "Checking in..." : "Daily Check-in"}
          </Button>
        </div>
      </div>

      {/* HERO GRID */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Balance */}
        <Card className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-background/80 via-background/95 to-card shadow-[0_24px_60px_rgba(15,23,42,0.55)] dark:from-background/70">
          <div className="pointer-events-none absolute -left-20 top-0 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
          <CardHeader className="relative pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">
              Total XNRT Balance
            </CardTitle>
          </CardHeader>
          <CardContent className="relative pb-6">
            {balanceLoading ? (
              <div
                className="h-10 w-48 rounded bg-muted/40 animate-pulse"
                role="status"
                aria-label="Loading balance"
              />
            ) : (
              <div className="flex items-center gap-4">
                <CoinGlyph className="h-14 w-14" />
                <div className="flex flex-col gap-1">
                  <div className="flex items-baseline gap-2">
                    <span
                      className="text-4xl font-bold text-primary"
                      data-testid="text-balance"
                    >
                      {nf(xnrtBalance)}
                    </span>
                    <span className="text-xl font-semibold text-muted-foreground">
                      XNRT
                    </span>
                  </div>
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    On-chain equivalent &amp; in-game rewards
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ≈ ${formatUsdtFromXnrt(xnrtBalance)} USDT &nbsp;
                    <span className="opacity-70">
                      (1 USDT = {XNRT_PER_USDT.toLocaleString()} XNRT)
                    </span>
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* XP & Level */}
        <Card className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-background/80 via-background/95 to-card shadow-[0_24px_60px_rgba(15,23,42,0.55)] dark:from-background/70">
          <div className="pointer-events-none absolute right-[-40px] top-[-40px] h-40 w-40 rounded-full bg-secondary/20 blur-3xl" />
          <CardHeader className="relative pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">
              XP &amp; Level
            </CardTitle>
          </CardHeader>
          <CardContent className="relative pb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <Award className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Level
                  </p>
                  <span
                    className="text-4xl font-bold"
                    data-testid="text-level"
                  >
                    {level}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div
                  className="text-2xl font-semibold"
                  data-testid="text-xp"
                >
                  {nf(xp)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {nf(
                    Math.max(
                      0,
                      (Math.floor(xp / 1000) + 1) * 1000 - xp
                    )
                  )}{" "}
                  XP&nbsp;to Lv {Math.floor(xp / 1000) + 2}
                </div>
              </div>
            </div>

            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted/40">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary via-secondary to-primary transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* STATS GRID */}
      {statsLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-2xl border border-border/60 bg-muted/30 animate-pulse"
              role="status"
              aria-label="Loading stats"
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Total Earned"
            value={balance?.totalEarned || "0"}
            colorClass="bg-[hsl(var(--stat-green))]"
            icon={<TrendingUp className="h-5 w-5 text-white" />}
            href="/wallet"
          />
          <StatTile
            label="Active Stakes"
            value={stats?.activeStakes || 0}
            colorClass="bg-[hsl(var(--stat-pink))]"
            icon={<Gem className="h-5 w-5 text-white" />}
            href="/staking"
          />
          <StatTile
            label="Referrals"
            value={stats?.totalReferrals || 0}
            colorClass="bg-[hsl(var(--stat-blue))]"
            icon={<Users className="h-5 w-5 text-white" />}
            href="/referrals"
          />
          <StatTile
            label="Mining Sessions"
            value={stats?.miningSessions || 0}
            colorClass="bg-[hsl(var(--stat-gold))]"
            icon={<Pickaxe className="h-5 w-5 text-white" />}
            href="/mining"
          />
        </div>
      )}

      {/* ACTIONS + ACTIVITY */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-background/80 via-background/95 to-card shadow-[0_18px_40px_rgba(15,23,42,0.4)]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Gem className="h-4 w-4" />
              </span>
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <QuickActionRow
              href="/staking"
              icon={<Gem className="h-4 w-4" />}
              title="Start Staking"
              hint="2–3 min • +30–60 XP"
            />
            <QuickActionRow
              href="/mining"
              icon={<Pickaxe className="h-4 w-4" />}
              title="Start Mining"
              hint="5–10 min • +40–90 XP"
            />
            <QuickActionRow
              href="/tasks"
              icon={<Award className="h-4 w-4" />}
              title="Complete Tasks"
              hint="1–2 min • +15–30 XP"
            />
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-background/80 via-background/95 to-card shadow-[0_18px_40px_rgba(15,23,42,0.4)]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-lg font-semibold">
              <span className="flex items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-secondary/10 text-secondary-foreground">
                  <TrendingUp className="h-4 w-4" />
                </span>
                Recent Activity
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {!stats?.recentActivity || stats.recentActivity.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No recent activity. Start earning to see your activity here!
                </p>
              ) : (
                stats.recentActivity.slice(0, 5).map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-start gap-3 rounded-xl bg-background/60 p-3 text-sm transition-colors hover:bg-background/80"
                  >
                    <div className="mt-1.5 h-2 w-2 rounded-full bg-primary shadow-[0_0_12px_rgba(234,179,8,0.9)]" />
                    <div className="flex-1">
                      <p className="text-foreground">{activity.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Intl.DateTimeFormat(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(activity.createdAt))}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
