\echo '=== R3 pre-migration preflight; read-only ==='
\echo '1) R1 and R2 migrations applied (expect 2)'
SELECT COUNT(*) AS applied_r1_r2 FROM "_prisma_migrations"
WHERE migration_name IN ('20261029000100_mining_power_r1_protocol_schema','20261029000200_mining_power_r2_activation_payment_integrity')
AND finished_at IS NOT NULL AND rolled_back_at IS NULL;
\echo '2) R3 migration not applied (expect 0)'
SELECT COUNT(*) AS r3_applied FROM "_prisma_migrations"
WHERE migration_name='20261105000100_mining_power_r3_epoch_emission'
AND finished_at IS NOT NULL AND rolled_back_at IS NULL;
\echo '3) R3 tables absent before migration (expect null x3)'
SELECT to_regclass('public."MiningEmissionProgram"') AS program,
       to_regclass('public."MiningEmissionDay"') AS day,
       to_regclass('public."MiningDailyPowerSnapshot"') AS snapshots;
\echo '4) Existing R2 activations/outbox (read-only)'
SELECT (SELECT count(*) FROM "MiningActivation") AS activations,
       (SELECT count(*) FROM "OutboxEvent") AS outbox;
\echo '5) R1 config remains non-operative by default (expect draft and NULL threshold)'
SELECT version, status, "emissionPaused", "fullEmissionBaseMpThreshold" FROM "MiningProtocolConfig";
