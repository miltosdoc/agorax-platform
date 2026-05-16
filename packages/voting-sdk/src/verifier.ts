/**
 * The public verifier — independent re-verification of a complete election.
 *
 * An `ElectionRecord` is the full *public* bundle of an election: the
 * manifest, the joint key and the guardians' coefficient commitments, every
 * encrypted ballot with its proofs, the encrypted tally, the guardians'
 * partial decryptions, and the announced result. It contains no secret —
 * no plaintext ballot, no secret key, no guardian share.
 *
 * `verifyElectionRecord` re-derives everything it can from public data and
 * trusts nothing else. It confirms, end to end:
 *
 *   1. the manifest is well-formed;
 *   2. the joint public key is the product of the guardians' commitments;
 *   3. every cast ballot is valid (each selection a 0/1, each contest summing
 *      to its limit);
 *   4. the encrypted tally really is the homomorphic aggregate of those
 *      ballots — nothing was added, dropped or altered;
 *   5. the threshold decryption is correct — every partial decryption proof
 *      checks, and the Lagrange combination reproduces the announced result;
 *   6. the announced counts are consistent with the ballot count.
 *
 * A miscount, a stuffed ballot, a forged tally or a cheating guardian fails
 * at least one check. This is the artifact that makes the election's
 * *integrity* verifiable by anyone. (Privacy is a separate, non-verifiable
 * property — see the SDK plan.)
 */

import type { CiphertextBallot } from './ballot.ts';
import { verifyBallot } from './ballot.ts';
import type {
  GuardianPartialDecryption,
  GuardianPublicShare,
  ThresholdDecryptionResult,
} from './decryption.ts';
import { verifyThresholdDecryption } from './decryption.ts';
import { multModP } from './group.ts';
import type { ElementModP } from './group.ts';
import type { GuardianCommitment } from './keyceremony.ts';
import { deriveShareCommitment } from './keyceremony.ts';
import type { ElectionManifest } from './manifest.ts';
import { assertValidManifest } from './manifest.ts';
import type { EncryptedTally } from './tally.ts';
import { tallyBallots } from './tally.ts';

/** The complete public record of an election — no secret data. */
export interface ElectionRecord {
  manifest: ElectionManifest;
  /** Decryption threshold `t`. */
  threshold: number;
  /** Number of guardians `n`. */
  guardianCount: number;
  /** Joint election public key. */
  jointPublicKey: ElementModP;
  /** Every guardian's public coefficient commitments. */
  guardianCommitments: GuardianCommitment[];
  /** Every cast ballot, encrypted, with its validity proofs. */
  ballots: CiphertextBallot[];
  /** The published encrypted tally. */
  encryptedTally: EncryptedTally;
  /** The participating guardians' partial decryptions. */
  partialDecryptions: GuardianPartialDecryption[];
  /** The announced result. */
  result: ThresholdDecryptionResult;
}

/** One named check within a verification report. */
export interface VerificationCheck {
  name: string;
  ok: boolean;
  /** Present when a check fails — names the inconsistency. */
  detail?: string;
}

/** The outcome of verifying an election record. */
export interface VerificationReport {
  ok: boolean;
  checks: VerificationCheck[];
}

/** Whether two encrypted tallies are identical, ciphertext for ciphertext. */
function talliesEqual(a: EncryptedTally, b: EncryptedTally): boolean {
  if (a.electionId !== b.electionId) return false;
  if (a.ballotCount !== b.ballotCount) return false;
  if (a.contests.length !== b.contests.length) return false;
  const bById = new Map(b.contests.map((c) => [c.contestId, c]));
  for (const ac of a.contests) {
    const bc = bById.get(ac.contestId);
    if (!bc || bc.selections.length !== ac.selections.length) return false;
    const bSel = new Map(bc.selections.map((s) => [s.selectionId, s]));
    for (const asel of ac.selections) {
      const bsel = bSel.get(asel.selectionId);
      if (!bsel) return false;
      if (
        asel.ciphertext.alpha !== bsel.ciphertext.alpha ||
        asel.ciphertext.beta !== bsel.ciphertext.beta
      ) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Verify a complete election record. Returns a per-check report; `ok` is true
 * only if every check passed. Never throws.
 */
export function verifyElectionRecord(record: ElectionRecord): VerificationReport {
  const checks: VerificationCheck[] = [];
  const check = (name: string, fn: () => boolean): void => {
    try {
      checks.push({ name, ok: fn() });
    } catch (err) {
      checks.push({ name, ok: false, detail: String(err) });
    }
  };

  const { manifest, jointPublicKey, guardianCommitments } = record;

  check('manifest is well-formed', () => {
    assertValidManifest(manifest);
    return true;
  });

  check('joint public key is the product of guardian commitments', () => {
    if (guardianCommitments.length !== record.guardianCount) return false;
    let product = 1n as ElementModP;
    for (const gc of guardianCommitments) {
      if (gc.commitments.length !== record.threshold) return false;
      product = multModP(product, gc.commitments[0]);
    }
    return product === jointPublicKey;
  });

  check('every cast ballot is valid', () => {
    if (record.ballots.length !== record.encryptedTally.ballotCount) {
      return false;
    }
    return record.ballots.every((ballot) =>
      verifyBallot(manifest, ballot, jointPublicKey),
    );
  });

  check('encrypted tally is the homomorphic aggregate of the ballots', () => {
    const recomputed = tallyBallots(manifest, record.ballots);
    return talliesEqual(recomputed, record.encryptedTally);
  });

  check('threshold decryption is valid', () => {
    // Re-derive the guardians' public shares from the commitments — do not
    // trust any supplied value.
    const publicShares: GuardianPublicShare[] = [];
    for (let i = 1; i <= record.guardianCount; i++) {
      publicShares.push({
        index: i,
        publicCommitment: deriveShareCommitment(guardianCommitments, i),
      });
    }
    return verifyThresholdDecryption(
      record.encryptedTally,
      record.partialDecryptions,
      publicShares,
      record.result,
      jointPublicKey,
      record.threshold,
    );
  });

  check('announced counts are consistent with the ballot count', () => {
    const resultByContest = new Map(
      record.result.contests.map((c) => [c.contestId, c]),
    );
    for (const contest of manifest.contests) {
      const rc = resultByContest.get(contest.contestId);
      if (!rc) return false;
      let sum = 0;
      for (const sel of rc.selections) {
        if (sel.tally < 0) return false;
        sum += sel.tally;
      }
      // Each ballot contributes exactly `selectionLimit` ones to the contest.
      if (sum !== record.encryptedTally.ballotCount * contest.selectionLimit) {
        return false;
      }
    }
    return true;
  });

  return { ok: checks.every((c) => c.ok), checks };
}
