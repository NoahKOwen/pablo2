\echo '=== Mining Power R4 preflight (read-only) ==='
\echo '1) Latest R3 migration applied (expect 1)'
SELECT count(*) AS r3_applied FROM "_prisma_migrations"
WHERE migration_name='20261105000100_mining_power_r3_epoch_emission'
AND finished_at IS NOT NULL AND rolled_back_at IS NULL;
\echo '2) R4 migration absent before deploy (expect 0)'
SELECT count(*) AS r4_applied FROM "_prisma_migrations"
WHERE migration_name='20261105000200_mining_power_r4_reward_batch_ledger'
AND finished_at IS NOT NULL AND rolled_back_at IS NULL;
\echo '3) R4 tables absent before deploy (expect null x3)'
SELECT to_regclass('public."MiningRewardBatch"') AS batch,
       to_regclass('public."MiningRewardAllocation"') AS allocation,
       to_regclass('public."MiningRewardLedger"') AS ledger;
\echo '4) Existing R3 state (normally 0 programs/days/snapshots on draft baseline)'
SELECT (SELECT count(*) FROM "MiningEmissionProgram") AS r3_programs,
       (SELECT count(*) FROM "MiningEmissionDay") AS r3_days,
       (SELECT count(*) FROM "MiningDailyPowerSnapshot") AS r3_snapshots;
\echo '5) Existing draft protocol preserved'
SELECT version, status, "payoutProcessingPaused", "fullEmissionBaseMpThreshold" FROM "MiningProtocolConfig";
