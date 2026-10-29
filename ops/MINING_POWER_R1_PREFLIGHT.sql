\echo '=== Mining Power R1 preflight ==='

\echo '1) Financial R1 Transaction columns must exist (expect 2 rows)'
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'Transaction'
  AND column_name IN ('fundsReserved', 'referralProcessed')
ORDER BY column_name;

\echo '2) ReferralCommission must exist (expect ReferralCommission)'
SELECT to_regclass('public."ReferralCommission"') AS referral_commission_table;

\echo '3) Mining Power R1 tables must NOT exist before migration (all should be null)'
SELECT
  to_regclass('public."MiningProtocolConfig"') AS protocol_config,
  to_regclass('public."MiningPackage"') AS mining_package,
  to_regclass('public."MiningDuration"') AS mining_duration,
  to_regclass('public."MiningActivation"') AS mining_activation;

\echo '4) Mining Power R1 migration should not already be recorded before deploy (expect 0)'
SELECT COUNT(*) AS already_applied
FROM "_prisma_migrations"
WHERE migration_name = '20261029000100_mining_power_r1_protocol_schema';
