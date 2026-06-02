-- Migration 0029: LiveKit participation log
--
-- One row per (room, user) join. Server inserts at token-issue time,
-- the client beacons left_at on disconnect. Same user joining twice
-- produces two rows — honest record of the call.

BEGIN;

CREATE TABLE "livekit_participations" (
  "id"        serial PRIMARY KEY,
  "room_id"   integer NOT NULL REFERENCES "livekit_rooms"("id") ON DELETE CASCADE,
  "user_id"   integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "joined_at" timestamp NOT NULL DEFAULT now(),
  "left_at"   timestamp
);

CREATE INDEX "livekit_participations_room_idx" ON "livekit_participations" ("room_id");
CREATE INDEX "livekit_participations_user_idx" ON "livekit_participations" ("user_id");

COMMIT;
