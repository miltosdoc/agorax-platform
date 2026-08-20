-- Migration 0004: Proposal final ratification votes
-- Created: 2026-04-26
--
-- Introduces proposal_votes, the dedicated table for final binding ratification
-- votes cast during the `voting` lifecycle phase. Distinct from proposal_support,
-- which represents informal support/oppose during deliberation.
--
-- Constraints:
--   - one row per (proposal_id, user_id)
--   - choice ∈ {'yes','no','abstain'}; abstain counts toward participation only

CREATE TABLE IF NOT EXISTS "proposal_votes" (
  "id" serial PRIMARY KEY,
  "proposal_id" integer NOT NULL REFERENCES "proposals"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id"),
  "choice" text NOT NULL,
  "weight" numeric NOT NULL DEFAULT 1,
  "cast_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "proposal_votes_choice_check" CHECK ("choice" IN ('yes','no','abstain'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "proposal_vote_unique"
  ON "proposal_votes" ("proposal_id", "user_id");

CREATE INDEX IF NOT EXISTS "proposal_votes_proposal_idx"
  ON "proposal_votes" ("proposal_id");
