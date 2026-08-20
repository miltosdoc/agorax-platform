-- Migration 0025: reset conflated-failure verification rows
--
-- An earlier path in server/routers/users.ts wrote the literal string
-- 'hash-missing' into users.govgr_voter_hash whenever AFM extraction
-- silently failed on an otherwise-successful ballot-service response.
-- Those rows carry govgr_verified=true but their voter_hash does not
-- anchor to any real AFM, so they should be re-verified.
--
-- Fix d87a769 stopped writing the sentinel. This migration:
--   1. resets every row whose govgr_voter_hash is non-NULL but not a
--      proper SHA-256 hex digest, so the affected users re-verify
--      through the hardened flow;
--   2. installs CHECK constraints on voter_hash and doc_code_hash that
--      hard-fail any future regression that tries to write a non-hex
--      value at the database level.
--
-- Anti-replay: clearing govgr_doc_code_hash on these rows is safe —
-- the affected users can re-upload the same declaration and the
-- updated extractor will compute the same hash off the same code, so
-- the duplicate-file check still works against any *other* account.

BEGIN;

UPDATE "users"
SET
  "govgr_verified"      = false,
  "govgr_verified_at"   = NULL,
  "govgr_voter_hash"    = NULL,
  "govgr_doc_code_hash" = NULL,
  "govgr_first_name"    = NULL,
  "govgr_last_name"     = NULL,
  "govgr_municipality"  = NULL,
  "govgr_postcode"      = NULL
WHERE
  "govgr_voter_hash" IS NOT NULL
  AND "govgr_voter_hash" !~ '^[a-f0-9]{64}$';

ALTER TABLE "users"
  ADD CONSTRAINT "users_govgr_voter_hash_hex"
  CHECK ("govgr_voter_hash" IS NULL OR "govgr_voter_hash" ~ '^[a-f0-9]{64}$');

ALTER TABLE "users"
  ADD CONSTRAINT "users_govgr_doc_code_hash_hex"
  CHECK ("govgr_doc_code_hash" IS NULL OR "govgr_doc_code_hash" ~ '^[a-f0-9]{64}$');

COMMIT;
