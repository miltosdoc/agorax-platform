/**
 * Blind-signature primitive — correctness + integrity tests.
 *
 * Covers the loop that delivers malicious-operator anonymity:
 *   1. blind(token)    → (blinded, r) on the client
 *   2. signBlinded     → blinded^d mod n on the server
 *   3. unblind(σ, r)   → σ_token on the client
 *   4. verify(token,σ) → true on anyone with (n, e)
 *
 * Also pins the negative cases (wrong key, tampered token, malformed
 * inputs) so a future refactor can't regress them silently.
 */

import { describe, expect, it } from 'vitest';
import {
  blind,
  unblind,
  signBlinded,
  verify,
  generateKey,
  bytesToBase64,
  base64ToBytes,
  type PrivateKey,
  type PublicKey,
} from '../../shared/blind-sig';

function publicOf(k: PrivateKey): PublicKey {
  return { n: k.n, e: k.e };
}

describe('blind-sig — happy path', () => {
  it('roundtrip: blind → sign → unblind → verify is true', async () => {
    const key = await generateKey();
    const pub = publicOf(key);

    const req = await blind(pub);
    expect(req.token.length).toBe(40); // 32 random + 8 bytes expiry
    expect(req.blinded.length).toBeGreaterThan(0);
    // minCastTime defaults to Date.now() at call time — allow small clock drift
    expect(req.minCastTime).toBeGreaterThan(0);

    const blindedSig = signBlinded(req.blinded, key);
    const sig = unblind(blindedSig, req.blindingFactor, pub);

    const ok = await verify(req.token, sig, pub);
    expect(ok).toBe(true);
  });

  it('two independent voters can each obtain a valid signature on their own token', async () => {
    const key = await generateKey();
    const pub = publicOf(key);

    const a = await blind(pub);
    const b = await blind(pub);
    expect(bytesToBase64(a.token)).not.toEqual(bytesToBase64(b.token));

    const sigA = unblind(signBlinded(a.blinded, key), a.blindingFactor, pub);
    const sigB = unblind(signBlinded(b.blinded, key), b.blindingFactor, pub);

    expect(await verify(a.token, sigA, pub)).toBe(true);
    expect(await verify(b.token, sigB, pub)).toBe(true);

    // Cross-pair fails — sigA does not validate against token B.
    expect(await verify(a.token, sigB, pub)).toBe(false);
    expect(await verify(b.token, sigA, pub)).toBe(false);
  });
});

describe('blind-sig — integrity', () => {
  it('a signature from one keypair does not validate under another', async () => {
    const k1 = await generateKey();
    const k2 = await generateKey();

    const req = await blind(publicOf(k1));
    const sig = unblind(signBlinded(req.blinded, k1), req.blindingFactor, publicOf(k1));

    expect(await verify(req.token, sig, publicOf(k1))).toBe(true);
    expect(await verify(req.token, sig, publicOf(k2))).toBe(false);
  });

  it('tampering with the token after signing breaks verification', async () => {
    const key = await generateKey();
    const pub = publicOf(key);

    const req = await blind(pub);
    const sig = unblind(signBlinded(req.blinded, key), req.blindingFactor, pub);

    const tampered = new Uint8Array(req.token);
    tampered[0] ^= 0x01;
    expect(await verify(tampered, sig, pub)).toBe(false);
  });

  it('a sig out of range [2, n) is rejected fast', async () => {
    const key = await generateKey();
    const pub = publicOf(key);
    const req = await blind(pub);

    // The literal "0" base64 is the zero element — must be rejected.
    expect(await verify(req.token, bytesToBase64(new Uint8Array(base64ToBytes(pub.n).length)), pub)).toBe(false);
  });
});

describe('blind-sig — server-side anonymity property', () => {
  it("server only sees the blinded value; the unblinded token cannot be recovered without the voter's blinding factor", async () => {
    const key = await generateKey();
    const pub = publicOf(key);

    const req = await blind(pub);
    const blindedSig = signBlinded(req.blinded, key);

    // The server has: req.blinded, blindedSig, key (n, e, d).
    // It does NOT have: req.token, req.blindingFactor.
    // The unblinded signature is reconstructable ONLY with blindingFactor:
    const correct = unblind(blindedSig, req.blindingFactor, pub);

    // A server-side guess of the blinding factor produces garbage that
    // does not match the voter's eventual token (and cannot, except with
    // negligible probability).
    const guessR = 17n; // any wrong factor
    const wrong = unblind(blindedSig, guessR, pub);
    expect(wrong).not.toEqual(correct);

    // The correct sig verifies; the wrong sig does not.
    expect(await verify(req.token, correct, pub)).toBe(true);
    expect(await verify(req.token, wrong, pub)).toBe(false);
  });
});
