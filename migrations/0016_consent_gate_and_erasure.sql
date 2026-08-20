-- Migration 0016: Consent gate flag + Art. 17 erasure-request log
--
-- Two related changes:
--
-- 1. users.requires_consent — boolean gate read by the requireConsent
--    middleware. Default TRUE so that any newly created user (Google
--    OAuth, future provider, manual insert) is locked out of Article 9
--    actions until they accept the canonical privacy text via
--    POST /api/user/consent/accept. Local /api/register sets it FALSE
--    explicitly after recordConsent succeeds in the same transaction.
--
--    Backfill: every existing row is set to TRUE — those members signed
--    up before the consent-logging system existed (closed the gap in
--    migration 0015) and must re-consent to be considered consented
--    under the new framework.
--
-- 2. erasure_requests — pending Art. 17 right-to-be-forgotten requests.
--    The brief permits manual processing at the ≤1000-member scale, so
--    this is a queue an admin works, not an auto-executing path. The
--    hash-chain-vs-erasure tension is documented in INTERNAL_POLICIES.md
--    (pending).

BEGIN;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "requires_consent" boolean NOT NULL DEFAULT true;

-- Existing members predate the consent-logging gate — re-consent required.
UPDATE "users" SET "requires_consent" = true WHERE "requires_consent" IS DISTINCT FROM true;

CREATE TABLE IF NOT EXISTS "erasure_requests" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL
    REFERENCES "users"("id") ON DELETE CASCADE,
  "reason" text,
  "requested_at" timestamp NOT NULL DEFAULT now(),
  "processed_at" timestamp,
  "processed_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "notes" text
);

CREATE INDEX IF NOT EXISTS "erasure_requests_pending_idx"
  ON "erasure_requests" ("requested_at")
  WHERE "processed_at" IS NULL;

COMMIT;
