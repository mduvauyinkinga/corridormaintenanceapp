-- 003_complaint_retention.sql
-- -------------------------------------------------------------------
-- Complaint retention: auto-archive after 14 days, auto-delete after 6 months.
--
-- - `archived` flags Completed/Cancelled complaints whose `updated_at` is
--   older than ARCHIVE_AFTER_DAYS (default 14). Archived rows stay in the
--   database but are hidden from the default management queue.
-- - A scheduled job hard-deletes archived (or old Completed/Cancelled) rows
--   older than DELETE_AFTER_DAYS (default 180) — notes/timeline/photos go
--   with them via ON DELETE CASCADE.
-- - Pending reopen requests are never archived/deleted by the job.

ALTER TABLE complaints ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_complaints_archived_updated ON complaints (archived, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_complaints_status_updated ON complaints (status, updated_at DESC);
