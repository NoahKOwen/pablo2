// client/src/App.tsx

import type React from "react";
import { lazy, Suspense, useState, startTransition } from "react";
import { Router, Switch, Route, useLocation, Redirect } from "wouter";
import { useBrowserLocation } from "wouter/use-browser-location";

import { Toaster } from "@/components/ui/toaster";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationCenter } from "@/components/notification-center";
import { ErrorBoundary } from "@/components/error-boundary";
import { useAuth } from "@/hooks/useAuth";
import { useNotificationBadge } from "@/hooks/use-notification-badge";

// Lazier heavy components
const ChatBot = lazy(() =>
  import("@/components/chat-bot").then((m) => ({ default: m.ChatBot })),
);
const PWAInstallPrompt = lazy(() =>
  import("@/components/pwa-install-prompt").then((m) => ({
    default: m.PWAInstallPrompt,
  })),
);
const PWAUpdateNotification = lazy(() =>
  import("@/components/pwa-update-notification").then((m) => ({
    default: m.PWAUpdateNotification,
  })),
);

// Eager pages
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Auth from "@/pages/auth/auth";
import ForgotPassword from "@/pages/auth/forgot-password";
import ResetPassword from "@/pages/auth/reset-password";
import VerifyEmail from "@/pages/auth/verify-email";

// Lazy authenticated pages
const HomePage = lazy(() => import("@/pages/home"));
const WalletPage = lazy(() => import("@/pages/wallet"));
const DepositPage = lazy(() => import("@/pages/deposit"));
const WithdrawalPage = lazy(() => import("@/pages/withdrawal"));
const ProfilePage = lazy(() => import("@/pages/profile"));
const TasksPage = lazy(() => import("@/pages/tasks"));
const AchievementsPage = lazy(() => import("@/pages/achievements"));
const RewardsPage = lazy(() => import("@/pages/rewards"));
const StakingPage = lazy(() => import("@/pages/staking"));
const MiningPage = lazy(() => import("@/pages/mining"));
const ReferralsPage = lazy(() => import("@/pages/referrals"));
const LeaderboardPage = lazy(() => import("@/pages/leaderboard"));
const AdminDashboard = lazy(() => import("@/pages/admin/dashboard"));

const PageFallback = (
  <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
    Loading…
  </div>
);

const Home = () => (
  <Suspense fallback={PageFallback}>
    <HomePage />
  </Suspense>
);
const Wallet = () => (
  <Suspense fallback={PageFallback}>
    <WalletPage />
  </Suspense>
);
const Deposit = () => (
  <Suspense fallback={PageFallback}>
    <DepositPage />
  </Suspense>
);
const Withdrawal = () => (
  <Suspense fallback={PageFallback}>
    <WithdrawalPage />
  </Suspense>
);
const Profile = () => (
  <Suspense fallback={PageFallback}>
    <ProfilePage />
  </Suspense>
);
const Tasks = () => (
  <Suspense fallback={PageFallback}>
    <TasksPage />
  </Suspense>
);
const Achievements = () => (
  <Suspense fallback={PageFallback}>
    <AchievementsPage />
  </Suspense>
);
const Rewards = () => (
  <Suspense fallback={PageFallback}>
    <RewardsPage />
  </Suspense>
);
const Staking = () => (
  <Suspense fallback={PageFallback}>
    <StakingPage />
  </Suspense>
);
const Mining = () => (
  <Suspense fallback={PageFallback}>
    <MiningPage />
  </Suspense>
);
const Referrals = () => (
  <Suspense fallback={PageFallback}>
    <ReferralsPage />
  </Suspense>
);
const Leaderboard = () => (
  <Suspense fallback={PageFallback}>
    <LeaderboardPage />
  </Suspense>
);

function ProtectedAdminDashboard() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Checking permissions...</div>
      </div>
    );
  }

  if (!(user as any)?.isAdmin) {
    return <Redirect to="/" />;
  }

  return (
    <Suspense fallback={PageFallback}>
      <AdminDashboard />
    </Suspense>
  );
}

/**
 * Wrap wouter navigation in startTransition so lazy routes can suspend
 * without triggering React 18 "suspended while responding to synchronous input".
 */
