\echo '=== Mining Power R3 post-migration verification (read-only) ==='
\echo '1) R3 migration recorded (expect 1)'
SELECT count(*) AS r3_applied FROM "_prisma_migrations"
WHERE migration_name='20261105000100_mining_power_r3_epoch_emission' AND finished_at IS NOT NULL AND rolled_back_at IS NULL;
\echo '2) Tables (expect 3)'
SELECT to_regclass('public."MiningEmissionProgram"') AS program,
       to_regclass('public."MiningEmissionDay"') AS day,
       to_regclass('public."MiningDailyPowerSnapshot"') AS snapshots;
\echo '3) R3 critical unique constraints/indexes'
SELECT tablename, indexname FROM pg_indexes
WHERE schemaname='public' AND tablename IN ('MiningEmissionProgram','MiningEmissionDay','MiningDailyPowerSnapshot')
ORDER BY tablename, indexname;
\echo '4) R3 protection checks'
SELECT conrelid::regclass AS table_name, conname FROM pg_constraint
WHERE conrelid IN ('"MiningEmissionProgram"'::regclass, '"MiningEmissionDay"'::regclass, '"MiningDailyPowerSnapshot"'::regclass)
AND contype='c' ORDER BY 1, 2;
\echo '5) Migration creates NO program, day, snapshot or payouts (expect 0 / 0 / 0)'
SELECT (SELECT count(*) FROM "MiningEmissionProgram") AS programs,
       (SELECT count(*) FROM "MiningEmissionDay") AS emission_days,
       (SELECT count(*) FROM "MiningDailyPowerSnapshot") AS power_snapshots;
\echo '6) Baseline seed preservation'
SELECT (SELECT count(*) FROM "MiningPackage") AS packages,
       (SELECT count(*) FROM "MiningDuration") AS durations,
       (SELECT count(*) FROM "MiningActivation") AS activations;
