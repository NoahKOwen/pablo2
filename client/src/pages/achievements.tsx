// client/src/pages/achievements.tsx
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Search, Award, Lock, Unlock, CheckCircle2, Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  requirement: number;
  xpReward: number;

  // from /api/achievements
  unlocked: boolean;
  unlockedAt: string | null;
  claimed: boolean;
  claimedAt: string | null;
  claimable: boolean;
}

function getCategoryBadgeColor(category: string) {
  switch (category) {
    case "earnings":
      return "bg-green-500/15 text-green-400 border border-green-500/30";
    case "referrals":
      return "bg-blue-500/15 text-blue-400 border border-blue-500/30";
    case "streaks":
      return "bg-purple-500/15 text-purple-400 border border-purple-500/30";
    case "mining":
      return "bg-amber-500/15 text-amber-400 border border-amber-500/30";
    default:
      return "bg-gray-500/15 text-gray-400 border border-gray-500/30";
  }
}

function getStatusMeta(
  a: Achievement,
): { label: string; icon: LucideIcon; className: string } {
  if (a.claimed) {
    return {
      label: "Claimed",
      icon: CheckCircle2,
      className:
        "bg-emerald-500/15 text-emerald-400 border border-emerald-500/40",
    };
  }
  if (a.unlocked) {
    return {
      label: "Unlocked",
      icon: Unlock,
      className:
        "bg-yellow-500/15 text-yellow-300 border border-yellow-500/40",
    };
  }
  return {
    label: "Locked",
    icon: Lock,
    className: "bg-muted text-muted-foreground border border-border/60",
  };
}

// Minimal CSRF-aware POST helper for the claim action
async function postWithCsrf(url: string, init: RequestInit = {}) {
  const r = await fetch("/auth/csrf", { credentials: "include" });
  if (!r.ok) throw new Error("Failed to get CSRF token");
  const { csrfToken } = await r.json();

  const res = await fetch(url, {
    ...init,
    method: init.method ?? "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
      "x-csrf-token": csrfToken,
    },
  });

  if (!res.ok) {
    let msg = "Request failed";
    try {
      const data = await res.json();
      if (data?.message) msg = data.message;
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(msg);
  }

  return res.json();
}

export default function AchievementsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: achievements, isLoading } = useQuery<Achievement[]>({
    queryKey: ["/api/achievements"],
  });

  const claimMutation = useMutation({
    mutationFn: async (achievementId: string) => {
      setClaimingId(achievementId);
      return postWithCsrf(`/api/achievements/${achievementId}/claim`);
    },
    onSuccess: (_data, achievementId) => {
      const a = (achievements ?? []).find((x) => x.id === achievementId);

      toast({
        title: "Achievement claimed 🎉",
        description: a ? `+${a.xpReward} XP added to your account.` : undefined,
      });

      // Refresh achievements list
      queryClient.invalidateQueries({ queryKey: ["/api/achievements"] });
      // Also refresh user info (XP/level, etc.)
      queryClient.invalidateQueries({ queryKey: ["/auth/me"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to claim achievement",
        description: error?.message ?? "Something went wrong",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setClaimingId(null);
    },
  });

  const filtered = (achievements ?? []).filter((a) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      a.title.toLowerCase().includes(q) || a.description.toLowerCase().includes(q);

    const matchesCategory = categoryFilter === "all" || a.category === categoryFilter;

    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      {/* Header & filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search achievements..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="earnings">Earnings</SelectItem>
              <SelectItem value="referrals">Referrals</SelectItem>
              <SelectItem value="streaks">Streaks</SelectItem>
              <SelectItem value="mining">Mining</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Award className="h-5 w-5" />
            Achievements
          </CardTitle>
          <CardDescription>
            Unlock achievements through your activity and claim XP rewards.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground">
              No achievements found
            </p>
          ) : (
            <>
              {/* Mobile layout – stacked cards */}
              <div className="space-y-3 md:hidden">
                {filtered.map((a) => {
                  const status = getStatusMeta(a);
                  const isClaimDisabled = !a.claimable || claimMutation.isPending;

                  return (
                    <div
                      key={a.id}
                      className="rounded-2xl border border-border/60 bg-background/60 p-3 shadow-sm"
                    >
                      <div className="flex gap-3">
                        <div className="mt-1 text-2xl">{a.icon}</div>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium leading-tight">
                                {a.title}
                              </p>
                              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                                {a.description}
                              </p>
                            </div>
                            <Badge
                              className={`ml-auto h-6 rounded-full px-2 text-[10px] ${status.className}`}
                            >
                              <status.icon className="mr-1 h-3 w-3" />
                              {status.label}
                            </Badge>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-[11px] text-muted-foreground">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                className={`rounded-full px-2 py-0 text-[10px] ${getCategoryBadgeColor(
                                  a.category,
                                )}`}
                              >
                                {a.category}
                              </Badge>
                              <span>
                                Req:{" "}
                                <span className="font-medium text-foreground">
                                  {a.requirement.toLocaleString()}
                                </span>
                              </span>
                              <span>
                                Reward:{" "}
                                <span className="font-medium text-foreground">
                                  {a.xpReward} XP
                                </span>
                              </span>
                            </div>

                            <Button
                              size="sm"
                              className="h-7 rounded-full px-4 text-xs"
                              disabled={isClaimDisabled}
                              onClick={() => claimMutation.mutate(a.id)}
                            >
                              {claimMutation.isPending && claimingId === a.id ? (
                                <>
                                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                  Claiming…
                                </>
                              ) : a.claimed ? (
                                "Claimed"
                              ) : a.claimable ? (
                                "Claim"
                              ) : (
                                "Locked"
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop layout – table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Achievement</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Requirement</TableHead>
                      <TableHead>XP Reward</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {filtered.map((a) => {
                      const status = getStatusMeta(a);
                      const isClaimDisabled = !a.claimable || claimMutation.isPending;

                      return (
                        <TableRow key={a.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">{a.icon}</span>
                              <div>
                                <div className="font-medium">{a.title}</div>
                                <div className="text-xs text-muted-foreground line-clamp-1">
                                  {a.description}
                                </div>
                              </div>
                            </div>
                          </TableCell>

                          <TableCell>
                            <Badge className={getCategoryBadgeColor(a.category)}>
                              {a.category}
                            </Badge>
                          </TableCell>

                          <TableCell>{a.requirement.toLocaleString()}</TableCell>
                          <TableCell>{a.xpReward} XP</TableCell>

                          <TableCell>
                            <Badge className={`rounded-full px-3 ${status.className}`}>
                              <status.icon className="mr-1 h-3 w-3" />
                              {status.label}
                            </Badge>
                          </TableCell>

                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              className="px-5"
                              disabled={isClaimDisabled}
                              onClick={() => claimMutation.mutate(a.id)}
                            >
                              {claimMutation.isPending && claimingId === a.id ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Claiming…
                                </>
                              ) : a.claimed ? (
                                "Claimed"
                              ) : a.claimable ? (
                                "Claim"
                              ) : (
                                "Locked"
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
