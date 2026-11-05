\echo '=== Mining Power R1 post-migration / post-seed verification ==='

\echo '1) Core tables (expect all four names)'
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('MiningProtocolConfig','MiningPackage','MiningDuration','MiningActivation')
ORDER BY tablename;

\echo '2) Draft protocol config (expect mining-power-v1-draft, threshold NULL)'
SELECT
  "version",
  "status",
  "maxSupplySnapshot",
  "miningAllocationPercentSnapshot",
  "rewardPoolTokenAmount",
  "maxEffectiveMpMultiplier",
  "maxEcosystemBoost",
  "fullEmissionBaseMpThreshold",
  "baseMpPerUsdt",
  "rewardTimezone",
  "rewardBoundaryHourUtc",
  "termsVersion"
FROM "MiningProtocolConfig"
ORDER BY "createdAt";

\echo '3) Package seed count (expect 8)'
SELECT COUNT(*) AS package_count FROM "MiningPackage";

\echo '4) Duration seed count (expect 7)'
SELECT COUNT(*) AS duration_count FROM "MiningDuration";

\echo '5) Package definitions'
SELECT "code", "name", "activationAmountUsdt", "baseMp", "packageBoostRate", "enabled", "sortOrder"
FROM "MiningPackage"
ORDER BY "sortOrder";

\echo '6) Duration definitions'
SELECT "months", "multiplier", "enabled"
FROM "MiningDuration"
ORDER BY "months";

\echo '7) R1 should create no activations by itself (expect 0)'
SELECT COUNT(*) AS activation_count FROM "MiningActivation";

\echo '8) Critical unique indexes / one-active protocol guard'
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'mining_protocol_config_version_unique',
    'mining_protocol_one_active_version',
    'mining_activations_request_unique',
    'mining_activations_payment_transaction_unique'
  )
ORDER BY indexname;
