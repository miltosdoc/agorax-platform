/**
 * Per-proposal RSA keypair vault for anonymous voting.
 *
 * The private exponent `d` is AES-256-GCM encrypted at rest. The
 * encryption key is derived (HKDF-SHA256) from a server-only
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
  // Accept either base64 or hex; the production deployment should use
  // base64-encoded 32 bytes.
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
  // hkdfSync returns ArrayBuffer in some Node versions — normalise.
  const out = hkdfSync('sha256', master, salt, info, 32);
  return Buffer.from(out as ArrayBuffer);
}

function encryptD(d: string, proposalId: number): { ciphertext: string; iv: string; tag: string } {
  const key = deriveProposalKey(proposalId);
  const iv = randomBytes(12); // GCM standard
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

/** Return the public part of a proposal's blind-sig key, generating one on demand. */
export async function ensureKey(proposalId: number): Promise<PublicKey> {
  const existing = await loadRow(proposalId);
  if (existing) {
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
  // In a tiny race, another request may have inserted first — re-read to
  // ensure we sign against the persisted key, not the in-memory one.
  const reread = await loadRow(proposalId);
  if (!reread) throw new Error('blind-sig vault: failed to persist key');
  return { n: reread.publicN, e: reread.publicE };
}

/** Load the full private keypair for server-side signing. Server-only. */
export async function loadPrivateKey(proposalId: number): Promise<PrivateKey> {
  const row = await loadRow(proposalId);
  if (!row) throw new Error(`blind-sig vault: no key for proposal ${proposalId}`);
  return { n: row.publicN, e: row.publicE, d: decryptD(row) };
}

async function loadRow(proposalId: number): Promise<BlindSigKey | undefined> {
  const [row] = await db
    .select()
    .from(blindSigKeys)
    .where(eq(blindSigKeys.proposalId, proposalId))
    .limit(1);
  return row;
}
