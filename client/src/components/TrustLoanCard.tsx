// client/src/components/TrustLoanCard.tsx
import { useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { TRUST_LOAN_CONFIG } from "@shared/trust-loan";
import { STAKING_TIERS, type StakingTier } from "@shared/schema";
import { AlertCircle } from "lucide-react";

type TrustLoanStatus = {
  hasLoanStake: boolean;
  stake: any | null;
  directCount: number;
  investingCount: number;
  requiredReferrals: number;
  requiredInvestingReferrals: number;
  minInvestUsdtPerReferral: string;
  program: StakingTier;
  amountXnrt: number;
  durationDays: number;
};

export default function TrustLoanCard() {
  const { toast } = useToast();

  const { data, isLoading, isError, error } = useQuery<TrustLoanStatus>({
    queryKey: ["/api/trust-loan/status"],
  });

  const claimMutation = useMutation({
    // Use apiRequest so CSRF header + cookies are sent
    mutationFn: async () => {
      // apiRequest returns a Response in your codebase patterns
      const res = await apiRequest("POST", "/api/trust-loan/claim", {});
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Trust Loan claimed!",
        description: `You received ${TRUST_LOAN_CONFIG.amountXnrt.toLocaleString()} XNRT staked for ${TRUST_LOAN_CONFIG.durationDays} days.`,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/stakes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/balance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trust-loan/status"] });
    },
    onError: (err: any) => {
      const msg =
        err?.message || "Failed to claim Trust Loan. Please try again.";
      toast({
        title: "Error",
        description: msg,
        variant: "destructive",
      });
    },
  });

  const directCount = data?.directCount ?? 0;
  const investingCount = data?.investingCount ?? 0;

  const requiredReferrals =
    data?.requiredReferrals ?? TRUST_LOAN_CONFIG.requiredReferrals;

  const requiredInvestingReferrals =
    data?.requiredInvestingReferrals ??
    TRUST_LOAN_CONFIG.requiredInvestingReferrals;

  const minInvestUsdtPerReferral =
    data?.minInvestUsdtPerReferral ??
    String(TRUST_LOAN_CONFIG.minInvestUsdtPerReferral);

  const hasLoanStake = !!data?.hasLoanStake;

  // ✅ Claim condition: (directs >= required) OR (investing >= required)
  const canClaim = useMemo(() => {
    if (!data) return false;
    if (hasLoanStake) return false;

    const hasEnoughDirects = directCount >= requiredReferrals;
    const hasEnoughInvesting = investingCount >= requiredInvestingReferrals;

    return hasEnoughDirects || hasEnoughInvesting;
  }, [
    data,
    hasLoanStake,
    directCount,
    requiredReferrals,
    investingCount,
    requiredInvestingReferrals,
  ]);

  const directProgress =
    requiredReferrals > 0
      ? Math.min(100, (directCount / requiredReferrals) * 100)
      : 0;

  const investingProgress =
    requiredInvestingReferrals > 0
      ? Math.min(100, (investingCount / requiredInvestingReferrals) * 100)
      : 0;

  const inlineError =
    (claimMutation.isError && (claimMutation.error as any)?.message) ||
    (isError && (error as any)?.message) ||
    null;

  const tierConfig = STAKING_TIERS[TRUST_LOAN_CONFIG.programKey as StakingTier];

  return (
    <Card className="border-yellow-500/30 bg-linear-to-r from-yellow-500/5 to-orange-500/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-2xl">💰</span>
          Trust Loan ({TRUST_LOAN_CONFIG.durationDays} Days)
        </CardTitle>
        <CardDescription>
          Get {TRUST_LOAN_CONFIG.amountXnrt.toLocaleString()} XNRT staked for{" "}
          {TRUST_LOAN_CONFIG.durationDays} days. Unlock by: {requiredReferrals}{" "}
          directs <b>OR</b> {requiredInvestingReferrals} investing (≥{" "}
          {minInvestUsdtPerReferral} USDT)
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading && (
          <p className="text-sm text-muted-foreground">
            Loading Trust Loan status...
          </p>
        )}

        {!isLoading && (
          <>
            <div className="space-y-3 text-sm">
              <div>
                <p className="mb-1 flex items-center justify-between">
                  <span>Direct referrals</span>
                  <span className="font-mono">
                    {directCount} / {requiredReferrals}
                  </span>
                </p>
                <Progress value={directProgress} />
              </div>

              <div>
                <p className="mb-1 flex items-center justify-between">
                  <span>
                    Investing referrals (≥ {minInvestUsdtPerReferral} USDT)
                  </span>
                  <span className="font-mono">
                    {investingCount} / {requiredInvestingReferrals}
                  </span>
                </p>
                <Progress value={investingProgress} />
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2 md:flex-row md:items-center md:gap-3">
              <Button
                size="lg"
                disabled={!canClaim || claimMutation.isPending}
                onClick={() => claimMutation.mutate()}
              >
                {hasLoanStake
                  ? "Already Claimed"
                  : claimMutation.isPending
                    ? "Claiming..."
                    : "Claim Trust Loan"}
              </Button>

              {inlineError && (
                <div className="flex items-center gap-1 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <span>{inlineError}</span>
                </div>
              )}

              {!inlineError && !canClaim && !hasLoanStake && (
                <p className="text-xs text-muted-foreground">
                  Meet either requirement to unlock the Trust Loan.
                </p>
              )}

              {hasLoanStake && (
                <p className="text-xs text-chart-2">
                  Trust Loan already active:{" "}
                  {TRUST_LOAN_CONFIG.amountXnrt.toLocaleString()} XNRT staked.
                </p>
              )}
            </div>

            {tierConfig && (
              <p className="pt-1 text-xs text-muted-foreground">
                Daily Rate: {tierConfig.dailyRate}% • APY: {tierConfig.apy}% •
                Tier: {tierConfig.name}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
