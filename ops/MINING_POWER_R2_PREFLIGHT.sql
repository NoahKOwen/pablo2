\echo '=== Mining Power R2 preflight ==='
\echo '1) R1 migration must be applied (expect 1)'
SELECT COUNT(*) AS r1_applied
FROM "_prisma_migrations"
WHERE migration_name = '20261029000100_mining_power_r1_protocol_schema'
  AND finished_at IS NOT NULL
  AND rolled_back_at IS NULL;

\echo '2) R2 migration must not already be applied (expect 0)'
SELECT COUNT(*) AS r2_applied
FROM "_prisma_migrations"
WHERE migration_name = '20261029000200_mining_power_r2_activation_payment_integrity'
  AND finished_at IS NOT NULL
  AND rolled_back_at IS NULL;

\echo '3) OutboxEvent must not exist before R2 migration (expect null)'
SELECT to_regclass('public."OutboxEvent"') AS outbox_event;

\echo '4) Existing R1 activations (expect 0 before first R2 rollout)'
SELECT COUNT(*) AS activation_count FROM "MiningActivation";

\echo '5) R1 package/duration seeds must remain intact (expect 8 / 7)'
SELECT
  (SELECT COUNT(*) FROM "MiningPackage") AS package_count,
  (SELECT COUNT(*) FROM "MiningDuration") AS duration_count;
