/**
 * RSA blind signatures — the cryptographic primitive that delivers
 * malicious-operator anonymity for AgoraX votes
 * (docs/compliance/04_ANONYMOUS_VOTING_DESIGN.md).
 *
 * Pure BigInt arithmetic. Browser and Node both run the same code. No
 * external dependency. The hash binding is SHA-256 with full-domain hash
 * (FDH) via MGF1 — the standard construction for RSA-FDH-blind.
 *
 * Threat model assumed: the server holds (n, e, d). A voter generates
 * random `token` + `blindingFactor r`, sends `H(token) · r^e mod n` to
 * the server. Server signs to obtain `(H(token) · r^e)^d = H(token)^d · r
 * mod n`. Voter unblinds by multiplying by r⁻¹: `H(token)^d mod n`. That
 * is a valid RSA-FDH signature on `token`. The server never sees `token`
 * unblinded and cannot recover the blinding factor from `r^e` without
 * solving RSA.
 *
 * IMPORTANT: this is a hand-rolled primitive. It passes the test vectors
 * in tests/integration/blind-sig.test.ts. For binding elections it must
 * be reviewed by an independent cryptographer before any reliance on the
 * privacy property.
 */

// ─── BigInt helpers ──────────────────────────────────────────────────────────

function bigIntFromBytes(bytes: Uint8Array): bigint {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return n;
}

function bytesFromBigInt(n: bigint, byteLength: number): Uint8Array {
  const out = new Uint8Array(byteLength);
  let v = n;
  for (let i = byteLength - 1; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  if (v > 0n) {
    throw new Error("blind-sig: BigInt does not fit in requested byteLength");
  }
  return out;
}

/** Modular exponentiation: base^exp mod m. */
export function modPow(base: bigint, exp: bigint, m: bigint): bigint {
  if (m === 1n) return 0n;
  let result = 1n;
  let b = base % m;
  if (b < 0n) b += m;
  let e = exp;
  while (e > 0n) {
    if ((e & 1n) === 1n) result = (result * b) % m;
    e >>= 1n;
    b = (b * b) % m;
  }
  return result;
}

/** Extended Euclidean — returns [g, x, y] with a*x + b*y = g. */
function egcd(a: bigint, b: bigint): [bigint, bigint, bigint] {
  if (b === 0n) return [a, 1n, 0n];
  const [g, x1, y1] = egcd(b, a % b);
  return [g, y1, x1 - (a / b) * y1];
}

/** Modular inverse of a mod m, or throws if not coprime. */
export function modInverse(a: bigint, m: bigint): bigint {
  let aa = a % m;
  if (aa < 0n) aa += m;
  const [g, x] = egcd(aa, m);
  if (g !== 1n) throw new Error("blind-sig: modInverse — values are not coprime");
  let inv = x % m;
  if (inv < 0n) inv += m;
  return inv;
}

// ─── Base64 codec (works in browser + Node) ──────────────────────────────────

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function bigIntToBase64(n: bigint, byteLength: number): string {
  return bytesToBase64(bytesFromBigInt(n, byteLength));
}

export function base64ToBigInt(b64: string): bigint {
  return bigIntFromBytes(base64ToBytes(b64));
}

// ─── Hash (SHA-256) — works in both runtimes ────────────────────────────────

async function sha256(input: Uint8Array): Promise<Uint8Array> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", input);
    return new Uint8Array(buf);
  }
  const { createHash } = await import("node:crypto");
  return new Uint8Array(createHash("sha256").update(input).digest());
}

/**
 * MGF1 mask generation function with SHA-256, per RFC 8017 §B.2.1.
 * Used to extend a 32-byte SHA-256 digest into an n-byte mask for FDH.
 */
async function mgf1(seed: Uint8Array, length: number): Promise<Uint8Array> {
  const out = new Uint8Array(length);
  let written = 0;
  let counter = 0;
  while (written < length) {
    const c = new Uint8Array(4);
    c[0] = (counter >>> 24) & 0xff;
    c[1] = (counter >>> 16) & 0xff;
    c[2] = (counter >>> 8) & 0xff;
    c[3] = counter & 0xff;
    const block = await sha256(concat(seed, c));
    const take = Math.min(block.length, length - written);
    out.set(block.subarray(0, take), written);
    written += take;
    counter++;
  }
  return out;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/**
 * Full-domain hash of `token` into Z_n. Returns a bigint strictly less
 * than n by reducing mod n. (The standard FDH construction; safe for
 * unique-message signatures because we never sign the same token twice
 * — the issuance ledger enforces one-per-user-per-proposal and the vote
 * table has a uniqueness constraint on (proposal_id, vote_token).)
 */
export async function fullDomainHash(token: Uint8Array, n: bigint, nByteLength: number): Promise<bigint> {
  // Sample a longer-than-n MGF output, then reduce mod n. The bias is
  // negligible at 2048-bit n.
  const seed = await sha256(token);
  const wide = await mgf1(seed, nByteLength + 16);
  return bigIntFromBytes(wide) % n;
}

// ─── Random helpers ──────────────────────────────────────────────────────────

function randomBytesCross(length: number): Uint8Array {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const out = new Uint8Array(length);
    crypto.getRandomValues(out);
    return out;
  }
  // Node fallback (also works via `node:crypto` polyfill at server side).
  const { randomBytes } = require("node:crypto") as typeof import("node:crypto");
  return new Uint8Array(randomBytes(length));
}

