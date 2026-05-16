/**
 * The Fiat-Shamir transform — turning interactive sigma-protocols into
 * non-interactive proofs by deriving the verifier's challenge from a hash.
 *
 * The challenge is `H(domainKey(label), value₁ ‖ … ‖ valueₙ) mod q`, where
 * each value is encoded as a fixed 512-byte big-endian field so the
 * concatenation is unambiguous (no two value-lists collide). `domainKey`
 * gives each protocol a distinct 32-byte HMAC key — the domain separation
 * that stops a proof transcript from one context being replayed in another,
 * a well-known Fiat-Shamir footgun.
 *
 * NOTE ON CONFORMANCE: this is a *sound* Fiat-Shamir construction — the
 * challenge commits to every public value of the statement and proof. It is
 * not yet byte-identical to ElectionGuard 2.1's exact `H_E`/domain-byte
 * scheme; aligning the encoding against the official EG 2.1 test vectors is a
 * tracked follow-up before any conformance claim or binding election.
 */

import { modQ } from '../group.ts';
import type { ElementModQ } from '../group.ts';
import { H, bytesToBigint, concatBytes, modPToBytes, sha256Utf8 } from '../hash.ts';

const FS_DOMAIN_PREFIX = 'agorax-voting/electionguard-2.1/fiat-shamir';

/** Derive the fixed 32-byte HMAC key that domain-separates a given usage. */
export function domainKey(label: string): Uint8Array {
  return sha256Utf8(`${FS_DOMAIN_PREFIX}/${label}`);
}

/**
 * Non-interactive challenge for a sigma-protocol.
 *
 * @param label  Domain-separation label — distinct per proof type.
 * @param values All public statement + commitment values, in a fixed order
 *               that prover and verifier must agree on.
 */
export function fiatShamirChallenge(
  label: string,
  values: bigint[],
): ElementModQ {
  const data = concatBytes(...values.map((v) => modPToBytes(v)));
  return modQ(bytesToBigint(H(domainKey(label), data)));
}
