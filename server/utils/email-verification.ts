/**
 * Email-verification token rules — pure, no database, no Express.
 *
 * Deliberately a sibling of password-reset.ts rather than a reuse of it. The
 * two look alike but answer different questions: a reset token grants control
 * of an account and must be short-lived and single-use; a verification token
 * only asserts "this mailbox exists and someone reads it". Folding them
 * together would mean one TTL serving two threat models, and the safe TTL for
 * a reset is a hostile one for a confirmation people open the next morning.
 */

import { createHash, randomBytes } from 'node:crypto';

/**
 * A week. A confirmation link is not a credential — the worst an attacker
 * gains by replaying one is marking an address they already control as
 * verified. The real cost of a short window is people who open mail on
 * Monday having to ask for another link, and every one of those is a member
 * who nearly gave up on registering.
 */
export const VERIFICATION_TTL_HOURS = 7 * 24;
export const VERIFICATION_TTL_MS = VERIFICATION_TTL_HOURS * 60 * 60_000;

/** How many fresh links one account may ask for per hour. */
export const VERIFICATION_RESENDS_PER_HOUR = 3;

export const VERIFICATION_TOKEN_BYTES = 32;

export function generateVerificationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(VERIFICATION_TOKEN_BYTES).toString('base64url');
  return { token, tokenHash: hashVerificationToken(token) };
}

export function hashVerificationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface VerificationTokenRow {
  usedAt: Date | string | null;
  expiresAt: Date | string;
  /** The address this link was issued for. */
  email: string;
}

/**
 * Is this link still good, *for this account's current address*?
 *
 * The address check is the part that is easy to leave out. Without it, a
 * member who registers with a typo, corrects it, and then clicks the link
 * from the first message marks the corrected address verified — having never
 * proved they can read it. The token proves control of one mailbox, not of
 * the account, so it dies when the mailbox it names is no longer the one on
 * file.
 */
export function isVerificationTokenLive(
  row: VerificationTokenRow | null | undefined,
  currentEmail: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!row) return false;
  if (row.usedAt) return false;
  if (new Date(row.expiresAt).getTime() <= now.getTime()) return false;
  if (!currentEmail) return false;
  return row.email.trim().toLowerCase() === currentEmail.trim().toLowerCase();
}
