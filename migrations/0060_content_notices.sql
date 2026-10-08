-- Public notice-and-action channel; apply manually using the deployment's
-- existing migration procedure. Idempotent; no generated journal changes.
BEGIN;
CREATE TABLE IF NOT EXISTS content_notices (
  reference text PRIMARY KEY,
  tracking_token_hash text NOT NULL CHECK (tracking_token_hash ~ '^[a-f0-9]{64}$'),
  content_url text NOT NULL CHECK (length(content_url) BETWEEN 1 AND 2048 AND content_url LIKE '/%'),
  name text CHECK (name IS NULL OR length(name) BETWEEN 1 AND 200),
  email text CHECK (email IS NULL OR length(email) BETWEEN 3 AND 254),
  explanation text NOT NULL CHECK (length(explanation) BETWEEN 20 AND 12000),
  category text NOT NULL DEFAULT 'illegal_content' CHECK (category IN ('illegal_content', 'child_safety')),
  locale text NOT NULL DEFAULT 'el' CHECK (locale IN ('el', 'en')),
  good_faith boolean NOT NULL CHECK (good_faith),
  related_reference text,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'under_review', 'decided')),
  outcome text CHECK (outcome IN ('no_action', 'action_taken', 'more_information')),
  reason text CHECK (reason IS NULL OR length(reason) BETWEEN 20 AND 8000),
  basis text CHECK (basis IS NULL OR length(basis) BETWEEN 3 AND 4000),
  measure text CHECK (measure IS NULL OR length(measure) BETWEEN 1 AND 4000),
  affected_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by integer REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  email_status text NOT NULL DEFAULT 'unavailable' CHECK (email_status IN ('sent', 'unavailable', 'failed')),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CHECK (category = 'child_safety' OR (name IS NOT NULL AND email IS NOT NULL)),
  CHECK (status <> 'decided' OR (outcome IS NOT NULL AND reason IS NOT NULL AND basis IS NOT NULL AND decided_at IS NOT NULL)),
  CHECK (outcome IS DISTINCT FROM 'action_taken' OR (measure IS NOT NULL AND length(measure) >= 10))
);
CREATE INDEX IF NOT EXISTS content_notices_pending_idx ON content_notices(status, created_at);
CREATE TABLE IF NOT EXISTS content_notice_events (
  id serial PRIMARY KEY,
  notice_reference text NOT NULL REFERENCES content_notices(reference),
  event text NOT NULL,
  actor_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS content_notice_events_reference_idx ON content_notice_events(notice_reference, id);
CREATE TABLE IF NOT EXISTS content_notice_emails (
  id serial PRIMARY KEY,
  notice_reference text NOT NULL REFERENCES content_notices(reference),
  kind text NOT NULL CHECK (kind IN ('acknowledgement', 'decision', 'affected_user')),
  recipient_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'unavailable', 'failed')),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS content_notice_emails_reference_idx ON content_notice_emails(notice_reference, id);
COMMIT;
