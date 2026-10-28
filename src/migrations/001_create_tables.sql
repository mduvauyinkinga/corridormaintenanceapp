-- 001_create_tables.sql
-- -------------------------------------------------------------------
-- Full schema for the Corridor Hill Maintenance System. This mirrors
-- the Firestore data model (users, rooms, units, complaints +
-- maintenanceNotes/timeline subcollections, unitAnnouncements) so the
-- existing clients keep the same field semantics.
--
-- Column names are snake_case in SQL; the API maps them to the
-- camelCase field names the clients already use (roomId, unitId, ...).

-- Users (was: users/{uid}). id is the Firebase-style uid.
CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  student_number TEXT,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'resident',
  room_id        TEXT,
  unit_id        TEXT,
  room_letter    TEXT,
  block          TEXT,
  room_number    INTEGER,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Parent rooms (was: rooms/{roomId}).
CREATE TABLE IF NOT EXISTS rooms (
  id          TEXT PRIMARY KEY,
  block       TEXT,
  room_number TEXT,
  floor       TEXT
);

-- Bed slots (was: units/{unitId}). Two beds per lettered room.
CREATE TABLE IF NOT EXISTS units (
  id          TEXT PRIMARY KEY,
  room_id     TEXT REFERENCES rooms(id) ON DELETE CASCADE,
  room_letter TEXT,
  bed_number  INTEGER,
  occupied    BOOLEAN NOT NULL DEFAULT FALSE,
  resident_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  block       TEXT,
  room_number TEXT,
  floor       TEXT
);

-- Complaints (was: complaints/{complaintId}).
CREATE TABLE IF NOT EXISTS complaints (
  id                   TEXT PRIMARY KEY,
  resident_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_id              TEXT,
  unit_id              TEXT,
  issues               TEXT[] NOT NULL DEFAULT '{}',
  category             TEXT,
  priority             TEXT NOT NULL DEFAULT 'Low',
  notes                TEXT NOT NULL DEFAULT '',
  status               TEXT NOT NULL DEFAULT 'Submitted',
  reopen_requested     BOOLEAN,
  reopen_status        TEXT,
  photo_urls           TEXT[] NOT NULL DEFAULT '{}',
  estimated_completion DATE,
  actual_completion    DATE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Maintenance notes (was: complaints/{id}/maintenanceNotes/{noteId}).
CREATE TABLE IF NOT EXISTS maintenance_notes (
  id           TEXT PRIMARY KEY,
  complaint_id TEXT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  text         TEXT NOT NULL,
  author_id    TEXT,
  author_name  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Timeline events (was: complaints/{id}/timeline/{eventId}).
CREATE TABLE IF NOT EXISTS timeline_events (
  id           TEXT PRIMARY KEY,
  complaint_id TEXT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  action       TEXT NOT NULL DEFAULT 'Update',
  description  TEXT NOT NULL DEFAULT '',
  author_id    TEXT,
  author_name  TEXT,
  author_role  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Room announcements (was: unitAnnouncements/{announcementId}).
CREATE TABLE IF NOT EXISTS unit_announcements (
  id          TEXT PRIMARY KEY,
  room_id     TEXT NOT NULL,
  message     TEXT NOT NULL,
  author_name TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes matching firestore.indexes.json + common lookups.
CREATE INDEX IF NOT EXISTS idx_units_occupied_room ON units (occupied, room_id);
CREATE INDEX IF NOT EXISTS idx_units_resident ON units (resident_id);
CREATE INDEX IF NOT EXISTS idx_complaints_resident_created ON complaints (resident_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_complaints_status_created ON complaints (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_room_created ON unit_announcements (room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_complaint_created ON maintenance_notes (complaint_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_timeline_complaint_created ON timeline_events (complaint_id, created_at ASC);