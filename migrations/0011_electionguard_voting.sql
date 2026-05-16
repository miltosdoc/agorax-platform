-- Migration 0011: ElectionGuard verifiable voting tables
--
-- Backing store for the `electionguard` VotingBackend (@agorax/voting SDK).
-- Used only when VOTING_BACKEND=electionguard; the default hash-chain
-- backend does not touch these tables. Purely additive — safe to apply
-- alongside an existing hash-chain deployment.
--
-- One election per proposal, created lazily when the voting phase opens.
-- eg_elections.dev_guardian_secrets holds the trustee secret key shares
-- SERVER-SIDE — a development-only compromise (see electionguard-backend.ts).
-- Real vote privacy needs client-side encryption and off-server trustees.

BEGIN;

CREATE TABLE IF NOT EXISTS "eg_elections" (
  "id" serial PRIMARY KEY,
  "proposal_id" integer NOT NULL
    REFERENCES "proposals"("id") ON DELETE CASCADE,
  "threshold" integer NOT NULL,
  "guardian_count" integer NOT NULL,
  "joint_public_key" text NOT NULL,
  "guardian_commitments" jsonb NOT NULL,
  "dev_guardian_secrets" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'open',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "closed_at" timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS "eg_elections_proposal_id_unique"
  ON "eg_elections" ("proposal_id");

CREATE TABLE IF NOT EXISTS "eg_ballots" (
  "id" serial PRIMARY KEY,
  "election_id" integer NOT NULL
    REFERENCES "eg_elections"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL
    REFERENCES "users"("id"),
  "ciphertext_ballot" jsonb NOT NULL,
  "cast_at" timestamp NOT NULL DEFAULT now(),
  "superseded_by_id" integer
);

-- "Effective ballots" reads: one non-superseded ballot per user.
CREATE INDEX IF NOT EXISTS "eg_ballots_current_idx"
  ON "eg_ballots" ("election_id", "user_id")
  WHERE "superseded_by_id" IS NULL;

CREATE TABLE IF NOT EXISTS "eg_election_records" (
  "id" serial PRIMARY KEY,
  "election_id" integer NOT NULL
    REFERENCES "eg_elections"("id") ON DELETE CASCADE,
  "record" jsonb NOT NULL,
  "tally" jsonb NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "eg_election_records_election_id_unique"
  ON "eg_election_records" ("election_id");

COMMIT;
