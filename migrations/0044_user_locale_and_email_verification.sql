-- 0044_user_locale_and_email_verification
--
-- Two things a platform that sends email needs and this one did not have:
-- a language to send in, and proof that the address is real.
--
-- ── Language ────────────────────────────────────────────────────────────────
-- Until now the only recorded signal of a member's language was the locale
-- they happened to accept the consent text in, which is a legal artefact and
-- not a preference — someone who read the Greek terms once is not thereby a
-- Greek reader forever. `locale` is the preference, set from the interface
-- language at registration and updated whenever the member switches it.
--
-- Default 'el': the platform is Greek-first, and every existing row predates
-- the column, so Greek is the honest guess rather than a silent English one.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'el';

-- ── Email verification ──────────────────────────────────────────────────────
-- NULL means unverified. Every account that existed before this migration is
-- therefore unverified, which is the truth: nobody ever proved those
-- addresses. They are mailed a confirmation link once, rather than being
-- quietly marked verified on the strength of having registered.
--
-- Nothing is gated on this column by this migration. Locking out every
-- existing member on the day it ships would be a worse failure than an
-- unconfirmed address; the column records the fact and the admin page shows
-- it, and any gating is a separate, deliberate decision.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS users_email_verified_idx
  ON users(email_verified_at);

-- Same construction as password_reset_tokens: only the SHA-256 is stored, so
-- a database reader cannot replay an outstanding link.
--
-- `email` records which address the link was issued for. A member who changes
-- their address before clicking must not be able to use the old link to mark
-- the new one verified — the token proves control of one specific mailbox,
-- not of the account.
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_verification_tokens_user_idx
  ON email_verification_tokens(user_id);

CREATE INDEX IF NOT EXISTS email_verification_tokens_expires_idx
  ON email_verification_tokens(expires_at);

COMMENT ON COLUMN users.locale IS
  'Interface and email language: el | en. Set at registration, changed by the member.';
COMMENT ON COLUMN users.email_verified_at IS
  'When the member proved control of their address. NULL = never verified.';
