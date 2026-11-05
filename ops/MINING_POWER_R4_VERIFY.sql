\echo '=== Mining Power R4 post-migration verification (read-only) ==='
\echo '1) R4 migration applied (expect 1)'
SELECT count(*) AS r4_applied FROM "_prisma_migrations"
WHERE migration_name='20261105000200_mining_power_r4_reward_batch_ledger'
AND finished_at IS NOT NULL AND rolled_back_at IS NULL;
\echo '2) R4 tables (expect 3)'
SELECT to_regclass('public."MiningRewardBatch"') AS batch,
       to_regclass('public."MiningRewardAllocation"') AS allocation,
       to_regclass('public."MiningRewardLedger"') AS ledger;
\echo '3) Constraints/indexes and no unexpected data'
SELECT tablename,indexname FROM pg_indexes WHERE schemaname='public' AND
tablename IN ('MiningRewardBatch','MiningRewardAllocation','MiningRewardLedger') ORDER BY 1,2;
SELECT conrelid::regclass AS table_name,conname FROM pg_constraint WHERE contype='c' AND
conrelid IN ('"MiningRewardBatch"'::regclass,'"MiningRewardAllocation"'::regclass,'"MiningRewardLedger"'::regclass) ORDER BY 1,2;
\echo '4) No R4 batch/allocations/ledger seeded (expect 0)'
SELECT (SELECT count(*) FROM "MiningRewardBatch") AS batches,
       (SELECT count(*) FROM "MiningRewardAllocation") AS allocations,
       (SELECT count(*) FROM "MiningRewardLedger") AS reward_ledger;
\echo '5) R4 trigger enforcement'
SELECT tgrelid::regclass AS table_name,tgname FROM pg_trigger
WHERE NOT tgisinternal AND tgname LIKE 'r4_%' ORDER BY 1,2;
\echo '6) R1/R2/R3 remain draft/no automatic mining emissions'
SELECT version,status,"payoutProcessingPaused","fullEmissionBaseMpThreshold" FROM "MiningProtocolConfig";
