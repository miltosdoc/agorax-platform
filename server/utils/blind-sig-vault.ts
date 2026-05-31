/**
 * Per-proposal RSA keypair vault for anonymous voting.
 *
 * The private key is stored as a base64-encoded JWK JSON (RFC 9474 format).
 * The encryption key is derived (HKDF-SHA256) from a server-only
 * SIGNING_MASTER_KEY env var, using the proposal id as the HKDF info.
 *
 * Why HKDF: lets us rotate one global master key without re-keying every
 * proposal's stored ciphertext, and produces a unique per-proposal key
 * with formally-bound semantics.
 *
 * Why AES-GCM: authenticated encryption — tampering with the ciphertext
 * or IV produces a decrypt failure rather than silent garbage. The auth
 * tag is stored separately so the columns are well-typed.
 *
 * See docs/compliance/04_ANONYMOUS_VOTING_DESIGN.md.
 */
import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import { db } from '../db';
import { blindSigKeys, type BlindSigKey } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { generateKey, type PrivateKey, type PublicKey } from '@shared/blind-sig';

function loadMasterKey(): Buffer {
  const raw = process.env.SIGNING_MASTER_KEY;
  if (!raw) {
    throw new Error(
      'SIGNING_MASTER_KEY env var is required for anonymous voting. ' +
      'Generate one with `openssl rand -base64 32` and set it in env.',
    );
  }
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length < 32) {
    throw new Error('SIGNING_MASTER_KEY must decode to at least 32 bytes');
  }
  return buf;
}

function deriveProposalKey(proposalId: number): Buffer {
  const master = loadMasterKey();
  const info = Buffer.from(`agorax-blind-sig:proposal:${proposalId}`, 'utf8');
  const salt = Buffer.from('agorax-blind-sig-v1', 'utf8');
  const out = hkdfSync('sha256', master, salt, info, 32);
  return Buffer.from(out as ArrayBuffer);
}

function encryptD(d: string, proposalId: number): { ciphertext: string; iv: string; tag: string } {
  const key = deriveProposalKey(proposalId);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(d, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: ct.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

function decryptD(row: BlindSigKey): string {
  const key = deriveProposalKey(row.proposalId);
  const iv = Buffer.from(row.secretDIv, 'base64');
  const ct = Buffer.from(row.secretDCiphertext, 'base64');
  const tag = Buffer.from(row.secretDTag, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

/**
 * Check if a decrypted private key is in the legacy format (base64 bigint)
 * vs the new format (base64 JWK JSON). Legacy keys are incompatible with
 * RFC 9474 and must be regenerated.
 */
function isLegacyKeyFormat(d: string): boolean {
  try {
    const decoded = Buffer.from(d, 'base64').toString('utf8');
    // New format is JSON starting with '{' (JWK object)
    return !decoded.startsWith('{');
  } catch {
    // If base64 decode fails, treat as legacy (will be regenerated)
    return true;
  }
}

/** Return the public part of a proposal's blind-sig key, generating one on demand. */
export async function ensureKey(proposalId: number): Promise<PublicKey> {
  const existing = await loadRow(proposalId);
  if (existing) {
    // Check if the stored key is in legacy format — if so, regenerate.
    const decryptedD = decryptD(existing);
    if (isLegacyKeyFormat(decryptedD)) {
      // Legacy key (PKCS#1 v1.5) — regenerate with RFC 9474 format.
      // This is safe because the old key can't be used with the new library.
      return await regenerateKey(proposalId);
    }
    return { n: existing.publicN, e: existing.publicE };
  }
  const kp = await generateKey();
  const enc = encryptD(kp.d, proposalId);
  await db.insert(blindSigKeys).values({
    proposalId,
    publicN: kp.n,
    publicE: kp.e,
    secretDCiphertext: enc.ciphertext,
    secretDIv: enc.iv,
    secretDTag: enc.tag,
  }).onConflictDoNothing();
  const reread = await loadRow(proposalId);
  if (!reread) throw new Error('blind-sig vault: failed to persist key');
  return { n: reread.publicN, e: reread.publicE };
}

/** Regenerate a key for a proposal (replaces legacy format). */
async function regenerateKey(proposalId: number): Promise<PublicKey> {
  const kp = await generateKey();
  const enc = encryptD(kp.d, proposalId);
  await db.update(blindSigKeys)
    .set({
      publicN: kp.n,
      publicE: kp.e,
      secretDCiphertext: enc.ciphertext,
      secretDIv: enc.iv,
      secretDTag: enc.tag,
    })
    .where(eq(blindSigKeys.proposalId, proposalId));
  const reread = await loadRow(proposalId);
  if (!reread) throw new Error('blind-sig vault: failed to persist regenerated key');
  return { n: reread.publicN, e: reread.publicE };
}

/** Load the full private keypair for server-side signing. Server-only. */
export async function loadPrivateKey(proposalId: number): Promise<PrivateKey> {
  const row = await loadRow(proposalId);
  if (!row) throw new Error(`blind-sig vault: no key for proposal ${proposalId}`);
  const d = decryptD(row);
  // If somehow a legacy key slipped through, regenerate.
  if (isLegacyKeyFormat(d)) {
    await regenerateKey(proposalId);
    const newRow = await loadRow(proposalId);
    if (!newRow) throw new Error('blind-sig vault: failed after regeneration');
    return { n: newRow.publicN, e: newRow.publicE, d: decryptD(newRow) };
  }
  return { n: row.publicN, e: row.publicE, d };
}

async function loadRow(proposalId: number): Promise<BlindSigKey | undefined> {
  const [row] = await db
    .select()
    .from(blindSigKeys)
    .where(eq(blindSigKeys.proposalId, proposalId))
    .limit(1);
  return row;
}
