-- Migration 0006: LLM validation results
-- Created: 2026-04-27
--
-- Stores the structured output of `validateProposal` (per-criterion details,
-- routing category, score, feedback). The proposals table keeps the latest
-- llmScore/llmFeedback for fast list rendering; full history (one row per
-- validation round) lives here so revalidation does not destroy prior context.

CREATE TABLE IF NOT EXISTS "validation_results" (
  "id" serial PRIMARY KEY NOT NULL,
  "proposal_id" integer NOT NULL REFERENCES "proposals"("id") ON DELETE CASCADE,
  "score" integer NOT NULL,
  "feedback" text,
  "details" jsonb,
  "category" text NOT NULL,
  "validated_at" timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "validation_results_proposal_id_idx"
  ON "validation_results" ("proposal_id");
