# Ops SQL

This folder contains production (ops) SQL scripts that must be run manually.

Rules
- DO NOT run these scripts via transactional migration tools (drizzle/knex/etc.) when they use `CONCURRENTLY` or other non-transactional operations.
- Run manually using `psql` or via your cloud SQL editor (Neon UI).
- Scripts in this folder should be idempotent (safe to re-run).

How to run

From your workstation or CI runner with `psql` available and `DATABASE_URL` set:

```bash
psql "$DATABASE_URL" -f ops/create_idx_notification_user_unread.sql
```

Alternative (helper script included):

```bash
# Make executable: chmod +x scripts/run-ops.sh
scripts/run-ops.sh ops/create_idx_notification_user_unread.sql
```

If you require audit logging of applied ops, prefer to use an external changelog or the `_ops_migrations` table described below (run the logging INSERT separately from the index creation).

Ops logging (optional)

If you'd like to record that an ops script was applied, use a separate idempotent INSERT into an ops changelog table _after_ confirming the ops completed successfully. Do NOT wrap a `CREATE INDEX CONCURRENTLY` inside a transaction with the logging insert.

Example (run separately):

```sql
CREATE TABLE IF NOT EXISTS _ops_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO _ops_migrations (id) VALUES ('idx_notification_user_unread') ON CONFLICT DO NOTHING;
```
