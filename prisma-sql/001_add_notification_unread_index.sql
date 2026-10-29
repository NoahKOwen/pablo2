-- Create partial index to speed up unread notification COUNT queries
-- This file is Postgres-only. It checks for the index and creates it
-- using a DO block. Note: `CREATE INDEX CONCURRENTLY` cannot be executed
-- inside a transaction block (which a DO runs in). If you need to create
-- the index concurrently, run the suggested psql command separately.
-- postgres
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_class c
		JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE c.relkind = 'i'
			AND c.relname = 'idx_notification_user_unread'
	) THEN
		-- Create the partial index. This runs inside the DO (transactional)
		-- and therefore does NOT use CONCURRENTLY. To create concurrently,
		-- run the following command outside of a transaction instead:
		-- psql -c "CREATE INDEX CONCURRENTLY idx_notification_user_unread ON \"Notification\" (\"userId\") WHERE \"read\" = false"
		EXECUTE 'CREATE INDEX idx_notification_user_unread ON "Notification" ("userId") WHERE "read" = false';
	END IF;
END $$ LANGUAGE plpgsql;
