/**
 * Phase 3 — threshold key ceremony and N-of-M guardian decryption.
 */

import { describe, expect, it } from 'vitest';
import {
  agoraxRatificationManifest,
  combineDecryptionShares,
  commitmentFor,
  dealShare,
  encryptBallot,
  generateGuardian,
  gPowP,
  partiallyDecryptTally,
  ratificationBallot,
  runKeyCeremony,
  tallyBallots,
  verifyBallot,
  verifyPartialDecryption,
  verifyShare,
  verifyThresholdDecryption,
} from '../src/index.ts';
import type {
  ElementModQ,
  GuardianPartialDecryption,
  ThresholdDecryptionResult,
} from '../src/index.ts';

function count(result: ThresholdDecryptionResult, selectionId: string): number {
  const sel = result.contests[0].selections.find(
    (s) => s.selectionId === selectionId,
  );
  if (!sel) throw new Error(`no selection ${selectionId}`);
  return sel.tally;
}

describe('Pedersen VSS key ceremony', () => {
  it('every dealt share verifies against the dealer commitments', () => {
    const guardian = generateGuardian(1, 3);
    const commitment = commitmentFor(guardian);
    for (let ell = 1; ell <= 5; ell++) {
      expect(verifyShare(commitment, ell, dealShare(guardian, ell))).toBe(true);
    }
  });

  it('rejects a tampered share', () => {
    const guardian = generateGuardian(2, 3);
    const commitment = commitmentFor(guardian);
    const share = dealShare(guardian, 4);
    expect(verifyShare(commitment, 4, (share + 1n) as ElementModQ)).toBe(false);
  });

  it('produces share commitments consistent with the secret shares', () => {
    const ceremony = runKeyCeremony(3, 5);
    for (const gs of ceremony.guardianShares) {
      expect(gs.publicCommitment).toBe(gPowP(gs.share));
    }
  });

  it('rejects an invalid threshold', () => {
    expect(() => runKeyCeremony(6, 5)).toThrow();
    expect(() => runKeyCeremony(0, 5)).toThrow();
  });
});

describe('3-of-5 threshold election', () => {
  const manifest = agoraxRatificationManifest('proposal-threshold');
  const choices: ('yes' | 'no' | 'abstain')[] = [
    'yes', 'yes', 'yes', 'yes', // 4 yes
    'no', 'no', // 2 no
    'abstain', // 1 abstain
  ];

  function setup() {
    const ceremony = runKeyCeremony(3, 5);
    const ballots = choices.map((choice, i) => {
      const ballot = encryptBallot(
        manifest,
        ratificationBallot(`b${i}`, choice),
        ceremony.jointPublicKey,
      );
      expect(verifyBallot(manifest, ballot, ceremony.jointPublicKey)).toBe(true);
      return ballot;
    });
    const encryptedTally = tallyBallots(manifest, ballots);
    const partials = ceremony.guardianShares.map((gs) =>
      partiallyDecryptTally(encryptedTally, gs),
    );
    return { ceremony, encryptedTally, partials };
  }

  it('each guardian partial decryption verifies', () => {
    const { ceremony, encryptedTally, partials } = setup();
    for (const partial of partials) {
      const pub = ceremony.guardianShares.find(
        (s) => s.index === partial.guardianIndex,
      )!;
      expect(verifyPartialDecryption(encryptedTally, partial, pub)).toBe(true);
    }
  });

  it('any quorum of 3 guardians decrypts to the true counts', () => {
    const { ceremony, encryptedTally, partials } = setup();
    const subsets = [
      [0, 1, 2],
      [0, 2, 4],
      [2, 3, 4],
    ];
    for (const subset of subsets) {
      const chosen = subset.map((i) => partials[i]);
      const result = combineDecryptionShares(
        encryptedTally,
        chosen,
        ceremony.jointPublicKey,
        3,
      );
      expect(count(result, 'yes')).toBe(4);
      expect(count(result, 'no')).toBe(2);
      expect(count(result, 'abstain')).toBe(1);
      expect(
        verifyThresholdDecryption(
          encryptedTally,
          chosen,
          ceremony.guardianShares,
          result,
          ceremony.jointPublicKey,
          3,
        ),
      ).toBe(true);
    }
  });

  it('a super-quorum of all 5 guardians decrypts identically', () => {
    const { ceremony, encryptedTally, partials } = setup();
    const result = combineDecryptionShares(
      encryptedTally,
      partials,
      ceremony.jointPublicKey,
      3,
    );
    expect(count(result, 'yes')).toBe(4);
    expect(
      verifyThresholdDecryption(
        encryptedTally,
        partials,
        ceremony.guardianShares,
        result,
        ceremony.jointPublicKey,
        3,
      ),
    ).toBe(true);
  });

  it('fewer than the threshold cannot combine', () => {
    const { ceremony, encryptedTally, partials } = setup();
    expect(() =>
      combineDecryptionShares(
        encryptedTally,
        [partials[0], partials[1]],
        ceremony.jointPublicKey,
        3,
      ),
    ).toThrow(/need 3/);
  });

  it('rejects a tampered partial decryption', () => {
    const { ceremony, encryptedTally, partials } = setup();
    const chosen = [partials[0], partials[1], partials[2]];
    const result = combineDecryptionShares(
      encryptedTally,
      chosen,
      ceremony.jointPublicKey,
      3,
    );
    const tampered: GuardianPartialDecryption[] = structuredClone(chosen);
    tampered[0].contests[0].selections[0].share = gPowP(7n);
    expect(
      verifyThresholdDecryption(
        encryptedTally,
        tampered,
        ceremony.guardianShares,
        result,
        ceremony.jointPublicKey,
        3,
      ),
    ).toBe(false);
  });

  it('rejects a partial decryption checked against the wrong guardian', () => {
    const { ceremony, encryptedTally, partials } = setup();
    const wrongPub = ceremony.guardianShares.find(
      (s) => s.index !== partials[0].guardianIndex,
    )!;
    expect(
      verifyPartialDecryption(encryptedTally, partials[0], wrongPub),
    ).toBe(false);
  });
});
