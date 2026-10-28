-- 002_complaint_photos.sql
-- -------------------------------------------------------------------
-- Free photo storage inside Postgres (no Firebase Storage / paid service).
--
-- The browser compresses each photo (~1280px, JPEG ~0.7) before upload so
-- a phone photo lands at ~150-300KB. Bytes are stored in BYTEA, which
-- survives ephemeral hosts (Render/Railway) unlike local disk.
-- Served via GET /api/complaints/:id/photos/:photoId.

CREATE TABLE IF NOT EXISTS complaint_photos (
  id           TEXT PRIMARY KEY,
  complaint_id TEXT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  mime_type    TEXT NOT NULL,
  data         BYTEA NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_photos_complaint_created
  ON complaint_photos (complaint_id, created_at ASC);
