/**
 * Minimal OpenTimestamps proof reader for the browser.
 *
 * Parses a detached .ots proof, replays its operations from the file digest
 * down to each attestation, and checks a Bitcoin attestation against the
 * block's merkle root fetched from a public block explorer. Enough to let a
 * visitor confirm, without trusting our server, that an anchor hash was
 * committed to Bitcoin at a given block. Covers the ops the Bitcoin calendar
 * path uses (sha256, append, prepend, reverse, hexlify, sha1); RIPEMD-160 is
 * reported as unsupported rather than guessed.
 *
 * Format reference: github.com/opentimestamps/javascript-opentimestamps.
 */

const MAGIC = [
  0x00, 0x4f, 0x70, 0x65, 0x6e, 0x54, 0x69, 0x6d, 0x65, 0x73, 0x74, 0x61, 0x6d, 0x70, 0x73,
  0x00, 0x00, 0x50, 0x72, 0x6f, 0x6f, 0x66, 0x00, 0xbf, 0x89, 0xe2, 0xe8, 0x84, 0xe8, 0x92, 0x94,
];
const TAG_PENDING = '83dfe30d2ef90c8e';
const TAG_BITCOIN = '0588960d73d71901';
const TAG_LITECOIN = '06869a0d73d71b45';

export type OtsAttestation =
  | { kind: 'bitcoin'; height: number; message: Uint8Array }
  | { kind: 'litecoin'; height: number; message: Uint8Array }
  | { kind: 'pending'; uri: string; message: Uint8Array }
  | { kind: 'unknown'; tag: string; message: Uint8Array };

export interface OtsProof {
  digestAlgo: 'sha256' | 'sha1' | 'ripemd160';
  digest: Uint8Array;
  attestations: OtsAttestation[];
}

class Reader {
  private pos = 0;
  constructor(private readonly buf: Uint8Array) {}
  get eof(): boolean { return this.pos >= this.buf.length; }
  readByte(): number {
    if (this.pos >= this.buf.length) throw new Error('ots: unexpected end of proof');
    return this.buf[this.pos++];
  }
  readBytes(n: number): Uint8Array {
    if (this.pos + n > this.buf.length) throw new Error('ots: unexpected end of proof');
    const out = this.buf.slice(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }
  readVaruint(): number {
    let value = 0;
    let shift = 0;
    let b: number;
    do {
      b = this.readByte();
      value |= (b & 0x7f) << shift;
      shift += 7;
    } while (b & 0x80);
    return value >>> 0;
  }
  readVarbytes(): Uint8Array {
    return this.readBytes(this.readVaruint());
  }
}

export function bytesToHex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (!/^[0-9a-f]*$/.test(clean) || clean.length % 2) throw new Error('bad hex');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

async function digest(algo: 'SHA-1' | 'SHA-256', msg: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest(algo, new Uint8Array(msg)));
}

export async function sha256Hex(text: string): Promise<string> {
  return bytesToHex(await digest('SHA-256', new TextEncoder().encode(text)));
}

async function applyOp(r: Reader, tag: number, msg: Uint8Array): Promise<Uint8Array> {
  switch (tag) {
    case 0xf0: return concat(msg, r.readVarbytes());           // append
    case 0xf1: return concat(r.readVarbytes(), msg);           // prepend
    case 0xf2: return msg.slice().reverse();                   // reverse
    case 0xf3: return new TextEncoder().encode(bytesToHex(msg)); // hexlify
    case 0x02: return digest('SHA-1', msg);
    case 0x08: return digest('SHA-256', msg);
    case 0x03: throw new Error('ots: RIPEMD-160 step not supported by the browser verifier');
    default: throw new Error(`ots: unknown operation tag 0x${tag.toString(16)}`);
  }
}

async function parseTimestamp(r: Reader, msg: Uint8Array, out: OtsAttestation[]): Promise<void> {
  let tag = r.readByte();
  while (tag === 0xff) {
    const current = r.readByte();
    await tagOrAttestation(r, current, msg, out);
    tag = r.readByte();
  }
  await tagOrAttestation(r, tag, msg, out);
}

