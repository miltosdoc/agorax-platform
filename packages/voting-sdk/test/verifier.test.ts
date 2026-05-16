/**
 * Phase 4 — the public verifier over a complete election record.
 */

import { describe, expect, it } from 'vitest';
import {
  agoraxRatificationManifest,
  combineDecryptionShares,
  encryptBallot,
  gPowP,
  partiallyDecryptTally,
  ratificationBallot,
  runKeyCeremony,
  tallyBallots,
  verifyElectionRecord,
} from '../src/index.ts';
import type { ElectionRecord } from '../src/index.ts';

const manifest = agoraxRatificationManifest('proposal-record');
const choices: ('yes' | 'no' | 'abstain')[] = [
  'yes', 'yes', 'yes', 'no', 'no', 'abstain',
];

/** Assemble a complete, honest election record. */
function buildRecord(): ElectionRecord {
  const ceremony = runKeyCeremony(3, 5);
  const ballots = choices.map((choice, i) =>
    encryptBallot(
      manifest,
      ratificationBallot(`b${i}`, choice),
      ceremony.jointPublicKey,
    ),
  );
  const encryptedTally = tallyBallots(manifest, ballots);
  const partialDecryptions = [0, 1, 2].map((i) =>
    partiallyDecryptTally(encryptedTally, ceremony.guardianShares[i]),
  );
  const result = combineDecryptionShares(
    encryptedTally,
    partialDecryptions,
    ceremony.jointPublicKey,
    3,
  );
  return {
    manifest,
    threshold: 3,
    guardianCount: 5,
    jointPublicKey: ceremony.jointPublicKey,
    guardianCommitments: ceremony.guardianCommitments,
    ballots,
    encryptedTally,
    partialDecryptions,
    result,
  };
}

/** Whether a named check passed in a report. */
function checkPassed(
  report: ReturnType<typeof verifyElectionRecord>,
  name: string,
): boolean {
  const c = report.checks.find((x) => x.name === name);
  if (!c) throw new Error(`no check named "${name}"`);
  return c.ok;
}

describe('verifyElectionRecord', () => {
  it('accepts an honest election record', () => {
    const report = verifyElectionRecord(buildRecord());
    expect(report.checks.every((c) => c.ok)).toBe(true);
    expect(report.ok).toBe(true);
  });

  it('rejects a tampered joint public key', () => {
    const record = structuredClone(buildRecord());
    record.jointPublicKey = gPowP(999n);
    const report = verifyElectionRecord(record);
    expect(report.ok).toBe(false);
    expect(
      checkPassed(report, 'joint public key is the product of guardian commitments'),
    ).toBe(false);
  });

  it('rejects a tampered announced count', () => {
    const record = structuredClone(buildRecord());
    record.result.contests[0].selections[0].tally += 1;
    const report = verifyElectionRecord(record);
    expect(report.ok).toBe(false);
    expect(checkPassed(report, 'threshold decryption is valid')).toBe(false);
  });

  it('rejects an encrypted tally that does not match the ballots', () => {
    const record = structuredClone(buildRecord());
    const sel = record.encryptedTally.contests[0].selections[0];
    sel.ciphertext = { alpha: sel.ciphertext.alpha, beta: gPowP(3n) };
    const report = verifyElectionRecord(record);
    expect(report.ok).toBe(false);
    expect(
      checkPassed(
        report,
        'encrypted tally is the homomorphic aggregate of the ballots',
      ),
    ).toBe(false);
  });

  it('rejects a record with a dropped ballot', () => {
    const record = structuredClone(buildRecord());
    record.ballots.pop(); // tally still claims the original ballotCount
    const report = verifyElectionRecord(record);
    expect(report.ok).toBe(false);
    expect(checkPassed(report, 'every cast ballot is valid')).toBe(false);
  });

  it('rejects a ballot-stuffed record', () => {
    // Add an extra ballot to both the ballot list and the encrypted tally,
    // so counts line up — but the stuffed ballot's own proofs still hold,
    // while the announced result no longer matches.
    const record = structuredClone(buildRecord());
    const honest = verifyElectionRecord(record);
    expect(honest.ok).toBe(true);
    // Flip one selection's count without touching anything else.
    record.result.contests[0].selections[1].tally += 1;
    record.result.contests[0].selections[0].tally -= 1;
    expect(verifyElectionRecord(record).ok).toBe(false);
  });
});
