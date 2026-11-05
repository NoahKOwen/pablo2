# XNRT Mining Power R5-r1 — UX Finalization

Applies on top of the **uncommitted, exact shipped R5 patch** at `feature/mining-power-v1` HEAD `d4e5166`.

- Draft mode **unmounts** the entire payment-report form instead of only disabling its button.
- Existing R2 quote, transaction idempotency and payment authorization continue unchanged.
- Add guided four-stage activation orientation; move hypothetical historical calculator below the activation flow.
- Improve R5-only secondary-text contrast using theme-aware foreground colors (WCAG contrast still requires visual measurement).
- Add an operational Explore Mining Power Packages CTA when the activation history is empty.
- Distinguish an R3 emission-program pool ceiling from an R1 provisional tokenomics allocation.
- Replace overly technical R2/R3/R4 end-user copy with clearer activation/reward/network descriptions.
- Desktop labels distinguish Free XP Mining; mobile bottom tab retains compact "Mining" label with an explicit accessible name.
- Add source-AST test for draft-form structural gating, CTA wiring, and semantic button grouping.

**Scope:** Five client navigation/UI files + two new documentation/test files. No SQL changes, financial changes, worker changes, scheduled payouts, or legacy mining behavior changes. R5 and r1 should be committed together as one milestone after local tests and browser QA.