async function tagOrAttestation(r: Reader, tag: number, msg: Uint8Array, out: OtsAttestation[]): Promise<void> {
  if (tag === 0x00) {
    const attTag = bytesToHex(r.readBytes(8));
    const payload = new Reader(r.readVarbytes());
    if (attTag === TAG_BITCOIN) out.push({ kind: 'bitcoin', height: payload.readVaruint(), message: msg });
    else if (attTag === TAG_LITECOIN) out.push({ kind: 'litecoin', height: payload.readVaruint(), message: msg });
    else if (attTag === TAG_PENDING) out.push({ kind: 'pending', uri: new TextDecoder().decode(payload.readVarbytes()), message: msg });
    else out.push({ kind: 'unknown', tag: attTag, message: msg });
    return;
  }
  const next = await applyOp(r, tag, msg);
  await parseTimestamp(r, next, out);
}

/** Parse a detached .ots proof and replay it to every attestation. */
export async function parseOts(bytes: Uint8Array): Promise<OtsProof> {
  const r = new Reader(bytes);
  const magic = r.readBytes(MAGIC.length);
  if (bytesToHex(magic) !== bytesToHex(new Uint8Array(MAGIC))) throw new Error('ots: not an OpenTimestamps proof');
  const major = r.readVaruint();
  if (major !== 1) throw new Error(`ots: unsupported proof version ${major}`);
  const opTag = r.readByte();
  const algo = opTag === 0x08 ? 'sha256' : opTag === 0x02 ? 'sha1' : opTag === 0x03 ? 'ripemd160' : null;
  if (!algo) throw new Error(`ots: unknown file hash op 0x${opTag.toString(16)}`);
  const fileDigest = r.readBytes(algo === 'sha256' ? 32 : 20);
  const attestations: OtsAttestation[] = [];
  await parseTimestamp(r, fileDigest, attestations);
  if (!r.eof) throw new Error('ots: trailing bytes after proof');
  return { digestAlgo: algo, digest: fileDigest, attestations };
}

export interface BitcoinCheck {
  ok: boolean;
  height: number;
  blockHash: string | null;
  /** Unix seconds of the block, from the explorer. */
  blockTime: number | null;
  /** Merkle root the proof commits to, display byte order. */
  expectedMerkleRoot: string;
  /** Merkle root the explorer reports for that block. */
  actualMerkleRoot: string | null;
  error?: string;
}

/**
 * Compare the merkle root a Bitcoin attestation commits to with the block
 * header as served by a public Esplora-compatible explorer. This is the
 * same "lite" check the reference client performs without a local node.
 */
export async function checkBitcoinAttestation(
  att: Extract<OtsAttestation, { kind: 'bitcoin' }>,
  opts: { apiBase?: string; fetchImpl?: typeof fetch } = {},
): Promise<BitcoinCheck> {
  const api = (opts.apiBase ?? 'https://blockstream.info/api').replace(/\/$/, '');
  const f = opts.fetchImpl ?? fetch;
  // The attestation message is the merkle root in internal (little-endian) order.
  const expected = bytesToHex(att.message.slice().reverse());
  const base: BitcoinCheck = { ok: false, height: att.height, blockHash: null, blockTime: null, expectedMerkleRoot: expected, actualMerkleRoot: null };
  try {
    const hashResp = await f(`${api}/block-height/${att.height}`);
    if (!hashResp.ok) return { ...base, error: `explorer HTTP ${hashResp.status}` };
    const blockHash = (await hashResp.text()).trim();
    const blockResp = await f(`${api}/block/${blockHash}`);
    if (!blockResp.ok) return { ...base, blockHash, error: `explorer HTTP ${blockResp.status}` };
    const block = await blockResp.json() as { merkle_root?: string; timestamp?: number };
    const actual = (block.merkle_root ?? '').toLowerCase();
    return {
      ...base,
      ok: actual.length === 64 && actual === expected,
      blockHash,
      blockTime: typeof block.timestamp === 'number' ? block.timestamp : null,
      actualMerkleRoot: actual || null,
    };
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : String(err) };
  }
}
