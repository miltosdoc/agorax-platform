/**
 * Ballots — encoding a voter's choices, encrypting them, and verifying that
 * an encrypted ballot is well-formed.
 *
 * A plaintext ballot assigns 0 or 1 to every selection of every contest. To
 * encrypt it, each selection becomes an ElGamal encryption of its 0/1 value,
 * carrying a disjunctive proof that it really is 0 or 1. Each contest also
 * carries a *total* proof: the homomorphic sum of its selections is shown to
 * encrypt exactly `selectionLimit` — so a ballot can neither under- nor
 * over-vote. Both proofs are checkable by anyone, from public data alone.
 */

import type { Ciphertext } from './elgamal.ts';
import { addCiphertexts, encryptWithFreshNonce } from './elgamal.ts';
import { addModQ, invModP, multModP, powModP } from './group.ts';
import type { ElementModP, ElementModQ } from './group.ts';
import { contextFromIds } from './hash.ts';
import type { ContestDescription, ElectionManifest } from './manifest.ts';
import { assertValidManifest } from './manifest.ts';
import type { ChaumPedersenProof } from './proofs/chaum-pedersen.ts';
import { proveEqualDlog, verifyEqualDlog } from './proofs/chaum-pedersen.ts';
import type { DisjunctiveProof } from './proofs/disjunctive.ts';
import { proveZeroOrOne, verifyZeroOrOne } from './proofs/disjunctive.ts';

/** A voter's choice for one selection. */
export interface PlaintextSelection {
  selectionId: string;
  vote: 0 | 1;
}

/** A voter's choices for one contest. */
export interface PlaintextContest {
  contestId: string;
  selections: PlaintextSelection[];
}

/** A complete unencrypted ballot. */
export interface PlaintextBallot {
  ballotId: string;
  contests: PlaintextContest[];
}

/** An encrypted selection with its ballot-validity proof. */
export interface EncryptedSelection {
  selectionId: string;
  ciphertext: Ciphertext;
  /** Proof that `ciphertext` encrypts 0 or 1. */
  proof: DisjunctiveProof;
}

/** An encrypted contest with its selection-total proof. */
export interface EncryptedContest {
  contestId: string;
  selections: EncryptedSelection[];
  /** Proof that the selections sum to exactly `selectionLimit`. */
  totalProof: ChaumPedersenProof;
}

/** A complete encrypted ballot — safe to publish. */
export interface CiphertextBallot {
  ballotId: string;
  electionId: string;
  contests: EncryptedContest[];
}

/** Build an AgoraX ratification ballot for a single yes/no/abstain choice. */
export function ratificationBallot(
  ballotId: string,
  choice: 'yes' | 'no' | 'abstain',
): PlaintextBallot {
  return {
    ballotId,
    contests: [
      {
        contestId: 'ratification',
        selections: (['yes', 'no', 'abstain'] as const).map((selectionId) => ({
          selectionId,
          vote: selectionId === choice ? 1 : 0,
        })),
      },
    ],
  };
}

/** Look up a contest's plaintext and check it against the manifest contest. */
function orderedSelections(
  contest: ContestDescription,
  plaintext: PlaintextContest,
): PlaintextSelection[] {
  const byId = new Map(plaintext.selections.map((s) => [s.selectionId, s]));
  const ordered = contest.selections.map((desc) => {
    const sel = byId.get(desc.selectionId);
    if (!sel) {
      throw new Error(
        `ballot: contest ${contest.contestId} is missing selection ${desc.selectionId}`,
      );
    }
    if (sel.vote !== 0 && sel.vote !== 1) {
      throw new Error(
        `ballot: selection ${desc.selectionId} has a non-binary vote`,
      );
    }
    return sel;
  });
  if (plaintext.selections.length !== contest.selections.length) {
    throw new Error(
      `ballot: contest ${contest.contestId} has unexpected selections`,
    );
  }
  const chosen = ordered.reduce((n, s) => n + s.vote, 0);
  if (chosen !== contest.selectionLimit) {
    throw new Error(
      `ballot: contest ${contest.contestId} chooses ${chosen}, expected ${contest.selectionLimit}`,
    );
  }
  return ordered;
}

