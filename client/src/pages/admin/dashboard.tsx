import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  LayoutDashboard,
  ArrowDownCircle,
  ArrowUpCircle,
  Users,
  BarChart3,
  Settings,
  TrendingUp,
  ListChecks,
  Award,
  Megaphone,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import OverviewTab from "./tabs/overview";
import DepositsTab from "./tabs/deposits";
import WithdrawalsTab from "./tabs/withdrawals";
import UsersTab from "./tabs/users";
import AnalyticsTab from "./tabs/analytics";
import SettingsTab from "./tabs/settings";
import StakesTab from "./tabs/stakes";
import TasksTab from "./tabs/tasks";
import AchievementsTab from "./tabs/achievements";
import AnnouncementsTab from "./tabs/announcements";

const VALID_TABS = [
  "overview",
  "deposits",
  "withdrawals",
  "users",
  "analytics",
  "settings",
  "stakes",
  "tasks",
  "achievements",
  "announcements",
] as const;

type TabKey = (typeof VALID_TABS)[number];

export default function AdminDashboard() {
  const [location, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  // Parse query string to get active tab
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab") as TabKey | null;
    if (tab && (VALID_TABS as readonly string[]).includes(tab)) {
      setActiveTab(tab);
    }
  }, [location]);

  // Update URL when tab changes
  const handleTabChange = (value: string) => {
    const next = (value as TabKey) ?? "overview";
    setActiveTab(next);
    setLocation(`/admin?tab=${next}`);
  };

  return (
    <div className="space-y-6 pb-4">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold font-serif bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
          Admin Dashboard
        </h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Manage platform operations and monitor activity
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        {/* Wrapping div makes the tab bar scrollable on small screens */}
        <div className="-mx-2 px-2 md:mx-0">
          <TabsList
            className="
              flex md:grid md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-10
              w-full min-w-max md:min-w-0
              gap-1 md:gap-0
              overflow-x-auto
              scrollbar-thin scrollbar-thumb-muted-foreground/40 scrollbar-track-transparent
            "
          >
            <TabsTrigger
              value="overview"
              className="gap-2 flex-shrink-0"
              data-testid="tab-overview"
            >
              <LayoutDashboard className="h-4 w-4" />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>

            <TabsTrigger
              value="deposits"
              className="gap-2 flex-shrink-0"
              data-testid="tab-deposits"
            >
              <ArrowDownCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Deposits</span>
            </TabsTrigger>

            <TabsTrigger
              value="withdrawals"
              className="gap-2 flex-shrink-0"
              data-testid="tab-withdrawals"
            >
              <ArrowUpCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Withdrawals</span>
            </TabsTrigger>

            <TabsTrigger
              value="users"
              className="gap-2 flex-shrink-0"
              data-testid="tab-users"
            >
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Users</span>
            </TabsTrigger>

            <TabsTrigger
              value="stakes"
              className="gap-2 flex-shrink-0"
              data-testid="tab-stakes"
            >
              <TrendingUp className="h-4 w-4" />
              <span className="hidden sm:inline">Stakes</span>
            </TabsTrigger>

            <TabsTrigger
              value="tasks"
              className="gap-2 flex-shrink-0"
              data-testid="tab-tasks"
            >
              <ListChecks className="h-4 w-4" />
              <span className="hidden sm:inline">Tasks</span>
            </TabsTrigger>

            <TabsTrigger
              value="achievements"
              className="gap-2 flex-shrink-0"
              data-testid="tab-achievements"
            >
              <Award className="h-4 w-4" />
              <span className="hidden sm:inline">Achievements</span>
            </TabsTrigger>

            <TabsTrigger
              value="announcements"
              className="gap-2 flex-shrink-0"
              data-testid="tab-announcements"
            >
              <Megaphone className="h-4 w-4" />
              <span className="hidden sm:inline">Announcements</span>
            </TabsTrigger>

            <TabsTrigger
              value="analytics"
              className="gap-2 flex-shrink-0"
              data-testid="tab-analytics"
            >
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Analytics</span>
            </TabsTrigger>

            <TabsTrigger
              value="settings"
              className="gap-2 flex-shrink-0"
              data-testid="tab-settings"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Settings</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-6">
          <OverviewTab />
        </TabsContent>

        <TabsContent value="deposits" className="space-y-6">
          <DepositsTab />
        </TabsContent>

        <TabsContent value="withdrawals" className="space-y-6">
          <WithdrawalsTab />
        </TabsContent>

        <TabsContent value="users" className="space-y-6">
          <UsersTab />
        </TabsContent>

        <TabsContent value="stakes" className="space-y-6">
          <StakesTab />
        </TabsContent>

        <TabsContent value="tasks" className="space-y-6">
          <TasksTab />
        </TabsContent>

        <TabsContent value="achievements" className="space-y-6">
          <AchievementsTab />
        </TabsContent>

        <TabsContent value="announcements" className="space-y-6">
          <AnnouncementsTab />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <AnalyticsTab />
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <SettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
