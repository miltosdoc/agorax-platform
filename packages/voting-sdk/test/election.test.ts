/**
 * Phase 2 — an end-to-end election: manifest → encrypted ballots →
 * homomorphic tally → verifiable decryption.
 */

import { describe, expect, it } from 'vitest';
import {
  agoraxRatificationManifest,
  decryptTally,
  encryptBallot,
  generateKeyPair,
  multModP,
  ratificationBallot,
  tallyBallots,
  verifyBallot,
  verifyDecryptedTally,
  G,
} from '../src/index.ts';
import type { CiphertextBallot, ElementModP, PlaintextBallot } from '../src/index.ts';

/** Count for a selection within a decrypted contest. */
function count(
  decrypted: ReturnType<typeof decryptTally>,
  selectionId: string,
): number {
  const sel = decrypted.contests[0].selections.find(
    (s) => s.selectionId === selectionId,
  );
  if (!sel) throw new Error(`no selection ${selectionId}`);
  return sel.tally;
}

describe('end-to-end ratification election', () => {
  const manifest = agoraxRatificationManifest('proposal-42');
  const choices: ('yes' | 'no' | 'abstain')[] = [
    'yes', 'yes', 'yes', 'yes', 'yes', // 5 yes
    'no', 'no', 'no', // 3 no
    'abstain', 'abstain', // 2 abstain
  ];

  it('encrypts, verifies, tallies and decrypts to the true counts', () => {
    const keyPair = generateKeyPair();

    const ballots = choices.map((choice, i) => {
      const ballot = encryptBallot(
        manifest,
        ratificationBallot(`ballot-${i}`, choice),
        keyPair.publicKey,
      );
      // Every honest ballot verifies.
      expect(verifyBallot(manifest, ballot, keyPair.publicKey)).toBe(true);
      return ballot;
    });

    const encryptedTally = tallyBallots(manifest, ballots);
    expect(encryptedTally.ballotCount).toBe(choices.length);

    const decrypted = decryptTally(encryptedTally, keyPair);
    expect(count(decrypted, 'yes')).toBe(5);
    expect(count(decrypted, 'no')).toBe(3);
    expect(count(decrypted, 'abstain')).toBe(2);

    // The whole result is publicly verifiable.
    expect(
      verifyDecryptedTally(encryptedTally, decrypted, keyPair.publicKey),
    ).toBe(true);
  });

  it('rejects a ballot whose plaintext over-votes', () => {
    const keyPair = generateKeyPair();
    const overvote: PlaintextBallot = {
      ballotId: 'bad',
      contests: [
        {
          contestId: 'ratification',
          selections: [
            { selectionId: 'yes', vote: 1 },
            { selectionId: 'no', vote: 1 },
            { selectionId: 'abstain', vote: 0 },
          ],
        },
      ],
    };
    expect(() =>
      encryptBallot(manifest, overvote, keyPair.publicKey),
    ).toThrow(/chooses 2/);
  });

  it('rejects a ballot with a tampered ciphertext', () => {
    const keyPair = generateKeyPair();
    const ballot = encryptBallot(
      manifest,
      ratificationBallot('b', 'yes'),
      keyPair.publicKey,
    );
    const tampered: CiphertextBallot = structuredClone(ballot);
    const sel = tampered.contests[0].selections[0];
    sel.ciphertext = {
      alpha: sel.ciphertext.alpha,
      beta: multModP(sel.ciphertext.beta, G) as ElementModP,
    };
    expect(verifyBallot(manifest, tampered, keyPair.publicKey)).toBe(false);
  });

  it('rejects a ballot under the wrong election key', () => {
    const keyPair = generateKeyPair();
    const other = generateKeyPair();
    const ballot = encryptBallot(
      manifest,
      ratificationBallot('b', 'no'),
      keyPair.publicKey,
    );
    expect(verifyBallot(manifest, ballot, other.publicKey)).toBe(false);
  });
});

describe('decryption verification', () => {
  const manifest = agoraxRatificationManifest('proposal-7');

  function fixture() {
    const keyPair = generateKeyPair();
    const ballots = (['yes', 'no', 'yes'] as const).map((c, i) =>
      encryptBallot(manifest, ratificationBallot(`b${i}`, c), keyPair.publicKey),
    );
    return { keyPair, encryptedTally: tallyBallots(manifest, ballots) };
  }

  it('rejects a decrypted tally with a wrong count', () => {
    const { keyPair, encryptedTally } = fixture();
    const decrypted = decryptTally(encryptedTally, keyPair);
    const tampered = structuredClone(decrypted);
    tampered.contests[0].selections[0].tally += 1; // lie about the count
    expect(
      verifyDecryptedTally(encryptedTally, tampered, keyPair.publicKey),
    ).toBe(false);
  });

  it('rejects a decryption verified under the wrong key', () => {
    const { keyPair, encryptedTally } = fixture();
    const decrypted = decryptTally(encryptedTally, keyPair);
    const wrongKey = generateKeyPair().publicKey;
    expect(
      verifyDecryptedTally(encryptedTally, decrypted, wrongKey),
    ).toBe(false);
  });

  it('rejects a tampered decryption share', () => {
    const { keyPair, encryptedTally } = fixture();
    const decrypted = decryptTally(encryptedTally, keyPair);
    const tampered = structuredClone(decrypted);
    const sel = tampered.contests[0].selections[0];
    sel.decryptionShare = multModP(sel.decryptionShare, G) as ElementModP;
    expect(
      verifyDecryptedTally(encryptedTally, tampered, keyPair.publicKey),
    ).toBe(false);
  });
});
