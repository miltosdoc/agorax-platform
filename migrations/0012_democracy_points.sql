-- Migration 0012: Democracy Points (civic-participation credit)
--
-- An append-only ledger recording civic contribution. Points are NOT a token
-- and carry no monetary value until the platform reaches a revenue phase
-- (platform_settings key `economy.phase`, default 'pre_revenue'). Redemption
-- is gated on that phase AND on identity verification. Purely additive.

BEGIN;

CREATE TABLE IF NOT EXISTS "point_transactions" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "points" integer NOT NULL,
  "action_key" text NOT NULL,
  "ref_type" text NOT NULL DEFAULT '',
  "ref_id" integer NOT NULL DEFAULT 0,
  "note" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- One award per (user, action, target) — makes point awards idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS "point_transactions_idempotency"
  ON "point_transactions" ("user_id", "action_key", "ref_type", "ref_id");

CREATE INDEX IF NOT EXISTS "point_transactions_user_idx"
  ON "point_transactions" ("user_id");

CREATE TABLE IF NOT EXISTS "point_balances" (
  "user_id" integer PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "balance" integer NOT NULL DEFAULT 0,
  "lifetime_earned" integer NOT NULL DEFAULT 0,
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "point_redemptions" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "points" integer NOT NULL,
  "eur_amount" numeric NOT NULL,
  "target_currency" text NOT NULL DEFAULT 'EUR',
  "status" text NOT NULL DEFAULT 'requested',
  "note" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "decided_at" timestamp
);

CREATE TABLE IF NOT EXISTS "treasury_ledger" (
  "id" serial PRIMARY KEY,
  "entry_type" text NOT NULL,
  "eur_amount" numeric NOT NULL,
  "ref_type" text NOT NULL DEFAULT '',
  "ref_id" integer,
  "note" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

COMMIT;
