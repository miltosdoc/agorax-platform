/**
 * Voting backend registry.
 *
 * Selects the configured VotingBackend at startup. Routes/seed call
 * `getVotingBackend()` and treat the result as an opaque interface — no
 * one outside this folder names a specific backend.
 *
 * Configured via the `VOTING_BACKEND` env var. Default: 'hash-chain'.
 *
 * Adding a backend: write a class implementing VotingBackend, register it
 * in the switch below, and document it in the README.
 */

import { HashChainBackend } from './hash-chain-backend';
import type { VotingBackend } from './types';

export type BackendName = 'hash-chain' | 'helios';

let cached: VotingBackend | null = null;

export function getVotingBackend(): VotingBackend {
  if (cached) return cached;

  const name = (process.env.VOTING_BACKEND ?? 'hash-chain') as BackendName;
  switch (name) {
    case 'hash-chain':
      cached = new HashChainBackend();
      return cached;

    case 'helios':
      // Reserved: ElGamal-encrypted ballots with threshold-trustee
      // decryption (Ben Adida's Helios protocol). Implementation lands
      // when we're ready to run a Python sidecar OR have a vetted JS port.
      throw new Error(
        "VOTING_BACKEND='helios' is reserved; backend not yet implemented",
      );

    default:
      throw new Error(`Unknown VOTING_BACKEND: ${name}`);
  }
}

export type { VotingBackend, BallotReceipt, BallotSignature, CastBallotInput, ElectionProof, ElectionTally, VerificationResult, VoteChoice } from './types';
