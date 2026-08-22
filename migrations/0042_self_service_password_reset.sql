-- 0042_self_service_password_reset
-- Turns the admin-only reset of 0040 into a self-service "forgot my password".
--
-- 0040 shipped when there was no mail service on this deployment: an admin
-- minted a link and handed it over out of band. Scaleway Transactional Email
-- now sends it, so the member asks for it themselves and issued_by_id has no
-- admin to point at. It becomes nullable — NULL means "the member asked",
-- a user id still means "an admin minted it", and the audit trail keeps both
-- apart without a second table.
--
-- The token itself is unchanged: only the SHA-256 is stored, so a database
-- reader cannot replay an outstanding link.

ALTER TABLE password_reset_tokens
  ALTER COLUMN issued_by_id DROP NOT NULL;

-- Which address the request came from, for abuse investigation. The token
-- row is deleted on cleanup, so this is not a long-lived IP log.
ALTER TABLE password_reset_tokens
  ADD COLUMN IF NOT EXISTS requested_ip TEXT;

-- Self-service links expire in 30 minutes, admin-issued ones in 24 hours,
-- so the cleanup sweep scans by expiry rather than by age.
CREATE INDEX IF NOT EXISTS password_reset_tokens_expires_idx
  ON password_reset_tokens(expires_at);

-- Per-account rate limiting. The IP limiter alone cannot stop someone
-- pointing a botnet at one address, and the response is deliberately
-- identical whether or not the account exists — so the counter has to key
-- on the address that was typed, existing account or not.
--
-- That address is stored as an HMAC, never in the clear: this table would
-- otherwise become a list of every email anyone ever typed into the form,
-- including addresses that have no account here. The key is derived from
-- SIGNING_MASTER_KEY, so the rows are not reversible with the database alone.
CREATE TABLE IF NOT EXISTS password_reset_requests (
  id SERIAL PRIMARY KEY,
  email_hmac TEXT NOT NULL,
  ip_hmac TEXT,
  requested_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS password_reset_requests_email_idx
  ON password_reset_requests(email_hmac, requested_at);

CREATE INDEX IF NOT EXISTS password_reset_requests_ip_idx
  ON password_reset_requests(ip_hmac, requested_at);

COMMENT ON TABLE password_reset_requests IS
  'Rate-limit counters for self-service password reset. Addresses are HMACed, never stored in the clear.';
