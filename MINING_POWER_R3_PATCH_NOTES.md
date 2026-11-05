# Mining Power R3 — Epoch & Emission Engine

- Immutable per-day reservations: a single UTC date across all protocols is keyed uniquely. An `active` emission program is never seeded by migration.
- Fixed 84-month schedule from an explicitly configured UTC-first-of-month genesis: 0–18m 100%; 18–42m 85%; 42–66m 65%; 66–84m 40%.
- Per-day theoretical ceiling = `floor(pool × epochWeight / Σ(actualEpochDays × epochWeight))`. Leap years and calendar days are included. **No carry-forward or catch-up.**
- Utilization = `min(1, eligible Network Base MP / finalized threshold)`; reserved daily amount = `floor(theoretical × utilization)`.
- Effective MP is snapshotted per activation for the day with R1 calculation + genesis snapshot and cap. No new ecosystem boosts introduced.
- R3 uses *R1 canonical active-status eligibility*, exactly as in R1 calculations; it does not reinterpret statuses or change R2 payment logic. Delayed backfill after status transitions must be reviewed before production scheduling.
- R3 is **non-operational by default**: the R1 threshold is null, no R3 program exists, and writes require explicit environment opt-in + active program + active R1 protocol + unpaused emission.
- Double layer cap: 150M provisional hard cap and R1 pool/max-supply/allocation snapshots. Reservations across all programs are locked and summed globally.
- Manual CLI only, no auto workers and no HTTP mutation endpoints. Admin GET monitoring only.
- R3 never credits wallets, mints/allocates user tokens, makes payouts, changes balances, or modifies R1/R2 activation/payment services.
- R3 production activation, finalized network threshold, historical backfill policy, scalability and epoch start require future explicit governance review.
