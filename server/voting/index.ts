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
import { ElectionGuardBackend } from './electionguard-backend';
import type { VotingBackend } from './types';

export type BackendName = 'hash-chain' | 'electionguard';

let cached: VotingBackend | null = null;

export function getVotingBackend(): VotingBackend {
  if (cached) return cached;

  const name = (process.env.VOTING_BACKEND ?? 'hash-chain') as BackendName;
  switch (name) {
    case 'hash-chain':
      cached = new HashChainBackend();
      return cached;

    case 'electionguard':
      // ElGamal-encrypted ballots with ZK validity proofs, a homomorphic
      // tally and threshold-trustee decryption, via the `@agorax/voting`
      // SDK (ElectionGuard 2.1). Development backend — see
      // electionguard-backend.ts for the not-for-binding-elections caveats.
      //
      // Hard production block: per docs/compliance/01_VOTE_LINKAGE_AUDIT.md
      // this backend does NOT deliver vote privacy (server holds guardian
      // secrets + encrypts server-side + ballot row still binds user_id).
      // Allowing it in production would misrepresent the security property.
      // Re-enable only after SDK Phase 6+7 ship AND the ballot-schema
      // refactor lands AND an independent cryptographer review signs off.
      if (process.env.APP_ENV === 'production') {
        throw new Error(
          'VOTING_BACKEND=electionguard is dev/demo only and is blocked in production. ' +
          'See docs/compliance/01_VOTE_LINKAGE_AUDIT.md for the privacy gates that must clear first.',
        );
      }
      cached = new ElectionGuardBackend();
      return cached;

    default:
      throw new Error(`Unknown VOTING_BACKEND: ${name}`);
  }
}

export type { VotingBackend, BallotReceipt, BallotSignature, CastBallotInput, ElectionProof, ElectionTally, VerificationResult, VoteChoice, VoterView } from './types';
