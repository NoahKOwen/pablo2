-- XNRT R1 pre-migration safety checks (read-only)
-- Run against the target database BEFORE `prisma migrate deploy`.

-- Must return zero rows. R1 adds a partial unique index permitting only one
-- active mining session per user.
SELECT "userId", COUNT(*) AS active_sessions
FROM "MiningSession"
WHERE "status" = 'active'
GROUP BY "userId"
HAVING COUNT(*) > 1;

-- Must return zero rows. R1 enforces one lifetime Trust Loan claim per
-- user/program, regardless of the stake's later status.
SELECT "userId", "loanProgram", COUNT(*) AS claims
FROM "Stake"
WHERE "isLoan" = true AND "loanProgram" IS NOT NULL
GROUP BY "userId", "loanProgram"
HAVING COUNT(*) > 1;


-- Must return zero rows. R1 makes each referral edge unique so concurrent
-- commission payouts update one aggregate row instead of creating duplicates.
SELECT "referrerId", "referredUserId", "level", COUNT(*) AS duplicate_edges
FROM "Referral"
GROUP BY "referrerId", "referredUserId", "level"
HAVING COUNT(*) > 1;

-- Review manually before deployment. R1 blocks NEW generic staking withdrawals,
-- but existing pending legacy requests are retained and can still be finalized
-- by admins using the backward-compatible reservation logic.
SELECT "id", "userId", "amount", "source", "status", "createdAt"
FROM "Transaction"
WHERE "type" = 'withdrawal'
  AND "status" = 'pending'
  AND "source" = 'staking'
ORDER BY "createdAt" ASC;
