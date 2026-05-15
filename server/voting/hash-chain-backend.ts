/**
 * HashChainBackend — the default VotingBackend.
 *
 * Wraps server/utils/vote-chain.ts. Provides tamper-evident inclusion (any
 * post-hoc edit to a recorded vote breaks the per-proposal SHA-256 chain
 * and `verify` surfaces the first broken row).
 *
 * What this backend does NOT do:
 *   - Hide individual votes (votes are stored in cleartext in the DB).
 *   - Defend against host-side ballot stuffing (no signature check).
 *   - Defend against the server itself rewriting the whole chain.
 *
 * Those properties require a different backend (Helios-style threshold
 * decryption + voter-side signatures). The seam is the VotingBackend
 * interface, not this file.
 */

import { eq, isNull, and, count } from 'drizzle-orm';
import { db } from '../db';
import { proposalVotes } from '@shared/schema';
import {
  castProposalVoteWithChain,
  getChainHead,
  verifyChain,
} from '../utils/vote-chain';
import type {
  BallotReceipt,
  CastBallotInput,
  ElectionProof,
  ElectionTally,
  VerificationResult,
  VotingBackend,
} from './types';

const NAME = 'hash-chain';

export class HashChainBackend implements VotingBackend {
  readonly name = NAME;

  async startElection(_args: { proposalId: number }): Promise<void> {
    // The chain is implicit: the first vote is genesis-linked. No setup.
  }

  async castSignedBallot(input: CastBallotInput): Promise<BallotReceipt> {
    // input.signature is accepted but unused — the chain backend offers
    // no cryptographic identity binding. A future backend will verify it.
    const result = await castProposalVoteWithChain({
      proposalId: input.proposalId,
      userId: input.userId,
      choice: input.choice,
    });
    return {
      voteId: result.id,
      backend: NAME,
      payload: {
        rowHash: result.receipt.rowHash,
        prevHash: result.receipt.prevHash,
        castAt: result.receipt.castAt,
      },
    };
  }

  async getTally(args: { proposalId: number }): Promise<ElectionTally> {
    const rows = await db
      .select({ choice: proposalVotes.choice, count: count() })
      .from(proposalVotes)
      .where(and(
        eq(proposalVotes.proposalId, args.proposalId),
        isNull(proposalVotes.supersededById),
      ))
      .groupBy(proposalVotes.choice);

    const tally: ElectionTally = { yes: 0, no: 0, abstain: 0, total: 0 };
    for (const r of rows) {
      if (r.choice === 'yes') tally.yes = r.count;
      else if (r.choice === 'no') tally.no = r.count;
      else if (r.choice === 'abstain') tally.abstain = r.count;
    }
    tally.total = tally.yes + tally.no + tally.abstain;
    return tally;
  }

  async getProof(args: { proposalId: number }): Promise<ElectionProof> {
    const head = await getChainHead(args.proposalId);
    return {
      backend: NAME,
      payload: {
        headHash: head.headHash,
        total: head.total,
        lastCastAt: head.lastCastAt,
      },
    };
  }

  async closeAndTally(args: { proposalId: number }): Promise<ElectionTally & { proof: ElectionProof }> {
    // Hash chain has no separate close step; the head at close time IS
    // the final proof. Communities that want trustee-decryption semantics
    // use a different backend.
    const [tally, proof] = await Promise.all([
      this.getTally(args),
      this.getProof(args),
    ]);
    return { ...tally, proof };
  }

  async verify(args: { proposalId: number }): Promise<VerificationResult> {
    const result = await verifyChain(args.proposalId);
    return {
      ok: result.ok,
      backend: NAME,
      firstBreakAt: result.firstBreakAt,
      payload: { headHash: result.headHash, total: result.total },
    };
  }
}
