\echo '=== Mining Power R2 post-migration verification ==='
\echo '1) OutboxEvent table exists'
SELECT to_regclass('public."OutboxEvent"') AS outbox_event;

\echo '2) R2 migration recorded (expect 1)'
SELECT COUNT(*) AS r2_applied
FROM "_prisma_migrations"
WHERE migration_name = '20261029000200_mining_power_r2_activation_payment_integrity'
  AND finished_at IS NOT NULL
  AND rolled_back_at IS NULL;

\echo '3) Critical OutboxEvent indexes'
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'OutboxEvent'
ORDER BY indexname;

\echo '4) R2 MiningActivation constraints'
SELECT conname
FROM pg_constraint
WHERE conrelid = '"MiningActivation"'::regclass
  AND conname IN (
    'mining_activation_payment_asset_usdt_v1',
    'mining_activation_payment_matches_package',
    'mining_activation_eligible_value_matches_package',
    'mining_activation_active_lifecycle_complete',
    'mining_activation_payment_pending_linked',
    'mining_activation_exit_pair_valid',
    'mining_activation_reward_eligible_boundary',
    'mining_activation_expiry_boundary',
    'mining_activation_exit_boundary'
  )
ORDER BY conname;

\echo '5) R1 seed definitions remain unchanged (expect 8 / 7)'
SELECT
  (SELECT COUNT(*) FROM "MiningPackage") AS package_count,
  (SELECT COUNT(*) FROM "MiningDuration") AS duration_count;

\echo '6) R2 adds no activation/outbox rows by migration alone'
SELECT
  (SELECT COUNT(*) FROM "MiningActivation") AS activation_count,
  (SELECT COUNT(*) FROM "OutboxEvent") AS outbox_count;
