-- 0043_email_notification_prefs
-- Per-member control over which optional emails AgoraX may send.
--
-- Categories live in a jsonb map rather than one boolean column each. The
-- in-app preferences of 0003b took the column-per-type route and every new
-- notification type since (conference_scheduled, sortition_room_opened,
-- new_media, community_invite…) shipped with no preference at all, because
-- adding one meant a migration nobody wrote. A map means a new category is
-- a constant in shared/email-categories.ts and nothing else.
--
-- An absent key means "not yet decided" and falls back to the category's
-- default — so adding a category does not silently opt existing members
-- either in or out behind their back; the default is declared in code.
--
-- Security mail (password reset, password changed, email changed) is not
-- represented here at all. It is not optional and must not be switchable:
-- there is no key that can turn it off.

CREATE TABLE IF NOT EXISTS email_notification_prefs (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

  -- The master switch. False means no optional email of any kind, whatever
  -- the per-category map says.
  master_enabled BOOLEAN NOT NULL DEFAULT TRUE,

  -- { "<category key>": true | false }
  categories JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Opaque per-member subject for the signed unsubscribe link. Carries no
  -- user id and no address, so the link in an email cannot be read back into
  -- an identity. Rotating this value invalidates every link already sent.
  unsubscribe_id TEXT NOT NULL UNIQUE,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Send-time de-duplication. The job worker retries a failed job, and the
-- notification fan-outs run on timers that can overlap; without a uniqueness
-- claim taken *before* the SMTP call, one proposal can mail the same member
-- twice. The key is derived from (user, template, subject) by the caller.
CREATE TABLE IF NOT EXISTS email_deliveries (
  id SERIAL PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  template TEXT NOT NULL,
  -- 'queued' → 'sent' | 'failed' | 'suppressed'
  -- 'suppressed' records that preferences said no at send time, so a
  -- retry does not re-evaluate and mail someone who opted out.
  status TEXT NOT NULL DEFAULT 'queued',
  error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS email_deliveries_created_idx
  ON email_deliveries(created_at);

CREATE INDEX IF NOT EXISTS email_deliveries_user_idx
  ON email_deliveries(user_id);

COMMENT ON TABLE email_notification_prefs IS
  'Per-member opt-in for optional email. Security mail is deliberately not representable here.';
COMMENT ON TABLE email_deliveries IS
  'Idempotency ledger for outbound email — one row claimed before the SMTP call.';
