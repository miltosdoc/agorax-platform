-- Migration 0019: Democracy Points crypto-shred columns
--
-- Mirrors migration 0017 for the points ledger so Art. 17 erasure can
-- pseudonymise a member's points history without breaking append-only
-- accounting (the ledger and treasury reconciliation depend on the
-- transaction rows surviving — only the user binding goes away).
--
-- Schema:
--   point_transactions.user_id  → nullable (NULL = erased)
--   point_balances.user_id      → primary key + nullable would conflict;
--                                  we DELETE the balance row on erasure
--                                  instead (a projection, not history).
--   point_redemptions.user_id   → nullable (NULL = erased)
--
-- treasury_ledger has no user_id and is untouched.

BEGIN;

ALTER TABLE "point_transactions"
  ALTER COLUMN "user_id" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "point_transactions_erased_idx"
  ON "point_transactions" ("user_id")
  WHERE "user_id" IS NULL;

ALTER TABLE "point_redemptions"
  ALTER COLUMN "user_id" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "point_redemptions_erased_idx"
  ON "point_redemptions" ("user_id")
  WHERE "user_id" IS NULL;

COMMIT;
