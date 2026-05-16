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
import type { GuardianShare } from './keyceremony.ts';
import { lagrangeCoefficient } from './keyceremony.ts';
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

// ===========================================================================
// Threshold decryption — N-of-M guardians (Phase 3)
// ===========================================================================
//
// With a key ceremony, no one holds the secret key `s`. Each guardian `ℓ`
// holds a share `z_ℓ` and computes a *partial decryption* `M_ℓ = α^{z_ℓ}` of
// every tally ciphertext, with a proof that `M_ℓ` used the share behind its
// public commitment `g^{z_ℓ}`. Any `t` partial decryptions combine, by
// Lagrange interpolation in the exponent, into `M = α^s` — and from there the
// count, exactly as in the single-guardian case. No `t − 1` guardians, and no
// adversary short of `t` of them, can decrypt anything.

/** One guardian's partial decryption of one selection's tally. */
export interface PartialDecryptionSelection {
  selectionId: string;
  /** `M_ℓ = α^{z_ℓ}`. */
  share: ElementModP;
  /** Proof that `M_ℓ` was formed with the share behind `g^{z_ℓ}`. */
  proof: ChaumPedersenProof;
}

/** One guardian's partial decryption of one contest. */
export interface PartialDecryptionContest {
  contestId: string;
  selections: PartialDecryptionSelection[];
}

/** One guardian's partial decryption of the whole encrypted tally. */
export interface GuardianPartialDecryption {
  guardianIndex: number;
  contests: PartialDecryptionContest[];
}

/** The public information needed to verify a guardian's partial decryption. */
export interface GuardianPublicShare {
  index: number;
  /** `g^{z_ℓ}` — derivable from the ceremony commitments. */
  publicCommitment: ElementModP;
}

/** One selection's combined threshold result. */
export interface ThresholdSelectionResult {
  selectionId: string;
  tally: number;
  /** The combined `M = α^s`, reproducible from the partial decryptions. */
  combinedShare: ElementModP;
}

/** One contest's combined threshold result. */
export interface ThresholdContestResult {
  contestId: string;
  selections: ThresholdSelectionResult[];
}

/** A tally decrypted by a quorum of guardians. */
export interface ThresholdDecryptionResult {
  electionId: string;
  ballotCount: number;
  /** Indices of the guardians whose partial decryptions were combined. */
  participatingGuardians: number[];
  contests: ThresholdContestResult[];
}

/** Domain context binding a partial-decryption proof to its guardian. */
function partialContext(
  electionId: string,
  contestId: string,
  selectionId: string,
  guardianIndex: number,
): bigint[] {
  return contextFromIds(
    electionId,
    contestId,
    selectionId,
    `guardian-${guardianIndex}`,
  );
}

/**
 * Compute one guardian's partial decryption of an encrypted tally: for every
 * selection, `M_ℓ = α^{z_ℓ}` with a Chaum-Pedersen proof of correctness.
 */
export function partiallyDecryptTally(
  encryptedTally: EncryptedTally,
  guardianShare: GuardianShare,
): GuardianPartialDecryption {
  const contests: PartialDecryptionContest[] = encryptedTally.contests.map(
    (contest) => ({
      contestId: contest.contestId,
      selections: contest.selections.map((sel) => {
        const { alpha } = sel.ciphertext;
        const share = powModP(alpha, guardianShare.share); // M_ℓ = α^{z_ℓ}
        const proof = proveEqualDlog(guardianShare.share, {
          baseK: alpha,
          alpha: guardianShare.publicCommitment, // g^{z_ℓ}
          betaPrime: share,
          context: partialContext(
            encryptedTally.electionId,
            contest.contestId,
            sel.selectionId,
            guardianShare.index,
          ),
        });
        return { selectionId: sel.selectionId, share, proof };
      }),
    }),
  );
  return { guardianIndex: guardianShare.index, contests };
}

/**
 * Verify a guardian's partial decryption: every share carries a valid proof
 * that it was formed with the share behind the guardian's public commitment.
 */
