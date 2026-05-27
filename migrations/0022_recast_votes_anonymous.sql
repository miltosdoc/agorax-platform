-- Migration 0022: Wipe legacy votes and re-arm for anonymous re-casting
--
-- Per controller decision (docs/compliance/04_ANONYMOUS_VOTING_DESIGN.md
-- §12 question 3): existing pseudonymous votes cannot be converted to
-- anonymous after the fact — the user_id is baked into every chain row
-- hash. The honest answer is to clear them and let members re-cast under
-- the new anonymous flow.
--
-- This is destructive. It is safe HERE because the dataset at the time of
-- this migration consists entirely of seed / demo data — verified before
-- this migration was written. DO NOT re-run on a database that holds real
-- deliberation results.
--
-- After this migration:
--   * proposal_votes is empty.
--   * eg_ballots is empty.
--   * Existing proposals in terminal states (decided, archived) are
--     reset to 'voting' so members can re-cast. Proposals still in
--     pre-vote states (draft, review, ...) are unaffected.
--   * All proposals carry voting_mode='anonymous' going forward.

BEGIN;

-- Drop the existing chain rows; the unique index on (proposal_id, vote_token)
-- WHERE vote_token IS NOT NULL is empty so this is fine. supersededById refs
-- inside the same table are gone with the rows themselves.
TRUNCATE TABLE "proposal_votes" RESTART IDENTITY CASCADE;
TRUNCATE TABLE "eg_ballots" RESTART IDENTITY CASCADE;
TRUNCATE TABLE "eg_election_records" RESTART IDENTITY CASCADE;
TRUNCATE TABLE "eg_elections" RESTART IDENTITY CASCADE;

-- Convert every existing proposal to anonymous mode for the re-cast.
UPDATE "proposals" SET "voting_mode" = 'anonymous';

-- Re-open proposals that had finalised; they were demo data and the new
-- privacy property requires fresh ballots anyway.
UPDATE "proposals"
SET "status" = 'voting'
WHERE "status" IN ('decided', 'archived');

COMMIT;
