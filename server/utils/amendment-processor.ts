/**
 * Amendment Processor v2
 * 
 * Handles the author-as-editor amendment flow:
 * 
 * 1. Author reviews each amendment → accepts or rejects with reason
 * 2. Rejected amendments go to community signal (⬆️/⬇️ votes)
 * 3. Flagged amendments (exceeding community threshold) go to sortition
 * 4. Sortition body composes final text using author draft + flagged amendments
 * 
 * This module provides:
 * - Author review logic (accept/reject with reason)
 * - Community signal calculation (net score, threshold check)
 * - Flagged amendment identification
 * - Final text composition helper
 */

import { db } from '../db';
import { proposalAmendments, amendmentRejectionVotes, proposals, communities } from '../../shared/schema';
import { eq, and, sql } from 'drizzle-orm';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AmendmentReview {
  id: number;
  proposalId: number;
  authorId: number;
  type: string;
  text: string;
  authorDecision: 'accepted' | 'rejected' | null;
  authorReason: string | null;
  rejectionUpvotes: number | null;
  rejectionDownvotes: number | null;
  llmScore: number | null;
  createdAt: Date;
}

export interface CommunitySignal {
  amendmentId: number;
  upvotes: number;
  downvotes: number;
  netScore: number;
  totalVotes: number;
  ratio: number;       // netScore / totalVotes
  flagged: boolean;    // ratio >= community threshold
  threshold: number;   // community's configured threshold
}

export interface SortitionInput {
  authorDraft: string;       // Original proposal with accepted amendments merged
  flaggedAmendments: AmendmentReview[];  // Rejected amendments that exceeded threshold
  community: {
    id: number;
    name: string;
    amendmentThreshold: number;
  };
}

// ─── Author Review ──────────────────────────────────────────────────────────

/**
 * Author accepts or rejects an amendment.
 * 
 * - Accepted: amendment is merged into the proposal text
 * - Rejected: amendment goes to community signal phase
 * 
 * @param amendmentId - The amendment to review
 * @param decision - 'accepted' or 'rejected'
 * @param reason - Author's justification (required for rejection)
 */
export async function authorReviewAmendment(
  amendmentId: number,
  decision: 'accepted' | 'rejected',
  reason?: string,
): Promise<void> {
  const updates: Record<string, any> = {
    authorDecision: decision,
  };
  
  if (decision === 'rejected') {
    updates.authorReason = reason || '';
  }
  
  await db.update(proposalAmendments)
    .set(updates)
    .where(eq(proposalAmendments.id, amendmentId));
}

/**
 * Get all amendments for a proposal that need author review.
 */
export async function getPendingAmendments(proposalId: number): Promise<AmendmentReview[]> {
  const amendments = await db.query.proposalAmendments.findMany({
    where: eq(proposalAmendments.proposalId, proposalId),
  });
  
  return amendments.map(a => ({
    id: a.id,
    proposalId: a.proposalId,
    authorId: a.authorId,
    type: a.type,
    text: a.text,
    authorDecision: a.authorDecision as 'accepted' | 'rejected' | null,
    authorReason: a.authorReason,
    rejectionUpvotes: a.rejectionUpvotes,
    rejectionDownvotes: a.rejectionDownvotes,
    llmScore: a.llmScore ? parseFloat(a.llmScore.toString()) : null,
    createdAt: a.createdAt,
  }));
}

// ─── Community Signal ───────────────────────────────────────────────────────

/**
 * Cast a community vote on a rejected amendment.
 * 
 * @param amendmentId - The amendment to vote on
 * @param userId - The voter
 * @param vote - +1 (disagree with rejection) or -1 (agree with rejection)
 */
export async function castRejectionVote(
  amendmentId: number,
  userId: number,
  vote: 1 | -1,
): Promise<void> {
  // Check if user already voted
  const existing = await db.query.amendmentRejectionVotes.findFirst({
    where: and(
      eq(amendmentRejectionVotes.amendmentId, amendmentId),
      eq(amendmentRejectionVotes.userId, userId),
    ),
  });
  
  if (existing) {
    // Update existing vote
    await db.update(amendmentRejectionVotes)
      .set({ vote })
      .where(eq(amendmentRejectionVotes.id, existing.id));
  } else {
    // Create new vote
    await db.insert(amendmentRejectionVotes).values({
      amendmentId,
      userId,
      vote,
    });
  }
  
  // Recalculate totals
  await recalculateAmendmentVotes(amendmentId);

  // Democracy Points: one award per (voter, amendment) — idempotent, so
  // changing a vote does not re-award.
  const { awardPoints } = await import('../economy/points');
  await awardPoints({
    userId,
    actionKey: 'signal_vote',
    refType: 'amendment',
    refId: amendmentId,
  });
}

/**
 * Recalculate upvote/downvote totals for an amendment.
 */
async function recalculateAmendmentVotes(amendmentId: number): Promise<void> {
  const votes = await db.query.amendmentRejectionVotes.findMany({
    where: eq(amendmentRejectionVotes.amendmentId, amendmentId),
  });
  
  let upvotes = 0;
  let downvotes = 0;
  
  for (const v of votes) {
    if (v.vote === 1) upvotes++;
    else downvotes++;
  }
  
  await db.update(proposalAmendments)
    .set({
      rejectionUpvotes: upvotes,
      rejectionDownvotes: downvotes,
    })
    .where(eq(proposalAmendments.id, amendmentId));
}

