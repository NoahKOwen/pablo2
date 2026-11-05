# Mining Power R4 — Reward Batch & Ledger

- Additive integration over R3's unique UTC emission reservations and per-activation MP snapshots; R1/R2/R3 financial service source is unmodified.
- Only R3-reserved days qualify. `R4PlanRewardBatch` pins exact R3 snapshot count, Effective MP denominator, reserved emission, and a **provisional nine-decimal** settlement precision.
- PostgreSQL triggers freeze R3 day and participant snapshots when the R4 batch exists; unique day/batch/activation indexes prevent duplicate obligations.
- `allocateFrozenDailyRewards` deterministically assigns integer 9-decimal token units via largest remainder and ascending activation ID tie-break. No `Number` arithmetic for token amounts, shares or remainders.
- Tiny unallocatable dust is retained in the R3 allocation, never credited, and never carried forward.
- Materialization is page-based and restartable; `createMany(skipDuplicates)` plus full persisted-row verification prevents partial allocation acceptance.
- Credit is manual, off by default, max 50 per SERIALIZABLE locked transaction; ledger + allocation status + legacy `Balance.miningBalance` and `totalEarned` increments commit atomically.
- R4 does not write `Balance.xnrtBalance`, payments, withdrawals, staking, R3 program, R1/R2 activation or outbox.
- Credits require `MINING_POWER_R4_ENABLE_CREDITS=1`, `MINING_POWER_R4_POLICY_APPROVED=1`, and `MINING_POWER_R4_LEDGER_DECIMALS=9`. The flags are operational controls; real governance approval and production review are outside the code patch.
- `payoutProcessingPaused` blocks new credit chunks but does not rewrite previously authorized R3 emission days; `emissionPaused` is not a payout cancellation.
- No HTTP mutation route, auto-scheduler, or production program activation is included.
- DB UPDATE guards protect R4 economic fields and ledger rows; production-grade DB role permissions, deletion audit and high-scale benchmarking remain later hardening tasks.
