# XNRT Mining Power R2 — Activation & Payment Integrity

Baseline: `feature/mining-power-v1` at commit `525b1aa`.

## Scope

- Dedicated Mining Power payment transactions (`type=mining_activation`, `source=mining_power`).
- Active-protocol package/duration discovery and activation quote endpoint.
- Idempotent activation request creation with global `activationRequestId` and transaction-hash protection.
- USDT-only package-price-exact activation payments for Mining Power v1.
- Admin verification / approve / reject flow isolated from normal deposit crediting.
- Atomic payment approval + activation qualification + `MiningActivationQualified` OutboxEvent.
- Strict-after UTC reward eligibility and calendar-month expiry using R1 pure functions.
- Early-exit request records the next strict UTC reward boundary without immediately changing status away from `active`.
- R2 DB lifecycle constraints and OutboxEvent foundation.

## Explicitly out of scope

- Outbox consumer/referral commission settlement (R6).
- Epoch/emission engine (R3).
- Daily reward batches/credits (R4).
- Mining Power frontend replacement (R5).
- Legacy mining cutover (R7).
- Genesis/staking dynamic boost activation (R6). R2 snapshots Genesis as disabled (`false`, multiplier `1`) until its policy is versioned.

## Financial invariant

A normal `deposit` is never reused as a Mining Power activation payment. Existing deposit approval credits XNRT and triggers the existing referral path, so R2 creates a dedicated payment transaction that does not credit `Balance`.

## Protocol availability

R2 only accepts new activation requests when one `MiningProtocolConfig` row is `active` and `activationPaused=false`. The R1 seed remains `draft`; this patch does not silently activate it.
