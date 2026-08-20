/**
 * Per-account gov.gr verification challenge code.
 *
 * The code must appear in the free text of the solemn declaration the user
 * uploads, which binds that declaration to exactly one AgoraX account: a
 * leaked or stolen declaration PDF is useless on any other account, and a
 * declaration written for an unrelated purpose (bank, lease, …) cannot be
 * recycled into an identity proof here.
 *
 * Derived deterministically as HMAC-SHA256(SIGNING_MASTER_KEY, userId), so
 * it is stable per account (the user can retry uploads freely), requires no
 * schema change, and cannot be predicted without the server master key.
 * Charset avoids 0/O/1/I lookalikes; the validator compares ignoring case,
 * whitespace and hyphens.
 */
import { createHmac } from 'node:crypto';

const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function govgrChallengeCode(userId: number): string {
  const master = process.env.SIGNING_MASTER_KEY;
  if (!master) {
    throw new Error('SIGNING_MASTER_KEY is not set — cannot derive gov.gr challenge codes');
  }
  const digest = createHmac('sha256', master).update(`govgr-challenge:v1:${userId}`).digest();
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += CHARSET[digest[i] % CHARSET.length];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
