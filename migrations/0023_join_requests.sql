-- Migration 0023: Apply-to-join flow
--
-- Adds:
--   * communities.join_policy — 'open' (current behaviour) | 'approval' | 'invite_only'
--   * community_join_requests — pending applications when join_policy = 'approval'
--
-- A single pending request per (community, user) is enforced by a partial
-- unique index. Approved/rejected requests are kept as an audit trail.

BEGIN;

ALTER TABLE "communities"
  ADD COLUMN "join_policy" text NOT NULL DEFAULT 'open';

CREATE TABLE "community_join_requests" (
  "id" serial PRIMARY KEY,
  "community_id" integer NOT NULL REFERENCES "communities"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "message" text,
  "status" text NOT NULL DEFAULT 'pending',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "decided_at" timestamp,
  "decided_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX "community_join_requests_one_pending"
  ON "community_join_requests" ("community_id", "user_id")
  WHERE "status" = 'pending';

CREATE INDEX "community_join_requests_by_community"
  ON "community_join_requests" ("community_id", "status");

COMMIT;
