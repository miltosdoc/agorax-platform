/**
 * Decryption of an encrypted tally — single-guardian (one-key) case.
 *
 * Only the *aggregate* is decrypted; no individual ballot ever is. For a
 * selection's tally ciphertext `(α, β)` and secret key `s` (with `K = g^s`):
 *
 *   M = α^s              the decryption share
 *   T = β · M⁻¹ = K^σ    σ is the vote count
 *   σ = dlog_K(T)        bounded discrete-log search, 0 … ballotCount
 *
 * The guardian publishes `M` with a Chaum-Pedersen proof that it was formed
 * with the *same* `s` as the public key — `log_g(K) = log_α(M)` — so anyone
 * can confirm the decryption is honest without learning `s`.
 *
 * This is the one-guardian path. Phase 3 generalises `M` to a threshold
 * combination of partial decryption shares from N independent trustees.
 */

import type { ElGamalKeyPair } from './elgamal.ts';
import { invModP, multModP, powModP } from './group.ts';
import type { ElementModP } from './group.ts';
import { contextFromIds } from './hash.ts';
import type { ChaumPedersenProof } from './proofs/chaum-pedersen.ts';
import { proveEqualDlog, verifyEqualDlog } from './proofs/chaum-pedersen.ts';
import type { EncryptedTally } from './tally.ts';

/** A decrypted selection: the vote count, plus the proof it is honest. */
export interface DecryptedSelection {
  selectionId: string;
  /** The recovered vote count σ. */
  tally: number;
  /** The decryption share M = α^s. */
  decryptionShare: ElementModP;
  /** Proof that M was formed with the election secret key. */
  proof: ChaumPedersenProof;
}

/** A decrypted contest. */
export interface DecryptedContest {
  contestId: string;
  selections: DecryptedSelection[];
}

/** A fully decrypted, publicly verifiable election result. */
export interface DecryptedTally {
  electionId: string;
  ballotCount: number;
  contests: DecryptedContest[];
}

/** Find σ in `0…max` with `base^σ = target`, or throw if there is none. */
function discreteLog(
  target: ElementModP,
  base: ElementModP,
  max: number,
): number {
  let acc = 1n as ElementModP; // base^0
  for (let sigma = 0; sigma <= max; sigma++) {
    if (acc === target) return sigma;
    acc = multModP(acc, base);
  }
  throw new Error(`discreteLog: no solution within 0..${max}`);
}

/** `T = β · M⁻¹` — the group element whose discrete log base K is the count. */
function recoverGroupElement(
  beta: ElementModP,
  decryptionShare: ElementModP,
): ElementModP {
  return multModP(beta, invModP(decryptionShare));
}

/**
 * Decrypt an encrypted tally with a single guardian's keypair, producing the
 * vote counts and a verifiable decryption proof for every selection.
 */
export function decryptTally(
  encryptedTally: EncryptedTally,
  keyPair: ElGamalKeyPair,
): DecryptedTally {
  const contests: DecryptedContest[] = encryptedTally.contests.map(
    (contest) => ({
      contestId: contest.contestId,
      selections: contest.selections.map((sel) => {
        const { alpha, beta } = sel.ciphertext;
        const decryptionShare = powModP(alpha, keyPair.secretKey); // M = α^s
        const recovered = recoverGroupElement(beta, decryptionShare); // K^σ
        const tally = discreteLog(
          recovered,
          keyPair.publicKey,
          encryptedTally.ballotCount,
        );
        // Prove M is correct: log_g(K) = log_α(M) = s.
        const proof = proveEqualDlog(keyPair.secretKey, {
          baseK: alpha,
          alpha: keyPair.publicKey,
          betaPrime: decryptionShare,
          context: contextFromIds(
            encryptedTally.electionId,
            contest.contestId,
            sel.selectionId,
          ),
        });
        return { selectionId: sel.selectionId, tally, decryptionShare, proof };
      }),
    }),
  );

  return {
    electionId: encryptedTally.electionId,
    ballotCount: encryptedTally.ballotCount,
    contests,
  };
}

/**
 * Verify a decrypted tally against its encrypted source and the election
 * public key: every decryption share carries a valid proof, and every
 * announced count `σ` genuinely satisfies `K^σ = β · M⁻¹`. Returns false
 * (never throws) on any structural mismatch or failing check.
 */
export function verifyDecryptedTally(
  encryptedTally: EncryptedTally,
  decrypted: DecryptedTally,
  publicKey: ElementModP,
): boolean {
  try {
    if (decrypted.electionId !== encryptedTally.electionId) return false;
    if (decrypted.ballotCount !== encryptedTally.ballotCount) return false;
    if (decrypted.contests.length !== encryptedTally.contests.length) {
      return false;
    }

    const decryptedById = new Map(
      decrypted.contests.map((c) => [c.contestId, c]),
    );

    for (const encContest of encryptedTally.contests) {
      const decContest = decryptedById.get(encContest.contestId);
      if (!decContest) return false;
      if (decContest.selections.length !== encContest.selections.length) {
        return false;
      }

      const decSelById = new Map(
        decContest.selections.map((s) => [s.selectionId, s]),
      );

      for (const encSel of encContest.selections) {
        const decSel = decSelById.get(encSel.selectionId);
        if (!decSel) return false;
        if (decSel.tally < 0 || decSel.tally > encryptedTally.ballotCount) {
          return false;
        }

        const { alpha, beta } = encSel.ciphertext;

        // The proof must show M = α^s for the s behind the public key.
        const proofOk = verifyEqualDlog(decSel.proof, {
          baseK: alpha,
          alpha: publicKey,
          betaPrime: decSel.decryptionShare,
          context: contextFromIds(
            encryptedTally.electionId,
            encContest.contestId,
            encSel.selectionId,
          ),
        });
        if (!proofOk) return false;

        // The announced count must actually satisfy K^σ = β · M⁻¹.
        const recovered = recoverGroupElement(beta, decSel.decryptionShare);
        if (powModP(publicKey, BigInt(decSel.tally)) !== recovered) {
          return false;
        }
      }
    }
    return true;
  } catch {
    return false;
  }
}
