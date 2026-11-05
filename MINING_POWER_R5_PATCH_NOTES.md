# Mining Power R5 — Complete UX & Transparency

Baseline: clean `feature/mining-power-v1` at `d4e5166`.

This ONE guarded patch delivers:
- New authenticated user page `/mining-power`, desktop sidebar and mobile More navigation.
- R1 package/duration preview and R2-backed authoritative quote/payment report/early exit flow.
- R2 activation history, R3 frozen snapshot aggregates, R4 pending allocations and credited reward ledger data.
- Owner-scoped cursor pagination, public aggregate-only network transparency, latest 30 reserved UTC reward days.
- Historical what-if network-share illustration, never an expected-return or guaranteed-reward claim.
- Default-off paid activation UI. Requires approved, active protocol and emission program plus separate R5 approval flags. R2 financial endpoints remain unchanged and need their own production gating in R7.
- Pure tests and guarded local integration script. Zero changes to Prisma schema or existing R1–R4 services, no automatic payouts or emissions, legacy `/mining` unaffected.

New GET API endpoints:
- `/api/mining-power/catalog` (public, preview-only by default)
- `/api/mining-power/network` (public aggregate-only)
- `/api/mining-power/me/overview` (requires existing authentication)
- `/api/mining-power/me/activations` (requires authentication, keyed pagination and owner scoping)
- `/api/mining-power/me/rewards` (requires authentication, keyed pagination and owner scoping)

Manual activation of R5 purchase UI is NOT approval for live economic activity. Tokenomics, settlement precision, full-emission threshold, payout engine and regulatory requirements must be reviewed before production. Read `README.md` in the patch ZIP.
