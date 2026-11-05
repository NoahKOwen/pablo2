# Mining Power R1 — Protocol Schema & Config

## Scope

This patch translates the frozen Mining Power R0 implementation contract into database schema, draft/versioned protocol configuration, package/duration seed definitions, and pure calculation helpers.

### Included

- `MiningProtocolConfig`
- `MiningPackage`
- `MiningDuration`
- `MiningActivation` schema foundation
- one-payment / one-activation DB uniqueness fields
- static-vs-dynamic Mining Power split in calculation helpers
- strict-after UTC reward boundary helper
- calendar-month expiry helper
- Genesis daily multiplier helper
- canonical eligible-set predicate
- R1 preflight SQL
- R1 seed script
- pure calculation tests

### Explicitly not included

- payment/activation API flow (R2)
- outbox delivery / referral integration (R2/R6)
- epoch/emission processing (R3)
- reward batches / balance payout (R4)
- Mining Power UI (R5)
- dynamic staking/VIP/NFT entitlement engine (R6)
- legacy MiningSession cutover (R7)

## Provisional values

The initial draft config uses the current planning values of 1B max supply, 15% / 150M Mining allocation, 2.50x max Effective MP, and +25% ecosystem boost cap. `fullEmissionBaseMpThreshold` intentionally remains NULL until Tokenomics v1 simulation locks it.

The migration creates schema only. Run `pnpm exec tsx scripts/seed-mining-power-r1.ts` after migration validation to seed the draft config, packages, and duration rows.