function useTransitionLocation() {
  const [location, navigate] = useBrowserLocation();

  const transitionNavigate: typeof navigate = (to: any, opts?: any) => {
    startTransition(() => {
      navigate(to, opts);
    });
  };

  return [location, transitionNavigate] as const;
}

function AuthenticatedApp() {
  const style: React.CSSProperties = {
    ["--sidebar-width" as any]: "16rem",
    ["--sidebar-width-icon" as any]: "3rem",
  };

  useNotificationBadge();
  const [isChatOpen, setIsChatOpen] = useState(false);

  const openChat = () => startTransition(() => setIsChatOpen(true));
  const setChatOpen = (v: boolean) => startTransition(() => setIsChatOpen(v));

  return (
    <SidebarProvider style={style} defaultOpen={true}>
      {/* Mobile theme toggle */}
      <div className="fixed top-3 right-3 z-40 md:hidden">
        <ThemeToggle />
      </div>

      <MobileBottomNav onChatOpen={openChat} />

      <div className="flex h-screen w-full">
        <AppSidebar onChatOpen={openChat} />

        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Desktop header */}
          <header className="md:flex hidden items-center justify-between p-4 border-b border-border bg-background">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex items-center gap-4">
              <div className="text-sm text-muted-foreground">
                Welcome to{" "}
                <span className="font-bold bg-linear-to-r from-primary to-secondary bg-clip-text text-transparent">
                  XNRT
                </span>
              </div>
              <NotificationCenter />
              <ThemeToggle />
            </div>
          </header>

          <main className="flex-1 overflow-auto p-6 pb-24 md:pb-6 bg-background">
            <ErrorBoundary>
              <Switch>
                <Route path="/" component={Home} />
                <Route path="/wallet" component={Wallet} />
                <Route path="/deposit" component={Deposit} />
                <Route path="/withdrawal" component={Withdrawal} />
                <Route path="/staking" component={Staking} />
                <Route path="/mining" component={Mining} />
                <Route path="/referrals" component={Referrals} />
                <Route path="/profile" component={Profile} />
                <Route path="/tasks" component={Tasks} />
                <Route path="/achievements" component={Achievements} />
                <Route path="/rewards" component={Rewards} />
                <Route path="/leaderboard" component={Leaderboard} />
                <Route path="/admin" component={ProtectedAdminDashboard} />
                <Route>{() => <Redirect to="/" />}</Route>
              </Switch>
            </ErrorBoundary>
          </main>
        </div>
      </div>

      {/* IMPORTANT: ChatBot is lazy => must be inside Suspense in AuthenticatedApp too */}
      <Suspense fallback={null}>
        <ChatBot
          isOpen={isChatOpen}
          onOpenChange={setChatOpen}
          showLauncher={false}
        />
      </Suspense>
    </SidebarProvider>
  );
}

function UnauthenticatedApp() {
  const [location] = useLocation();
  const showChatBot = location === "/";

  return (
    <ErrorBoundary>
      <Switch>
        <Route path="/" component={Landing} />

        {/* Canonical auth route */}
        <Route path="/auth" component={Auth} />

        {/* Redirect legacy routes */}
        <Route path="/login">{() => <Redirect to="/auth" />}</Route>
        <Route path="/register">{() => <Redirect to="/auth" />}</Route>

        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/verify-email" component={VerifyEmail} />

        <Route path="/404" component={NotFound} />
        <Route>{() => <Redirect to="/" />}</Route>
      </Switch>

      {showChatBot && (
        <Suspense fallback={null}>
          <ChatBot />
        </Suspense>
      )}
    </ErrorBoundary>
  );
}

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();

  // While we don't yet know auth state, show a full-screen loader
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary" />
      </div>
    );
  }

  return isAuthenticated ? <AuthenticatedApp /> : <UnauthenticatedApp />;
}

export default function App() {
  return (
    <>
      <Router hook={useTransitionLocation as any}>
        <AppContent />
      </Router>

      {/* shadcn toast renderer */}
      <Toaster />

      {/* PWA helpers */}
      <Suspense fallback={null}>
        <PWAInstallPrompt />
        <PWAUpdateNotification />
      </Suspense>
    </>
  );
}
