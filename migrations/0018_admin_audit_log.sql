-- Migration 0018: Admin audit log
--
-- Implements the control documented in
-- docs/compliance/INTERNAL_POLICIES.md §1.2: "every join across
-- proposal_votes and users performed manually (not via the application)
-- must be logged ... this is THE control that turns 'the host can read
-- votes' into 'we know when they did and why.'"
--
-- The application-level subset (admin actions that hit the privileged
-- endpoints) is logged automatically. DB-direct joins by an admin with
-- psql access are out of scope for this table — those rely on Postgres
-- audit extensions / pg_stat_statements / log review at the hosting
-- layer.

BEGIN;

CREATE TABLE IF NOT EXISTS "admin_audit_log" (
  "id" serial PRIMARY KEY,
  "admin_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "action" text NOT NULL,
  "target_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "target_resource" text,
  "details" jsonb,
  "request_id" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "admin_audit_log_admin_idx"
  ON "admin_audit_log" ("admin_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "admin_audit_log_target_idx"
  ON "admin_audit_log" ("target_user_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "admin_audit_log_action_idx"
  ON "admin_audit_log" ("action", "created_at" DESC);

COMMIT;
