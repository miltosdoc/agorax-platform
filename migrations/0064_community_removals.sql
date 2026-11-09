-- 0064_community_removals
--
-- Removing members from a community (shared/member-removal.ts).
--
--   community_removals        — one row per removal. Blocks rejoining until
--                               rejoin_after (30-day cooldown) unless lifted.
--   community_removal_votes   — in an autonomous community nobody removes
--                               anyone alone: members vote, ⅔ of votes cast.
--   community_removal_ballots — one yes/no per eligible member per vote.
--
-- Safe to run twice.

CREATE TABLE IF NOT EXISTS "community_removal_votes" (
  "id" serial PRIMARY KEY,
  "community_id" integer NOT NULL REFERENCES "communities"("id") ON DELETE CASCADE,
  "target_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "opened_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "reason" text NOT NULL,
  "target_response" text,
  "status" text NOT NULL DEFAULT 'open',
  "yes_count" integer NOT NULL DEFAULT 0,
  "no_count" integer NOT NULL DEFAULT 0,
  "eligible_count" integer NOT NULL DEFAULT 0,
  "closes_at" timestamp NOT NULL,
  "decided_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);
-- At most one open vote per person per community.
CREATE UNIQUE INDEX IF NOT EXISTS "removal_vote_one_open"
  ON "community_removal_votes" ("community_id", "target_user_id") WHERE "status" = 'open';
CREATE INDEX IF NOT EXISTS "removal_vote_open_closes"
  ON "community_removal_votes" ("closes_at") WHERE "status" = 'open';

CREATE TABLE IF NOT EXISTS "community_removal_ballots" (
  "id" serial PRIMARY KEY,
  "vote_id" integer NOT NULL REFERENCES "community_removal_votes"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "choice" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "removal_ballot_unique"
  ON "community_removal_ballots" ("vote_id", "user_id");

CREATE TABLE IF NOT EXISTS "community_removals" (
  "id" serial PRIMARY KEY,
  "community_id" integer NOT NULL REFERENCES "communities"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "removed_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "vote_id" integer REFERENCES "community_removal_votes"("id") ON DELETE SET NULL,
  "reason" text NOT NULL,
  "rejoin_after" timestamp NOT NULL,
  "lifted_at" timestamp,
  "lifted_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "community_removals_lookup"
  ON "community_removals" ("community_id", "user_id");
