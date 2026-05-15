-- Migration 0010: Tamper-evident vote hash chain
--
-- Converts proposal_votes from a one-row-per-(proposal,user) table into an
-- append-only ledger with a per-proposal SHA-256 hash chain. A user changing
-- their vote inserts a new row; the previous row's superseded_by_id is set
-- to the new row's id. Tallies and "my current vote" reads must filter
-- superseded_by_id IS NULL.
--
-- prev_hash of the first row in a chain is the genesis sentinel (64 zeros).
-- row_hash = sha256(prev_hash | proposal_id | user_id | choice | weight | cast_at_iso)
--
-- The application layer (server/utils/vote-chain.ts) computes hashes; this
-- migration backfills any pre-existing rows deterministically by id order so
-- the chain is valid on day one.

BEGIN;

ALTER TABLE "proposal_votes"
  ADD COLUMN IF NOT EXISTS "prev_hash" text,
  ADD COLUMN IF NOT EXISTS "row_hash" text,
  ADD COLUMN IF NOT EXISTS "superseded_by_id" integer
    REFERENCES "proposal_votes"("id") ON DELETE SET NULL;

-- Backfill: walk existing rows per proposal in id order, chaining hashes.
-- pgcrypto provides digest(); enable it if not already.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

WITH RECURSIVE ordered AS (
  SELECT
    id,
    proposal_id,
    user_id,
    choice,
    weight,
    cast_at,
    row_number() OVER (PARTITION BY proposal_id ORDER BY id) AS rn
  FROM proposal_votes
  WHERE row_hash IS NULL
),
chain AS (
  SELECT
    o.id,
    o.proposal_id,
    repeat('0', 64) AS prev_hash,
    encode(
      digest(
        repeat('0', 64) || '|' ||
        o.proposal_id::text || '|' ||
        o.user_id::text || '|' ||
        o.choice || '|' ||
        o.weight::text || '|' ||
        to_char(o.cast_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'sha256'
      ),
      'hex'
    ) AS row_hash,
    o.rn
  FROM ordered o
  WHERE o.rn = 1

  UNION ALL

  SELECT
    o.id,
    o.proposal_id,
    c.row_hash AS prev_hash,
    encode(
      digest(
        c.row_hash || '|' ||
        o.proposal_id::text || '|' ||
        o.user_id::text || '|' ||
        o.choice || '|' ||
        o.weight::text || '|' ||
        to_char(o.cast_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'sha256'
      ),
      'hex'
    ) AS row_hash,
    o.rn
  FROM ordered o
  JOIN chain c ON c.proposal_id = o.proposal_id AND c.rn + 1 = o.rn
)
UPDATE proposal_votes pv
SET prev_hash = c.prev_hash,
    row_hash = c.row_hash
FROM chain c
WHERE pv.id = c.id;

ALTER TABLE "proposal_votes"
  ALTER COLUMN "prev_hash" SET NOT NULL,
  ALTER COLUMN "row_hash" SET NOT NULL;

-- Drop the legacy unique constraint: a user may now have multiple rows
-- (one per amendment to their vote); only the row with superseded_by_id
-- IS NULL is current.
DROP INDEX IF EXISTS "proposal_vote_unique";

-- Useful index for chain walking and the head query.
CREATE UNIQUE INDEX IF NOT EXISTS "proposal_votes_proposal_id_idx"
  ON "proposal_votes" ("proposal_id", "id");

-- Speed up "my current vote" reads.
CREATE INDEX IF NOT EXISTS "proposal_votes_current_idx"
  ON "proposal_votes" ("proposal_id", "user_id")
  WHERE "superseded_by_id" IS NULL;

COMMIT;
