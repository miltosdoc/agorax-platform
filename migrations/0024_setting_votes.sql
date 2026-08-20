-- Migration 0024: Liquid settings votes for autonomous communities
--
-- Each member of an autonomous community can cast a per-setting vote at any
-- time and change it freely. The community's setting is whatever value is
-- currently winning by plurality. Ties keep the existing value.

BEGIN;

CREATE TABLE "community_setting_votes" (
  "id" serial PRIMARY KEY,
  "community_id" integer NOT NULL REFERENCES "communities"("id") ON DELETE CASCADE,
  "setting_key" text NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "choice_value" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "community_setting_votes_unique"
  ON "community_setting_votes" ("community_id", "setting_key", "user_id");

CREATE INDEX "community_setting_votes_lookup"
  ON "community_setting_votes" ("community_id", "setting_key");

COMMIT;
