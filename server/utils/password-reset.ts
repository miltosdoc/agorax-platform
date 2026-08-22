/**
 * Password-reset token rules, with no database and no Express in sight.
 *
 * The decisions that matter to security — how much entropy a token carries,
 * what is stored, how long it lives, and when it stops working — are all
 * here as pure functions, so they can be tested directly rather than
 * inferred from the shape of a route handler.
 */

import { createHash, randomBytes } from 'node:crypto';

/**
 * A self-service link is mailed to whatever address is on the account, so its
 * window is short: long enough to walk to a laptop, not long enough for a
 * message sitting in a synced inbox to stay useful.
 */
export const SELF_RESET_TTL_MINUTES = 30;
export const SELF_RESET_TTL_MS = SELF_RESET_TTL_MINUTES * 60_000;

/**
 * An admin-issued link is handed over out of band — the route for a member
 * who has lost the address itself — and needs to survive a phone call and a
 * time zone.
 */
export const ADMIN_RESET_TTL_MS = 24 * 60 * 60_000;

/** Ceilings for the self-service request endpoint, per hour. */
export const RESET_REQUESTS_PER_IP_PER_HOUR = 5;
export const RESET_REQUESTS_PER_EMAIL_PER_HOUR = 3;

/**
 * 32 bytes from the CSPRNG, base64url-encoded.
 *
 * Not a UUID: a v4 UUID carries 122 bits with six of them fixed by the
 * format, and its generator is not required to be cryptographic. This is 256
 * bits from randomBytes, which is.
 */
export const RESET_TOKEN_BYTES = 32;

export function generateResetToken(): { token: string; tokenHash: string } {
  const token = randomBytes(RESET_TOKEN_BYTES).toString('base64url');
  return { token, tokenHash: hashResetToken(token) };
}

/**
 * Only this ever reaches the database. Someone reading a backup, a replica,
 * or a stolen dump holds hashes, not working links.
 */
export function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface ResetTokenRow {
  usedAt: Date | string | null;
  expiresAt: Date | string;
}

/**
 * Is this row still good for one password change?
 *
 * Three ways to be dead and they are all the same answer to the caller —
 * "used", "expired" and "never existed" must be indistinguishable from
 * outside, or the endpoint becomes an oracle for which links were real.
 */
export function isResetTokenLive(
  row: ResetTokenRow | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!row) return false;
  if (row.usedAt) return false;
  return new Date(row.expiresAt).getTime() > now.getTime();
}
