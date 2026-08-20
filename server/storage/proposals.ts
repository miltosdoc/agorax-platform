/**
 * Proposal Repository
 *
 * Handles proposal lifecycle: CRUD, state transitions, LLM validation,
 * support/oppose voting, and category management.
 */

import { db } from '../db';
import { proposals, proposalSupport, proposalVotes, type Proposal, type InsertProposal, type ProposalSupport, type ProposalVote } from '../../shared/schema';
import { eq, and, desc, ilike, isNull, sql, count } from 'drizzle-orm';
import { isProposalState } from '../../shared/proposal-lifecycle';
import { castProposalVoteWithChain, type VoteReceipt } from '../utils/vote-chain';

export class ProposalRepository {

  /** Create a new proposal. */
  async createProposal(insertProposal: InsertProposal): Promise<Proposal> {
    const [proposal] = await db
      .insert(proposals)
      .values(insertProposal)
      .returning();
    return proposal;
  }

  /** Get a proposal by ID. */
  async getProposal(id: number): Promise<Proposal | undefined> {
    const [proposal] = await db
      .select()
      .from(proposals)
      .where(eq(proposals.id, id));
    return proposal;
  }

  /** Get proposals for a community with optional filters. */
  async getProposals(communityId: number, filters?: { status?: string; category?: string }): Promise<Proposal[]> {
    const conditions = [eq(proposals.communityId, communityId)];
    if (filters?.status) {
      conditions.push(eq(proposals.status, filters.status));
    }
    if (filters?.category) {
      conditions.push(eq(proposals.category, filters.category));
    }
    return await db
      .select()
      .from(proposals)
      .where(and(...conditions))
      .orderBy(desc(proposals.createdAt));
  }

  /** Update a proposal. */
  async updateProposal(id: number, updates: Partial<Proposal>): Promise<Proposal> {
    const [proposal] = await db
      .update(proposals)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(proposals.id, id))
      .returning();
    if (!proposal) throw new Error("Proposal not found");
    return proposal;
  }

  /** Delete a proposal. Caller must enforce status/author rules. */
  async deleteProposal(id: number): Promise<void> {
    await db.delete(proposals).where(eq(proposals.id, id));
  }

  /** Transition proposal to a new state. */
  async transitionProposalState(id: number, newState: string): Promise<Proposal> {
    if (!isProposalState(newState)) {
      throw new Error(`Invalid proposal state: ${newState}`);
    }
    const [proposal] = await db
      .update(proposals)
      .set({ status: newState, updatedAt: new Date() })
      .where(eq(proposals.id, id))
      .returning();
    if (!proposal) throw new Error("Proposal not found");
    return proposal;
  }

  /** Get all proposals (globally). */
  async getAllProposals(limit?: number): Promise<Proposal[]> {
    const query = db
      .select()
      .from(proposals)
      .orderBy(desc(proposals.createdAt));
    if (limit) {
      query.limit(limit);
    }
    return await query;
  }

  /** Search proposals by text. */
  async searchProposals(query: string, limit = 10): Promise<Proposal[]> {
    return await db
      .select()
      .from(proposals)
      .where(ilike(proposals.question, `%${query}%`))
      .limit(limit)
      .orderBy(desc(proposals.createdAt));
  }

  /** Get proposal support counts. */
  async getProposalSupport(proposalId: number, userId?: number): Promise<{ support: number; oppose: number; userVote?: string }> {
    const supports = await db
      .select({ count: count() })
      .from(proposalSupport)
      .where(and(
        eq(proposalSupport.proposalId, proposalId),
        eq(proposalSupport.type, 'support')
      ));
    
    const opposes = await db
      .select({ count: count() })
      .from(proposalSupport)
      .where(and(
        eq(proposalSupport.proposalId, proposalId),
        eq(proposalSupport.type, 'oppose')
      ));

    const result: { support: number; oppose: number; userVote?: string } = {
      support: supports[0]?.count || 0,
      oppose: opposes[0]?.count || 0
    };

    if (userId) {
      const [userVote] = await db
        .select()
        .from(proposalSupport)
        .where(and(
          eq(proposalSupport.proposalId, proposalId),
          eq(proposalSupport.userId, userId)
        ));
      if (userVote) {
        result.userVote = userVote.type;
      }
    }

    return result;
  }

  /**
   * Cast a final ratification vote. Append-only: re-voting inserts a new row
   * and supersedes the prior one via the hash-chain helper.
   */
  async castProposalVote(proposalId: number, userId: number, choice: string): Promise<ProposalVote & { receipt: VoteReceipt }> {
    return await castProposalVoteWithChain({ proposalId, userId, choice });
  }

  /** Get the user's current (non-superseded) vote on a proposal. */
  async getUserProposalVote(proposalId: number, userId: number): Promise<ProposalVote | undefined> {
    const [vote] = await db
      .select()
      .from(proposalVotes)
      .where(and(
        eq(proposalVotes.proposalId, proposalId),
        eq(proposalVotes.userId, userId),
        isNull(proposalVotes.supersededById),
      ));
    return vote;
  }

  /** Get proposal vote results. */
  async getProposalVoteResults(proposalId: number): Promise<{
    yes: number;
    no: number;
    abstain: number;
    total: number;
    participants: number;
    participationPct: number;
    passes: boolean;
    meetsQuorum: boolean;
    minParticipationPct: number;
  }> {
    const { communityMembers, communities } = await import('../../shared/schema');

    const proposal = await this.getProposal(proposalId);
    if (!proposal) {
      return {
        yes: 0, no: 0, abstain: 0, total: 0,
        participants: 0, participationPct: 0,
        passes: false, meetsQuorum: false, minParticipationPct: 0,
      };
    }

    const tallies = await db
      .select({ choice: proposalVotes.choice, count: count() })
      .from(proposalVotes)
      .where(and(
        eq(proposalVotes.proposalId, proposalId),
        isNull(proposalVotes.supersededById),
      ))
      .groupBy(proposalVotes.choice);

    const yes = tallies.find(t => t.choice === 'yes')?.count ?? 0;
    const no = tallies.find(t => t.choice === 'no')?.count ?? 0;
    const abstain = tallies.find(t => t.choice === 'abstain')?.count ?? 0;
    const total = yes + no + abstain;

    const [community] = await db
      .select({ minParticipationPct: communities.minParticipationPct })
      .from(communities)
      .where(eq(communities.id, proposal.communityId));
    const minParticipationPct = Number(community?.minParticipationPct ?? 0);

    const [memberRow] = await db
      .select({ count: count() })
      .from(communityMembers)
      .where(eq(communityMembers.communityId, proposal.communityId));
    const memberCount = memberRow?.count ?? 0;

    const participants = total;
    const participationPct = memberCount > 0 ? participants / memberCount : 0;
    const meetsQuorum = participationPct >= minParticipationPct;
    const passes = meetsQuorum && (yes + no) > 0 && yes > no;

    return {
      yes, no, abstain, total,
      participants, participationPct,
      passes, meetsQuorum, minParticipationPct,
    };
  }

}

