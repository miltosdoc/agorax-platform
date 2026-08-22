/**
 * Keyed values that travel inside emails, and the key they hang off.
 *
 * Deliberately free of any database import: these are pure functions over a
 * secret, so they can be reasoned about — and tested — without a Postgres
 * connection anywhere in the picture.
 */

import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';

// ─── Keying ─────────────────────────────────────────────────────────────────

/**
 * All mail-related MACs hang off SIGNING_MASTER_KEY, the same root the
 * blind-signature and panel vaults use, with a distinct HKDF info string per
 * purpose so an unsubscribe signature can never be replayed as anything else.
 */
function deriveMailKey(purpose: string): Buffer {
  const raw = process.env.SIGNING_MASTER_KEY || process.env.SESSION_SECRET;
  if (!raw) {
    throw new Error(
      'SIGNING_MASTER_KEY (or SESSION_SECRET) is required to sign email tokens',
    );
  }
  const master = /^[0-9a-f]{64}$/i.test(raw)
    ? Buffer.from(raw, 'hex')
    : Buffer.from(raw, 'utf8');
  const out = hkdfSync(
    'sha256',
    master,
    Buffer.from('agorax-email-v1', 'utf8'),
    Buffer.from(purpose, 'utf8'),
    32,
  );
  return Buffer.from(out as ArrayBuffer);
}

/**
 * Keyed digest of an identifier that must be counted but must not be stored.
 * Used for the per-address reset rate limiter: the form answers identically
 * whether or not an account exists, so the counter table would otherwise
 * become a list of every address anyone ever typed, most belonging to nobody.
 */
export function hmacIdentifier(namespace: string, value: string): string {
  return createHmac('sha256', deriveMailKey(`hmac:${namespace}`))
    .update(value.trim().toLowerCase())
    .digest('base64url');
}

// ─── Unsubscribe token ──────────────────────────────────────────────────────

const UNSUB_PURPOSE = 'unsubscribe:v1';

/**
 * `<opaque per-member id>.<signature>`.
 *
 * The subject is the random unsubscribe_id, never the user id and never the
 * address — a link sitting in an inbox, a mail log, or a forwarded message
 * cannot be read back into an identity. The signature means a garbage or
 * guessed id is rejected without a database lookup.
 *
 * Scope is exactly one action: switch the master switch off. The endpoint
 * that accepts it can do nothing else — it cannot sign anyone in, change an
 * address, or reveal which account it belongs to.
 */
export function signUnsubscribeToken(unsubscribeId: string): string {
  const sig = createHmac('sha256', deriveMailKey(UNSUB_PURPOSE))
    .update(`${UNSUB_PURPOSE}:${unsubscribeId}`)
    .digest('base64url');
  return `${unsubscribeId}.${sig}`;
}

/** The opaque id if the signature holds, otherwise null. Constant-time. */
export function verifyUnsubscribeToken(token: unknown): string | null {
  if (typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;

  const id = token.slice(0, dot);
  const provided = Buffer.from(token.slice(dot + 1), 'base64url');
  const expected = Buffer.from(signUnsubscribeToken(id).split('.')[1], 'base64url');

  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;
  return id;
}

