-- Migration 0028: Web Push subscriptions
--
-- One row per (user, browser). The browser issues a subscription via the
-- Push API at opt-in time; the server stores the endpoint + the encryption
-- keys so the web-push library can POST an encrypted payload when an event
-- fires. Endpoint is unique because each browser instance has exactly one.

BEGIN;

CREATE TABLE "push_subscriptions" (
  "id"           serial PRIMARY KEY,
  "user_id"      integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "endpoint"     text NOT NULL UNIQUE,
  "p256dh"       text NOT NULL,
  "auth"         text NOT NULL,
  "user_agent"   text,
  "created_at"   timestamp NOT NULL DEFAULT now(),
  "last_used_at" timestamp
);

CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" ("user_id");

COMMIT;
