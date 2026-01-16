export const TRUST_LOAN_CONFIG = {
  programKey: "trust_45" as const,
  amountXnrt: 5000,
  durationDays: 45,
  requiredReferrals: 10,
  requiredInvestingReferrals: 3,
  minInvestUsdtPerReferral: 50,
  maxClaimsPerUser: 1,
};

export type TrustLoanProgramKey = typeof TRUST_LOAN_CONFIG.programKey;

export function formatTrustLoanCopy() {
  return {
    title: "Trust Loan (45 Days)",
    subtitle: `Get ${TRUST_LOAN_CONFIG.amountXnrt.toLocaleString()} XNRT staked for ${TRUST_LOAN_CONFIG.durationDays} days`,
    unlock: `Unlock by: ${TRUST_LOAN_CONFIG.requiredReferrals} directs, ${TRUST_LOAN_CONFIG.requiredInvestingReferrals} investing (${TRUST_LOAN_CONFIG.minInvestUsdtPerReferral} USDT+)`,
  };
}

export default TRUST_LOAN_CONFIG;
