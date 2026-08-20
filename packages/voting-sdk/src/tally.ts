/**
 * Homomorphic tally — aggregating encrypted ballots without decrypting any.
 *
 * For each selection, the ciphertexts from every ballot are multiplied
 * together. By the additive-homomorphic property of exponential ElGamal the
 * product is an encryption of the *sum* of the 0/1 votes — i.e. the
 * selection's vote count — under the sum of all the per-ballot nonces. No
 * individual ballot is ever decrypted; only this aggregate is, later, by the
 * trustees.
 *
 * Ballots must be verified (`verifyBallot`) before they are accumulated —
 * this module does the arithmetic, not the validity checking.
 */

import type { CiphertextBallot } from './ballot.ts';
import type { Ciphertext } from './elgamal.ts';
import { addCiphertexts } from './elgamal.ts';
import type { ElectionManifest } from './manifest.ts';
import { assertValidManifest } from './manifest.ts';

/** The running encrypted total for one selection. */
export interface SelectionTally {
  selectionId: string;
  /** Homomorphic product of this selection's ciphertexts across all ballots. */
  ciphertext: Ciphertext;
}

/** The running encrypted totals for one contest. */
export interface ContestTally {
  contestId: string;
  selections: SelectionTally[];
}

/** The encrypted tally of an election — still encrypted, safe to publish. */
export interface EncryptedTally {
  electionId: string;
  /** Number of ballots accumulated so far. */
  ballotCount: number;
  contests: ContestTally[];
}

/** A fresh tally: every selection holds an encryption of 0 (the identity). */
export function emptyTally(manifest: ElectionManifest): EncryptedTally {
  assertValidManifest(manifest);
  return {
    electionId: manifest.electionId,
    ballotCount: 0,
    contests: manifest.contests.map((contest) => ({
      contestId: contest.contestId,
      selections: contest.selections.map((sel) => ({
        selectionId: sel.selectionId,
        // addCiphertexts() with no terms is the identity (1, 1) — Enc(0).
        ciphertext: addCiphertexts(),
      })),
    })),
  };
}

/**
 * Fold one ballot into a tally, returning a new tally. The ballot must match
 * the tally's structure (same contest/selection ids, same election); throws
 * otherwise. Caller is responsible for having verified the ballot first.
 */
export function accumulateBallot(
  tally: EncryptedTally,
  ballot: CiphertextBallot,
): EncryptedTally {
  if (ballot.electionId !== tally.electionId) {
    throw new Error('tally: ballot is for a different election');
  }
  const ballotContests = new Map(ballot.contests.map((c) => [c.contestId, c]));

  const contests: ContestTally[] = tally.contests.map((ct) => {
    const bc = ballotContests.get(ct.contestId);
    if (!bc) throw new Error(`tally: ballot is missing contest ${ct.contestId}`);
    const ballotSelections = new Map(
      bc.selections.map((s) => [s.selectionId, s]),
    );
    return {
      contestId: ct.contestId,
      selections: ct.selections.map((st) => {
        const bs = ballotSelections.get(st.selectionId);
        if (!bs) {
          throw new Error(
            `tally: ballot is missing selection ${st.selectionId}`,
          );
        }
        return {
          selectionId: st.selectionId,
          ciphertext: addCiphertexts(st.ciphertext, bs.ciphertext),
        };
      }),
    };
  });

  return {
    electionId: tally.electionId,
    ballotCount: tally.ballotCount + 1,
    contests,
  };
}

/** Tally a batch of ballots from an empty tally. */
export function tallyBallots(
  manifest: ElectionManifest,
  ballots: CiphertextBallot[],
): EncryptedTally {
  return ballots.reduce(accumulateBallot, emptyTally(manifest));
}
