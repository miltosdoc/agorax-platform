-- 0040_password_reset_tokens
-- Admin-issued single-use password reset.
--
-- There is no mail service on this deployment, so a self-service "forgot my
-- password" email flow cannot exist. Until one does, an admin mints a link
-- here and delivers it out of band. A member who forgot their password had
-- no route back into their account at all.
--
-- Only the SHA-256 of the token is stored, so a database reader cannot
-- replay an outstanding link — the same rule as panel tokens and claim codes.

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  issued_by_id INTEGER NOT NULL REFERENCES users(id),
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx
  ON password_reset_tokens(user_id);