export function verifyPartialDecryption(
  encryptedTally: EncryptedTally,
  partial: GuardianPartialDecryption,
  publicShare: GuardianPublicShare,
): boolean {
  try {
    if (partial.guardianIndex !== publicShare.index) return false;
    if (partial.contests.length !== encryptedTally.contests.length) return false;

    const partialById = new Map(
      partial.contests.map((c) => [c.contestId, c]),
    );
    for (const encContest of encryptedTally.contests) {
      const pc = partialById.get(encContest.contestId);
      if (!pc) return false;
      if (pc.selections.length !== encContest.selections.length) return false;

      const pSelById = new Map(pc.selections.map((s) => [s.selectionId, s]));
      for (const encSel of encContest.selections) {
        const ps = pSelById.get(encSel.selectionId);
        if (!ps) return false;
        const ok = verifyEqualDlog(ps.proof, {
          baseK: encSel.ciphertext.alpha,
          alpha: publicShare.publicCommitment,
          betaPrime: ps.share,
          context: partialContext(
            encryptedTally.electionId,
            encContest.contestId,
            encSel.selectionId,
            partial.guardianIndex,
          ),
        });
        if (!ok) return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/** Look up a partial decryption's share for a given selection. */
function shareOf(
  partial: GuardianPartialDecryption,
  contestId: string,
  selectionId: string,
): ElementModP {
  const contest = partial.contests.find((c) => c.contestId === contestId);
  const sel = contest?.selections.find((s) => s.selectionId === selectionId);
  if (!sel) {
    throw new Error(
      `threshold: guardian ${partial.guardianIndex} is missing ${contestId}/${selectionId}`,
    );
  }
  return sel.share;
}

/**
 * Combine a quorum of partial decryptions into the cleartext tally.
 *
 * Lagrange-interpolates `M = α^s = ∏_ℓ M_ℓ^{w_ℓ}` over the participating
 * guardians, then recovers each count by bounded discrete-log search. Throws
 * if fewer than `threshold` distinct guardians are supplied.
 */
export function combineDecryptionShares(
  encryptedTally: EncryptedTally,
  partials: GuardianPartialDecryption[],
  jointPublicKey: ElementModP,
  threshold: number,
): ThresholdDecryptionResult {
  const indices = [...new Set(partials.map((p) => p.guardianIndex))];
  if (indices.length !== partials.length) {
    throw new Error('threshold: duplicate guardian in partial decryptions');
  }
  if (indices.length < threshold) {
    throw new Error(
      `threshold: need ${threshold} guardians, got ${indices.length}`,
    );
  }

  // Lagrange weight for each participating guardian.
  const weights = new Map<number, bigint>(
    partials.map((p) => [
      p.guardianIndex,
      lagrangeCoefficient(
        p.guardianIndex,
        indices.filter((i) => i !== p.guardianIndex),
      ),
    ]),
  );

  const contests: ThresholdContestResult[] = encryptedTally.contests.map(
    (contest) => ({
      contestId: contest.contestId,
      selections: contest.selections.map((sel) => {
        // M = ∏_ℓ M_ℓ^{w_ℓ}
        let combinedShare = 1n as ElementModP;
        for (const partial of partials) {
          const mEll = shareOf(partial, contest.contestId, sel.selectionId);
          const weight = weights.get(partial.guardianIndex)!;
          combinedShare = multModP(combinedShare, powModP(mEll, weight));
        }
        const recovered = recoverGroupElement(sel.ciphertext.beta, combinedShare);
        const tally = discreteLog(
          recovered,
          jointPublicKey,
          encryptedTally.ballotCount,
        );
        return { selectionId: sel.selectionId, tally, combinedShare };
      }),
    }),
  );

  return {
    electionId: encryptedTally.electionId,
    ballotCount: encryptedTally.ballotCount,
    participatingGuardians: indices.sort((a, b) => a - b),
    contests,
  };
}

/**
 * Verify a threshold-decrypted tally: every partial decryption proof is
 * valid, the Lagrange combination reproduces each announced `combinedShare`,
 * and every announced count satisfies `K^σ = β · M⁻¹`. Returns false (never
 * throws) on any structural mismatch or failing check.
 */
export function verifyThresholdDecryption(
  encryptedTally: EncryptedTally,
  partials: GuardianPartialDecryption[],
  publicShares: GuardianPublicShare[],
  result: ThresholdDecryptionResult,
  jointPublicKey: ElementModP,
  threshold: number,
): boolean {
  try {
    if (result.electionId !== encryptedTally.electionId) return false;
    if (result.ballotCount !== encryptedTally.ballotCount) return false;
    if (result.participatingGuardians.length < threshold) return false;
    if (partials.length < threshold) return false;

    // Every partial decryption must carry valid proofs.
    const publicByIndex = new Map(publicShares.map((s) => [s.index, s]));
    for (const partial of partials) {
      const pub = publicByIndex.get(partial.guardianIndex);
      if (!pub) return false;
      if (!verifyPartialDecryption(encryptedTally, partial, pub)) return false;
    }

    // Recompute the combination independently and compare every field.
    const recomputed = combineDecryptionShares(
      encryptedTally,
      partials,
      jointPublicKey,
      threshold,
    );

    const resultByContest = new Map(
      result.contests.map((c) => [c.contestId, c]),
    );
    for (const rc of recomputed.contests) {
      const claimed = resultByContest.get(rc.contestId);
      if (!claimed) return false;
      if (claimed.selections.length !== rc.selections.length) return false;
      const claimedBySel = new Map(
        claimed.selections.map((s) => [s.selectionId, s]),
      );
      for (const rs of rc.selections) {
        const cs = claimedBySel.get(rs.selectionId);
        if (!cs) return false;
        if (cs.tally !== rs.tally) return false;
        if (cs.combinedShare !== rs.combinedShare) return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}
