-- Migration 0021: Anonymous voting via blind-signed tokens
--
-- Closes the malicious-operator anonymity gap left open in
-- docs/compliance/01_VOTE_LINKAGE_AUDIT.md (Option B) and designed in
-- docs/compliance/04_ANONYMOUS_VOTING_DESIGN.md.
--
-- After this migration:
--   * Proposals carry a voting_mode flag: 'anonymous' (default) or 'pseudonymous'.
--   * Anonymous-mode vote rows hold a vote_token (unblinded by the voter on
--     the client) instead of a user_id; the (member → choice) link does not
--     exist in any single table.
--   * The hash chain is recomputed over vote_token for anonymous rows.
--   * One RSA keypair per proposal lives in blind_sig_keys; the private
--     exponent is AES-GCM encrypted using a key derived from a server-only
--     SIGNING_MASTER_KEY env var. After close the encrypted row can be
--     deleted for forward secrecy on the signing capability.
--   * blind_sig_issuance is the one-per-user-per-proposal record that the
--     operator MUST see (otherwise one-person-one-vote can't be enforced),
--     but it contains NO information about the unblinded token or choice.

BEGIN;

-- Per-proposal RSA keypair store.
CREATE TABLE IF NOT EXISTS "blind_sig_keys" (
  "proposal_id" integer PRIMARY KEY
    REFERENCES "proposals"("id") ON DELETE CASCADE,
  "public_n" text NOT NULL,
  "public_e" text NOT NULL,
  "secret_d_ciphertext" text NOT NULL,
  "secret_d_iv" text NOT NULL,
  "secret_d_tag" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- Issuance ledger: who got A blind signature for which proposal. No token.
CREATE TABLE IF NOT EXISTS "blind_sig_issuance" (
  "id" serial PRIMARY KEY,
  "proposal_id" integer NOT NULL
    REFERENCES "proposals"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL
    REFERENCES "users"("id") ON DELETE CASCADE,
  "issued_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "blind_sig_issuance_unique"
  ON "blind_sig_issuance" ("proposal_id", "user_id");

-- Proposal mode flag. Default 'anonymous' so any new proposal gets the
-- protection by default; the legacy data migration (0022) re-tags existing
-- rows to 'anonymous' too.
ALTER TABLE "proposals"
  ADD COLUMN IF NOT EXISTS "voting_mode" text NOT NULL DEFAULT 'anonymous';

-- Vote row gains a token field + its own mode marker. user_id stays
-- nullable from migration 0017; for anonymous rows it is NULL and
-- vote_token is set.
ALTER TABLE "proposal_votes"
  ADD COLUMN IF NOT EXISTS "vote_token" text,
  ADD COLUMN IF NOT EXISTS "voting_mode" text NOT NULL DEFAULT 'pseudonymous';

-- One token can be used at most once per proposal — this is the DB-level
-- double-spend guard.
CREATE UNIQUE INDEX IF NOT EXISTS "proposal_votes_token_unique"
  ON "proposal_votes" ("proposal_id", "vote_token")
  WHERE "vote_token" IS NOT NULL;

COMMIT;
