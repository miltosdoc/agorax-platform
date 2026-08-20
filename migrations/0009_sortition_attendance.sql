-- Migration 0009: Sortition attendance tracking
--
-- Stores attendance status for each sortition member (invited / accepted /
-- declined / no-show / completed) so the proposal author and the community
-- can see a confirmation rate before the citizen jury convenes.

CREATE TABLE IF NOT EXISTS "sortition_attendance" (
  "id" serial PRIMARY KEY NOT NULL,
  "body_id" integer NOT NULL REFERENCES "sortition_bodies"("id") ON DELETE CASCADE,
  "member_id" integer NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" text NOT NULL,
  "invited_at" timestamp NOT NULL,
  "responded_at" timestamp,
  "completed_at" timestamp,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "sortition_attendance_member_unique"
  ON "sortition_attendance" ("body_id", "member_id");

CREATE INDEX IF NOT EXISTS "sortition_attendance_user_idx"
  ON "sortition_attendance" ("user_id");