/**
 * Calculate community signal for all rejected amendments of a proposal.
 * 
 * Returns the signal data for each amendment, including whether it's flagged.
 */
export async function calculateCommunitySignals(
  proposalId: number,
  communityId: number,
): Promise<CommunitySignal[]> {
  // Get community threshold
  const community = await db.query.communities.findFirst({
    where: eq(communities.id, communityId),
  });
  
  if (!community) {
    throw new Error(`Community ${communityId} not found`);
  }
  
  const threshold = parseFloat(community.amendmentThreshold?.toString() || '0.5');
  
  // Get all rejected amendments for this proposal
  const amendments = await db.query.proposalAmendments.findMany({
    where: and(
      eq(proposalAmendments.proposalId, proposalId),
      eq(proposalAmendments.authorDecision, 'rejected'),
    ),
  });
  
  return amendments.map(a => {
    const upvotes = a.rejectionUpvotes || 0;
    const downvotes = a.rejectionDownvotes || 0;
    const netScore = upvotes - downvotes;
    const totalVotes = upvotes + downvotes;
    const ratio = totalVotes > 0 ? netScore / totalVotes : 0;
    
    return {
      amendmentId: a.id,
      upvotes,
      downvotes,
      netScore,
      totalVotes,
      ratio,
      flagged: ratio >= threshold && totalVotes >= 3, // minimum 3 votes to flag
      threshold,
    };
  });
}

/**
 * Get flagged amendments for sortition input.
 */
export async function getFlaggedAmendments(
  proposalId: number,
  communityId: number,
): Promise<AmendmentReview[]> {
  const signals = await calculateCommunitySignals(proposalId, communityId);
  const flaggedIds = signals.filter(s => s.flagged).map(s => s.amendmentId);
  
  if (flaggedIds.length === 0) {
    return [];
  }
  
  const amendments = await db.query.proposalAmendments.findMany({
    where: and(
      eq(proposalAmendments.proposalId, proposalId),
      sql`${proposalAmendments.id} IN (${flaggedIds.join(',')})`,
    ),
  });
  
  return amendments.map(a => ({
    id: a.id,
    proposalId: a.proposalId,
    authorId: a.authorId,
    type: a.type,
    text: a.text,
    authorDecision: a.authorDecision as 'accepted' | 'rejected' | null,
    authorReason: a.authorReason,
    rejectionUpvotes: a.rejectionUpvotes,
    rejectionDownvotes: a.rejectionDownvotes,
    llmScore: a.llmScore ? parseFloat(a.llmScore.toString()) : null,
    createdAt: a.createdAt,
  }));
}

// ─── Sortition Input ────────────────────────────────────────────────────────

/**
 * Build the sortition input package.
 * 
 * Contains:
 * - Author's draft with accepted amendments merged
 * - Flagged amendments (rejected by author but flagged by community)
 * - Community config
 */
export async function buildSortitionInput(
  proposalId: number,
  communityId: number,
): Promise<SortitionInput> {
  const proposal = await db.query.proposals.findFirst({
    where: eq(proposals.id, proposalId),
  });
  
  if (!proposal) {
    throw new Error(`Proposal ${proposalId} not found`);
  }
  
  const community = await db.query.communities.findFirst({
    where: eq(communities.id, communityId),
  });
  
  if (!community) {
    throw new Error(`Community ${communityId} not found`);
  }
  
  // Get accepted amendments and merge into author draft
  const amendments = await getPendingAmendments(proposalId);
  const accepted = amendments.filter(a => a.authorDecision === 'accepted');
  
  let authorDraft = proposal.solution;
  for (const amendment of accepted) {
    authorDraft += `\n\n[Αποδεκτή βελτίωση] ${amendment.text}`;
  }
  
  // Get flagged amendments
  const flagged = await getFlaggedAmendments(proposalId, communityId);
  
  return {
    authorDraft,
    flaggedAmendments: flagged,
    community: {
      id: community.id,
      name: community.name,
      amendmentThreshold: parseFloat(community.amendmentThreshold?.toString() || '0.5'),
    },
  };
}

// ─── Final Text ─────────────────────────────────────────────────────────────

/**
 * Save the sortition body's composed final text to the proposal.
 * 
 * Called when sortition body submits their version.
 */
export async function saveFinalText(
  proposalId: number,
  finalText: string,
): Promise<void> {
  // Update the proposal with the final synthesized text
  await db.update(proposals)
    .set({
      finalText,
      updatedAt: new Date(),
    })
    .where(eq(proposals.id, proposalId));

  // Auto-transition: sortition_synthesis → voting
  // When the sortition body finalizes their text, the proposal moves to voting.
  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, proposalId));
  if (proposal && proposal.status === 'sortition_synthesis') {
    const { transitionProposal, triggerSideEffects } = await import('./proposal-state-machine');
    const storage = (await import('../storage')).storage;
    const updated = await transitionProposal(proposal, 'voting', storage);
    await triggerSideEffects('sortition_synthesis', 'voting', updated);
  }
}