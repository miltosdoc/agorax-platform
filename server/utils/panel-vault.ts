/**
 * Platform-wide RSA keypair vault for blind-signing panel enrollment tokens.
 *
 * Same construction as the per-proposal vault (blind-sig-vault.ts): the
 * private key is AES-256-GCM encrypted at rest under a key derived
 * (HKDF-SHA256) from SIGNING_MASTER_KEY, with the key row id as HKDF info.
 * One ACTIVE key at a time; rotating inserts a new row and deactivates the
 * old one (tokens signed under an old key keep verifying — registration
 * checks against every key, active or not).
 */
import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { panelEnrollmentKeys, type PanelEnrollmentKey } from '@shared/schema';
import { generateKey, type PrivateKey, type PublicKey } from '@shared/blind-sig';

function loadMasterKey(): Buffer {
  const raw = process.env.SIGNING_MASTER_KEY;
  if (!raw) {
    throw new Error(
      'SIGNING_MASTER_KEY env var is required for panel enrollment. ' +
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

function deriveKey(keyId: number): Buffer {
  const master = loadMasterKey();
  const info = Buffer.from(`agorax-panel-enroll:key:${keyId}`, 'utf8');
  const salt = Buffer.from('agorax-blind-sig-v1', 'utf8');
  const out = hkdfSync('sha256', master, salt, info, 32);
  return Buffer.from(out as ArrayBuffer);
}

function encryptD(d: string, keyId: number): { ciphertext: string; iv: string; tag: string } {
  const key = deriveKey(keyId);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(d, 'utf8'), cipher.final()]);
  return {
    ciphertext: ct.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

function decryptD(row: PanelEnrollmentKey): string {
  const key = deriveKey(row.id);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(row.secretDIv, 'base64'));
  decipher.setAuthTag(Buffer.from(row.secretDTag, 'base64'));
  const pt = Buffer.concat([
    decipher.update(Buffer.from(row.secretDCiphertext, 'base64')),
    decipher.final(),
  ]);
  return pt.toString('utf8');
}

/** Public part of the active enrollment key, generating one on first use. */
export async function ensureEnrollmentKey(): Promise<PublicKey> {
  const [existing] = await db
    .select()
    .from(panelEnrollmentKeys)
    .where(eq(panelEnrollmentKeys.active, true))
    .limit(1);
  if (existing) return { n: existing.publicN, e: existing.publicE };

  const kp = await generateKey();
  // Two-step insert: the HKDF info binds to the row id, which we only know
  // after insert. Insert with placeholder ciphertext, then encrypt + update.
  const [inserted] = await db.insert(panelEnrollmentKeys).values({
    publicN: kp.n,
    publicE: kp.e,
    secretDCiphertext: 'pending',
    secretDIv: 'pending',
    secretDTag: 'pending',
  }).returning({ id: panelEnrollmentKeys.id });
  const enc = encryptD(kp.d, inserted.id);
  await db.update(panelEnrollmentKeys)
    .set({ secretDCiphertext: enc.ciphertext, secretDIv: enc.iv, secretDTag: enc.tag })
    .where(eq(panelEnrollmentKeys.id, inserted.id));
  return { n: kp.n, e: kp.e };
}

/** Full private keypair of the active key, for server-side blind signing. */
export async function loadEnrollmentPrivateKey(): Promise<PrivateKey> {
  await ensureEnrollmentKey();
  const [row] = await db
    .select()
    .from(panelEnrollmentKeys)
    .where(eq(panelEnrollmentKeys.active, true))
    .limit(1);
  if (!row) throw new Error('panel vault: no active enrollment key');
  return { n: row.publicN, e: row.publicE, d: decryptD(row) };
}

/** Every key (active first) — registration verifies against all of them. */
export async function loadAllEnrollmentPublicKeys(): Promise<PublicKey[]> {
  const rows = await db.select().from(panelEnrollmentKeys);
  return rows
    .sort((a, b) => Number(b.active) - Number(a.active))
    .map((r) => ({ n: r.publicN, e: r.publicE }));
}
