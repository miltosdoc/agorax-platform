-- Migration 0027: LiveKit conference rooms
--
-- Two flavours of real-time room, gated by `kind`:
--   • 'community'  — open to every member of community_id; only admins can
--                    schedule/close. sortition_body_id is null.
--   • 'sortition'  — restricted to members of sortition_body_id. Auto-closed
--                    when the body completes. community_id mirrors the body's
--                    parent community for filtering.
--
-- room_name is the LiveKit-side identifier. We generate it server-side and
-- keep it unique so a join token always resolves to one row. recording_path
-- is relative to AGORAX_MEDIA_DIR (matches the proposal-media convention).

BEGIN;

CREATE TABLE "livekit_rooms" (
  "id"                 serial PRIMARY KEY,
  "room_name"          text NOT NULL UNIQUE,
  "kind"               text NOT NULL,
  "title"              text NOT NULL,
  "community_id"       integer NOT NULL REFERENCES "communities"("id") ON DELETE CASCADE,
  "sortition_body_id"  integer REFERENCES "sortition_bodies"("id") ON DELETE CASCADE,
  "created_by_id"      integer NOT NULL REFERENCES "users"("id"),
  "scheduled_at"       timestamp,
  "status"             text NOT NULL DEFAULT 'active',
  "recording_enabled"  boolean NOT NULL DEFAULT false,
  "recording_path"     text,
  "created_at"         timestamp NOT NULL DEFAULT now(),
  "closed_at"          timestamp,

  CONSTRAINT livekit_rooms_kind_check CHECK ("kind" IN ('community', 'sortition')),
  CONSTRAINT livekit_rooms_status_check CHECK ("status" IN ('scheduled', 'active', 'closed')),
  CONSTRAINT livekit_rooms_sortition_consistency CHECK (
    ("kind" = 'sortition' AND "sortition_body_id" IS NOT NULL)
    OR ("kind" = 'community' AND "sortition_body_id" IS NULL)
  )
);

CREATE INDEX "livekit_rooms_community_idx"
  ON "livekit_rooms" ("community_id", "status");

-- At most one room per sortition body — re-using the body recreates the same
-- room row (idempotent on the server side).
CREATE UNIQUE INDEX "livekit_rooms_sortition_unique"
  ON "livekit_rooms" ("sortition_body_id")
  WHERE "sortition_body_id" IS NOT NULL;

COMMIT;