/**
 * Pick a uniformly random unit modulo n (i.e. gcd(r, n) = 1). For RSA n
 * the probability that a random integer in [1, n) is NOT coprime with n
 * is negligible (only multiples of p or q fail; ~2/p + 2/q ≈ 2¹⁻¹⁰²⁴).
 * We still defensively retry.
 */
export function randomCoprime(n: bigint, byteLength: number): bigint {
  for (let attempt = 0; attempt < 64; attempt++) {
    const bytes = randomBytesCross(byteLength);
    bytes[0] &= 0x7f; // ensure < 2^(8*byteLength - 1), avoids accidental ≥ n on edge.
    const r = bigIntFromBytes(bytes) % n;
    if (r > 1n) {
      const [g] = egcd(r, n);
      if (g === 1n) return r;
    }
  }
  throw new Error("blind-sig: failed to draw random coprime — RNG broken?");
}

// ─── Public API: types ───────────────────────────────────────────────────────

export interface PublicKey {
  /** RSA modulus, base64 big-endian. */
  n: string;
  /** Public exponent, base64 big-endian (typically 65537). */
  e: string;
}

export interface BlindedRequest {
  /** Random token the voter just generated, 32 bytes. */
  token: Uint8Array;
  /** Per-request blinding factor, kept secret on the client. */
  blindingFactor: bigint;
  /** What the voter sends to the server (base64 of H(token) · r^e mod n). */
  blinded: string;
}

// ─── Public API: client (browser) side ───────────────────────────────────────

/**
 * Generate a fresh random token + blind it against the proposal's public
 * key. The voter keeps `token` and `blindingFactor` locally and sends
 * `blinded` to the server.
 */
export async function blind(publicKey: PublicKey): Promise<BlindedRequest> {
  const n = base64ToBigInt(publicKey.n);
  const e = base64ToBigInt(publicKey.e);
  const nByteLength = base64ToBytes(publicKey.n).length;

  const token = randomBytesCross(32);
  const m = await fullDomainHash(token, n, nByteLength);
  const r = randomCoprime(n, nByteLength);
  const rPowE = modPow(r, e, n);
  const blindedInt = (m * rPowE) % n;
  return {
    token,
    blindingFactor: r,
    blinded: bigIntToBase64(blindedInt, nByteLength),
  };
}

/** Server has signed the blinded value; recover the unblinded signature on `token`. */
export function unblind(
  blindedSignatureB64: string,
  blindingFactor: bigint,
  publicKey: PublicKey,
): string {
  const n = base64ToBigInt(publicKey.n);
  const nByteLength = base64ToBytes(publicKey.n).length;
  const sig = base64ToBigInt(blindedSignatureB64);
  const rInv = modInverse(blindingFactor, n);
  const unblinded = (sig * rInv) % n;
  return bigIntToBase64(unblinded, nByteLength);
}

/** Verify an RSA-FDH signature on `token` using the public key. */
export async function verify(
  token: Uint8Array,
  signatureB64: string,
  publicKey: PublicKey,
): Promise<boolean> {
  const n = base64ToBigInt(publicKey.n);
  const e = base64ToBigInt(publicKey.e);
  const nByteLength = base64ToBytes(publicKey.n).length;
  const sig = base64ToBigInt(signatureB64);
  if (sig <= 1n || sig >= n) return false;
  const m = await fullDomainHash(token, n, nByteLength);
  const reconstructed = modPow(sig, e, n);
  return reconstructed === m;
}

// ─── Public API: server side ────────────────────────────────────────────────

export interface PrivateKey extends PublicKey {
  /** Private exponent d, base64. Server-only. */
  d: string;
}

/** Sign a blinded value with the server's private key. */
export function signBlinded(blindedB64: string, privateKey: PrivateKey): string {
  const n = base64ToBigInt(privateKey.n);
  const d = base64ToBigInt(privateKey.d);
  const nByteLength = base64ToBytes(privateKey.n).length;
  const m = base64ToBigInt(blindedB64);
  if (m <= 1n || m >= n) {
    throw new Error("blind-sig: blinded value out of range");
  }
  const sig = modPow(m, d, n);
  return bigIntToBase64(sig, nByteLength);
}

// ─── Key generation (server only — Node) ────────────────────────────────────

/**
 * Generate a fresh RSA-2048 keypair per proposal. Uses Node's WebCrypto
 * (available in Node 19+). Returns the parameters in our base64 wire
 * format. This is the only function in the file that requires Node.
 */
export async function generateKey(): Promise<PrivateKey> {
  // Node 19+ exposes WebCrypto at globalThis.crypto.subtle. Force the
  // subtle to be reachable; on older Node the import below polyfills.
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("blind-sig: crypto.subtle not available — Node ≥ 19 required");
  }
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([0x01, 0x00, 0x01]), // 65537
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const jwkPriv = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const jwkPub = await crypto.subtle.exportKey("jwk", pair.publicKey);

  // JWK uses base64url for n/e/d; convert to standard base64 to match the
  // rest of our wire format.
  const reencode = (b64url: string): string => {
    const padded = b64url + "=".repeat((4 - (b64url.length % 4)) % 4);
    return padded.replace(/-/g, "+").replace(/_/g, "/");
  };
  return {
    n: reencode(jwkPub.n!),
    e: reencode(jwkPub.e!),
    d: reencode(jwkPriv.d!),
  };
}
