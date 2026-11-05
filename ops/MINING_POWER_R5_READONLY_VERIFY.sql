\echo '=== R5 read-only schema verification; no migrations, no changes ==='
SELECT version,status,"fullEmissionBaseMpThreshold","activationPaused","emissionPaused","payoutProcessingPaused"
FROM "MiningProtocolConfig" ORDER BY "createdAt" DESC;
SELECT (SELECT COUNT(*) FROM "MiningActivation") AS activations,
 (SELECT COUNT(*) FROM "MiningEmissionProgram") AS emission_programs,
 (SELECT COUNT(*) FROM "MiningEmissionDay") AS emission_days,
 (SELECT COUNT(*) FROM "MiningRewardBatch") AS reward_batches,
 (SELECT COUNT(*) FROM "MiningRewardAllocation") AS reward_allocations,
 (SELECT COUNT(*) FROM "MiningRewardLedger") AS reward_ledger;
\echo 'This SQL verifies existing records only. R5 requires no DDL.'