/** `β_aggregate · K^(−selectionLimit)` — equals `K^(nonce-sum)` for a valid ballot. */
function contestTotalBetaPrime(
  aggregate: Ciphertext,
  publicKey: ElementModP,
  selectionLimit: number,
): ElementModP {
  const kToLimit = powModP(publicKey, BigInt(selectionLimit));
  return multModP(aggregate.beta, invModP(kToLimit));
}

/**
 * Encrypt a plaintext ballot under the election public key. Throws if the
 * ballot does not match the manifest or is not well-formed (the proofs would
 * fail anyway — this fails fast with a clear message instead).
 */
export function encryptBallot(
  manifest: ElectionManifest,
  plaintext: PlaintextBallot,
  publicKey: ElementModP,
): CiphertextBallot {
  assertValidManifest(manifest);
  const plaintextContests = new Map(
    plaintext.contests.map((c) => [c.contestId, c]),
  );

  const contests: EncryptedContest[] = manifest.contests.map((contest) => {
    const pc = plaintextContests.get(contest.contestId);
    if (!pc) {
      throw new Error(`ballot: missing contest ${contest.contestId}`);
    }
    const ordered = orderedSelections(contest, pc);

    const selections: EncryptedSelection[] = [];
    const ciphertexts: Ciphertext[] = [];
    let nonceSum = 0n as ElementModQ;

    for (const sel of ordered) {
      const { ciphertext, nonce } = encryptWithFreshNonce(
        BigInt(sel.vote),
        publicKey,
      );
      const proof = proveZeroOrOne(
        ciphertext,
        nonce,
        sel.vote,
        publicKey,
        contextFromIds(manifest.electionId, contest.contestId, sel.selectionId),
      );
      selections.push({ selectionId: sel.selectionId, ciphertext, proof });
      ciphertexts.push(ciphertext);
      nonceSum = addModQ(nonceSum, nonce);
    }

    // The selections sum, homomorphically, to an encryption of
    // selectionLimit under the nonce-sum; prove that directly.
    const aggregate = addCiphertexts(...ciphertexts);
    const totalProof = proveEqualDlog(nonceSum, {
      baseK: publicKey,
      alpha: aggregate.alpha,
      betaPrime: contestTotalBetaPrime(
        aggregate,
        publicKey,
        contest.selectionLimit,
      ),
      context: contextFromIds(manifest.electionId, contest.contestId),
    });

    return { contestId: contest.contestId, selections, totalProof };
  });

  return {
    ballotId: plaintext.ballotId,
    electionId: manifest.electionId,
    contests,
  };
}

/**
 * Verify an encrypted ballot against the manifest and election key: every
 * selection is a valid 0/1 encryption and every contest sums to its limit.
 * Returns false (never throws) on any malformed or failing input.
 */
export function verifyBallot(
  manifest: ElectionManifest,
  ballot: CiphertextBallot,
  publicKey: ElementModP,
): boolean {
  try {
    assertValidManifest(manifest);
    if (ballot.electionId !== manifest.electionId) return false;
    if (ballot.contests.length !== manifest.contests.length) return false;

    const encryptedById = new Map(
      ballot.contests.map((c) => [c.contestId, c]),
    );

    for (const contest of manifest.contests) {
      const ec = encryptedById.get(contest.contestId);
      if (!ec) return false;
      if (ec.selections.length !== contest.selections.length) return false;

      const ciphertexts: Ciphertext[] = [];
      for (let i = 0; i < contest.selections.length; i++) {
        const desc = contest.selections[i];
        const es = ec.selections[i];
        // Selections must appear in the manifest's canonical order.
        if (es.selectionId !== desc.selectionId) return false;
        const ok = verifyZeroOrOne(
          es.ciphertext,
          es.proof,
          publicKey,
          contextFromIds(
            manifest.electionId,
            contest.contestId,
            desc.selectionId,
          ),
        );
        if (!ok) return false;
        ciphertexts.push(es.ciphertext);
      }

      const aggregate = addCiphertexts(...ciphertexts);
      const totalOk = verifyEqualDlog(ec.totalProof, {
        baseK: publicKey,
        alpha: aggregate.alpha,
        betaPrime: contestTotalBetaPrime(
          aggregate,
          publicKey,
          contest.selectionLimit,
        ),
        context: contextFromIds(manifest.electionId, contest.contestId),
      });
      if (!totalOk) return false;
    }
    return true;
  } catch {
    return false;
  }
}
