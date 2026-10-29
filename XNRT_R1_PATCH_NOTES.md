# XNRT R1 — Financial Integrity & Idempotency

## Scope

R1 hardens balance-changing operations without redesigning the product UI or business model.

### Deposits
- Pending -> approved/rejected is now an atomic conditional state transition.
- Unverified deposits require explicit `force=true` after manual review.
- Admin UI no longer silently force-approves; override is an explicit checkbox.
- Referral payout retries are safe through the new `ReferralCommission` idempotency ledger (`source deposit + level` is unique).
- Historical approved deposits are marked `referralProcessed=true` during migration so R1 does not replay old commissions.
- Legacy destructive referral reconciliation endpoint is disabled.
- Scanner errors now stop cursor advancement, so failed relevant events are retried rather than skipped.

### Withdrawals
- New requests reserve funds atomically by removing them from the available source balance in the same DB transaction that creates the pending withdrawal.
- Approval finalizes the reservation; rejection refunds it atomically.
- Pre-R1 unreserved pending withdrawals remain backward compatible.
- Generic withdrawal from `stakingBalance` is blocked. Locked staking funds are released only from the matured stake flow.

### Staking
- Stake creation debits main balance and creates the stake atomically.
- Reward processing uses a per-stake Postgres advisory lock and commits stake profit + balance + activity together.
- Mature withdrawal is atomic and prevents previously processed staking profit from being paid twice.

### Mining
- Mining completion state, XP credit, XNRT credit, and activity now commit in one transaction.
- Database partial unique index enforces one active mining session per user.

### Tasks / daily check-in
- Task rewards use a per-user/task advisory lock and conditional completion.
- Daily check-in uses a per-user advisory lock and commits user streak/XP, balance reward, and activity together.

### Trust Loan
- Claim check now considers ANY previous loan claim, not only active/completed stakes.
- Database partial unique index enforces one lifetime claim per user/program.

## Migration warning

Before applying migration `20261028000100_r1_financial_integrity`, run `ops/XNRT_R1_PREFLIGHT.sql` on the target DB. The migration intentionally fails if duplicate referral edges, active mining sessions, or historical Trust Loan claims violate the new unique indexes.

## Recommended validation

```bash
pnpm install --frozen-lockfile
pnpm exec prisma generate
pnpm exec prisma validate
pnpm check
pnpm build
pnpm exec prisma migrate deploy
pnpm exec prisma migrate status
```

Do not run `pnpm db:push` for this patch; Prisma migrations are the intended schema authority.
