-- Migration 0008: Community admin team + General flag + platform settings
-- Created: 2026-04-27
--
-- Splits autonomous vs managed communities by giving the row an explicit
-- admin list (jsonb of user ids) and a boolean flag for the singleton
-- "General" community (the catch-all where every new user is auto-enrolled).
-- Adds a platform_settings table so instance-wide defaults — sortition
-- size, validation model, similarity threshold — can be flipped via the
-- ordinary deliberation cycle in the General community.

ALTER TABLE "communities"
  ADD COLUMN IF NOT EXISTS "admin_ids" jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "is_general" boolean DEFAULT false;

-- Only one row should ever have is_general = true.
CREATE UNIQUE INDEX IF NOT EXISTS "communities_is_general_unique"
  ON "communities" ("is_general")
  WHERE "is_general" = true;

CREATE TABLE IF NOT EXISTS "platform_settings" (
  "id" serial PRIMARY KEY NOT NULL,
  "key" text NOT NULL UNIQUE,
  "value" text NOT NULL,
  "description" text,
  "last_changed_by" integer REFERENCES "users"("id"),
  "last_changed_at" timestamp DEFAULT NOW()
);
