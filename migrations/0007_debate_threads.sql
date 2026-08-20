-- Migration 0007: Debate threads + per-user thread votes
-- Created: 2026-04-27
--
-- Adds a real-time threaded discussion surface for proposals during the
-- deliberation phase. `parent_id` is a self-referential FK so threads form a
-- tree (top-level when null, reply otherwise). The denormalized
-- upvote/downvote counters on the thread row are kept in sync by the
-- application layer alongside debate_votes inserts/updates.

CREATE TABLE IF NOT EXISTS "debate_threads" (
  "id" serial PRIMARY KEY NOT NULL,
  "proposal_id" integer NOT NULL REFERENCES "proposals"("id") ON DELETE CASCADE,
  "author_id" integer NOT NULL REFERENCES "users"("id"),
  "parent_id" integer REFERENCES "debate_threads"("id") ON DELETE CASCADE,
  "content" text NOT NULL,
  "upvotes" integer DEFAULT 0,
  "downvotes" integer DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT NOW(),
  "updated_at" timestamp DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "debate_threads_proposal_id_idx"
  ON "debate_threads" ("proposal_id");

CREATE INDEX IF NOT EXISTS "debate_threads_parent_id_idx"
  ON "debate_threads" ("parent_id");

CREATE TABLE IF NOT EXISTS "debate_votes" (
  "id" serial PRIMARY KEY NOT NULL,
  "thread_id" integer NOT NULL REFERENCES "debate_threads"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id"),
  "direction" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "debate_vote_unique"
  ON "debate_votes" ("thread_id", "user_id");
