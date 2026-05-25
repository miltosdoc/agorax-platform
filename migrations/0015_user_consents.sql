-- Migration 0015: User consent audit log (GDPR Art. 7 + Art. 9(2)(a))
--
-- Closes the consent-logging gap identified in
-- docs/compliance/03_OPERATIONAL_AUDITS.md §3. Without an audit trail,
-- the AMKE cannot evidence its Art. 9(2)(a) lawful basis for processing
-- members' political opinions (votes, deliberation contributions).
--
-- Design — append-only:
--   * One row per consent acceptance (member may accept multiple versions
--     over time as the privacy notice evolves).
--   * `withdrawn_at` records Art. 7(3) withdrawal in-place — we never
--     delete the acceptance row, since the historical "they did agree at
--     time T" fact remains true even after withdrawal.
--   * `consent_text_hash` lets us prove later *what exact text* the member
--     saw — defends against "you changed the policy after I agreed."

BEGIN;

CREATE TABLE IF NOT EXISTS "user_consents" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL
    REFERENCES "users"("id") ON DELETE CASCADE,
  "consent_version" text NOT NULL,
  "consent_text_hash" text NOT NULL,
  "locale" text NOT NULL,
  "accepted_at" timestamp NOT NULL DEFAULT now(),
  "withdrawn_at" timestamp
);

CREATE INDEX IF NOT EXISTS "user_consents_user_idx"
  ON "user_consents" ("user_id");

-- Fast lookup for "does this member have an active consent for version X?"
CREATE INDEX IF NOT EXISTS "user_consents_active_idx"
  ON "user_consents" ("user_id", "consent_version")
  WHERE "withdrawn_at" IS NULL;

COMMIT;
