-- ============================================================
-- OPS MIGRATION (PRODUCTION-SAFE)
-- Purpose: Speed up unread notification count queries
-- Database: PostgreSQL (Neon)
-- Safety: ZERO-DOWNTIME (uses CREATE INDEX CONCURRENTLY)
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notification_user_unread
ON "Notification" ("userId")
WHERE "read" = false;
