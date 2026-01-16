import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PasswordStrength } from "@/components/ui/password-strength";
import { useToast } from "@/hooks/use-toast";
import { CosmicBackground } from "@/components/cosmic-background";
import { Sparkles, Mail, Lock, User, Gift, Eye, EyeOff } from "lucide-react";

export default function Auth() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<"login" | "register">("login");

  // Login state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  // Register state
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerUsername, setRegisterUsername] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [registerReferralCode, setRegisterReferralCode] = useState("");
  const [registerLoading, setRegisterLoading] = useState(false);

  // Resend verification state
  const [resendLoading, setResendLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // tab=login|register
    const tab = params.get("tab");
    if (tab === "register") setActiveTab("register");
    if (tab === "login") setActiveTab("login");

    // ref=CODE
    const refCode = params.get("ref");
    if (refCode) {
      setRegisterReferralCode(refCode);
      setActiveTab("register");
      toast({
        title: "Referral code applied!",
        description: `You're signing up with referral code: ${refCode}`,
      });
    }

    // resend=true (optional UX hint)
    const resend = params.get("resend");
    if (resend === "true") {
      setActiveTab("login");
      toast({
        title: "Resend verification",
        description: "Enter your email, then click “Resend verification email”.",
      });
    }
  }, [toast]);

  async function refreshSessionAndGoHome() {
    // Make /auth/me refetch so AppContent flips to AuthenticatedApp
    await qc.invalidateQueries({ queryKey: ["/auth/me"] });
    await qc.refetchQueries({ queryKey: ["/auth/me"] });

    setLocation("/");
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);

    try {
      const response = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 403 && (data as any)?.emailVerified === false) {
          toast({
            title: "Email not verified",
            description:
              (data as any)?.message ||
              "Please verify your email before logging in.",
            variant: "destructive",
          });
          setActiveTab("login");
          return;
        }
        throw new Error((data as any)?.message || "Login failed");
      }

      toast({
        title: "Welcome back!",
        description: "Login successful",
      });

      await refreshSessionAndGoHome();
    } catch (error: any) {
      toast({
        title: "Login failed",
        description: error?.message || "Invalid credentials",
        variant: "destructive",
      });
    } finally {
      setLoginLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!loginEmail) {
      toast({
        title: "Email required",
        description: "Please enter your email address to resend verification",
        variant: "destructive",
      });
      return;
    }

    setResendLoading(true);

    try {
      const response = await fetch("/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: loginEmail }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error((data as any)?.message || "Failed to resend email");
      }

      toast({
        title: "Verification email sent!",
        description: "Please check your inbox for the verification link",
        duration: 5000,
      });
    } catch (error: any) {
      toast({
        title: "Failed to resend",
        description: error?.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setResendLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterLoading(true);

    const emailForPrefill = registerEmail;

    try {
      const response = await fetch("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: registerEmail,
          username: registerUsername,
          password: registerPassword,
          referralCode: registerReferralCode || undefined,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error((data as any)?.message || "Registration failed");
      }

      toast({
        title: "Account created!",
        description:
          (data as any)?.message ||
          "Please check your email to verify your account.",
        duration: 6000,
      });

      // Clear register form
      setRegisterEmail("");
      setRegisterUsername("");
      setRegisterPassword("");
      setRegisterReferralCode("");

      // Switch to login tab and prefill email
      setActiveTab("login");
      setLoginEmail(emailForPrefill);
    } catch (error: any) {
      toast({
        title: "Registration failed",
        description: error?.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setRegisterLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden p-4">
      <CosmicBackground />

      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md"
      >
        <Card className="relative overflow-hidden border-primary/20 backdrop-blur-xl bg-white/10 dark:bg-black/20 shadow-2xl">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-secondary/10 pointer-events-none" />

          <CardHeader className="text-center relative z-10">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="flex justify-center mb-4"
            >
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/50">
                <Sparkles className="w-12 h-12 text-white" />
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <CardTitle className="text-4xl font-bold bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent animate-gradient">
                XNRT
              </CardTitle>
              <CardDescription className="mt-2 text-base">
                Beyond a coin. It's hope
              </CardDescription>
            </motion.div>
          </CardHeader>

          <CardContent className="relative z-10">
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as any)}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-2 mb-6 backdrop-blur-sm bg-white/20 dark:bg-black/30">
                <TabsTrigger
                  value="login"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  data-testid="tab-login"
                >
                  Login
                </TabsTrigger>
                <TabsTrigger
                  value="register"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  data-testid="tab-register"
                >
                  Register
                </TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="space-y-4" data-testid="content-login">
                <motion.form
                  key="login-form"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3 }}
                  onSubmit={handleLogin}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="login-email" className="text-foreground/90">
                      Email
                    </Label>
                    <div className="relative group">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="your@email.com"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        className="pl-10 backdrop-blur-sm bg-white/50 dark:bg-black/30 border-white/20 focus:border-primary/50 focus:ring-primary/50"
                        required
                        data-testid="input-login-email"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="login-password" className="text-foreground/90">
                        Password
                      </Label>
                      <button
                        type="button"
                        onClick={() => setLocation("/forgot-password")}
                        className="text-xs text-primary hover:underline"
                        data-testid="link-forgot-password"
                      >
                        Forgot Password?
                      </button>
                    </div>
                    <div className="relative group">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <Input
                        id="login-password"
                        type={showLoginPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="pl-10 pr-10 backdrop-blur-sm bg-white/50 dark:bg-black/30 border-white/20 focus:border-primary/50 focus:ring-primary/50"
                        required
                        data-testid="input-login-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowLoginPassword((prev) => !prev)}
                        className="absolute inset-y-0 right-3 flex items-center text-muted-foreground hover:text-primary focus:outline-none"
                        aria-label={showLoginPassword ? "Hide password" : "Show password"}
                      >
                        {showLoginPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button
                      type="submit"
                      className="w-full bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-opacity shadow-lg"
                      disabled={loginLoading}
                      data-testid="button-login-submit"
                    >
                      {loginLoading ? "Logging in..." : "Login"}
                    </Button>
                  </motion.div>

                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={handleResendVerification}
                      disabled={resendLoading}
                      className="text-xs text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                      data-testid="link-resend-verification"
                    >
                      {resendLoading ? "Sending..." : "Resend verification email"}
                    </button>
                  </div>
                </motion.form>
              </TabsContent>

              <TabsContent value="register" className="space-y-4" data-testid="content-register">
                <motion.form
                  key="register-form"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3 }}
                  onSubmit={handleRegister}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="register-email" className="text-foreground/90">
                      Email
                    </Label>
                    <div className="relative group">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <Input
                        id="register-email"
                        type="email"
                        placeholder="your@email.com"
                        value={registerEmail}
                        onChange={(e) => setRegisterEmail(e.target.value)}
                        className="pl-10 backdrop-blur-sm bg-white/50 dark:bg-black/30 border-white/20 focus:border-primary/50 focus:ring-primary/50"
                        required
                        data-testid="input-register-email"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-username" className="text-foreground/90">
                      Username
                    </Label>
                    <div className="relative group">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <Input
                        id="register-username"
                        type="text"
                        placeholder="username"
                        value={registerUsername}
                        onChange={(e) => setRegisterUsername(e.target.value)}
                        className="pl-10 backdrop-blur-sm bg-white/50 dark:bg-black/30 border-white/20 focus:border-primary/50 focus:ring-primary/50"
                        required
                        minLength={3}
                        maxLength={20}
                        data-testid="input-register-username"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-password" className="text-foreground/90">
                      Password
                    </Label>
                    <div className="relative group">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <Input
                        id="register-password"
                        type={showRegisterPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={registerPassword}
                        onChange={(e) => setRegisterPassword(e.target.value)}
                        className="pl-10 pr-10 backdrop-blur-sm bg-white/50 dark:bg-black/30 border-white/20 focus:border-primary/50 focus:ring-primary/50"
                        required
                        minLength={8}
                        data-testid="input-register-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegisterPassword((prev) => !prev)}
                        className="absolute inset-y-0 right-3 flex items-center text-muted-foreground hover:text-primary focus:outline-none"
                        aria-label={showRegisterPassword ? "Hide password" : "Show password"}
                      >
                        {showRegisterPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    <PasswordStrength password={registerPassword} className="mt-2" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-referral" className="text-foreground/90">
                      Referral Code (Optional)
                    </Label>
                    <div className="relative group">
                      <Gift className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <Input
                        id="register-referral"
                        type="text"
                        placeholder="Enter referral code"
                        value={registerReferralCode}
                        onChange={(e) => setRegisterReferralCode(e.target.value)}
                        className="pl-10 backdrop-blur-sm bg-white/50 dark:bg-black/30 border-white/20 focus:border-primary/50 focus:ring-primary/50"
                        data-testid="input-register-referral"
                      />
                    </div>
                  </div>

                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button
                      type="submit"
                      className="w-full bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-opacity shadow-lg"
                      disabled={registerLoading}
                      data-testid="button-register-submit"
                    >
                      {registerLoading ? "Creating Account..." : "Create Account"}
                    </Button>
                  </motion.div>
                </motion.form>
              </TabsContent>
            </Tabs>

            <div className="mt-6 text-center">
              <p className="text-sm text-muted-foreground">
                Or continue with{" "}
                <a
                  href="/api/login"
                  className="text-primary hover:underline font-medium"
                  data-testid="link-replit-login"
                >
                  Replit Account
                </a>
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="absolute -inset-1 bg-gradient-to-r from-primary/30 to-secondary/30 rounded-xl blur-xl -z-10 opacity-50" />
      </motion.div>
    </div>
  );
}
