-- Migration 0017: Vote crypto-shred columns
--
-- Implements the resolution recorded in
-- docs/compliance/INTERNAL_POLICIES.md §2.4 for the
-- right-to-erasure-vs-append-only-hash-chain tension.
--
-- The design:
--
--   * proposal_votes.user_id becomes nullable. NULL is the stable
--     "erased" sentinel — no FK to users.id is involved at this row's
--     value after erasure.
--   * proposal_votes.erased_at records when the crypto-shred happened.
--   * The chain row_hash is NEVER recomputed at erasure time. It stays
--     opaque; the verifier (server/utils/vote-chain.ts) accepts it as-is
--     for erased rows and only checks prev_hash linkage. The chain
--     therefore remains intact across erased rows, exactly as designed.
--   * The choice column survives — the tally is preserved; only the
--     (member → choice) link is gone.
--
-- Same treatment for eg_ballots (electionguard backend).
--
-- Pre-close behaviour (documented lawful refusal under Art. 17(3)(d))
-- is enforced in application code, not at the schema level.

BEGIN;

ALTER TABLE "proposal_votes"
  ALTER COLUMN "user_id" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "erased_at" timestamp;

CREATE INDEX IF NOT EXISTS "proposal_votes_erased_idx"
  ON "proposal_votes" ("user_id")
  WHERE "erased_at" IS NOT NULL;

ALTER TABLE "eg_ballots"
  ALTER COLUMN "user_id" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "erased_at" timestamp;

CREATE INDEX IF NOT EXISTS "eg_ballots_erased_idx"
  ON "eg_ballots" ("user_id")
  WHERE "erased_at" IS NOT NULL;

COMMIT;
