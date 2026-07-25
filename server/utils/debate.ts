/**
 * Debate Threads
 *
 * Real-time threaded discussion attached to a proposal during the
 * deliberation phase. Top-level threads have `parentId = null`; replies
 * point at their parent. Each user gets a single up/down vote per thread,
 * stored in `debate_votes` with a UNIQUE(threadId, userId) constraint —
 * voting twice toggles the vote off, and switching direction replaces it.
 *
 * The denormalized `upvotes` / `downvotes` counters on the thread row are
 * kept in sync inside `voteThread` so list rendering is one-query cheap.
 */

import { db } from '../db';
import {
  debateThreads,
  debateVotes,
  users,
  proposals,
  type DebateThread,
} from '@shared/schema';
import { and, eq, sql } from 'drizzle-orm';
import { DEBATE_ACTIVE_STATES, isProposalState } from '@shared/proposal-lifecycle';

export type VoteDirection = 'up' | 'down';

export { DEBATE_ACTIVE_STATES };

/**
 * Threaded view of a proposal's discussion. `replies` is recursive so the
 * UI can render the full tree from one fetch.
 */
export interface ThreadNode extends DebateThread {
  replies: ThreadNode[];
}

export interface DebateStats {
  totalThreads: number;
  totalUpvotes: number;
  totalDownvotes: number;
  topContributors: { userId: number; name: string; threadCount: number }[];
}

class DebateError extends Error {
  constructor(message: string, public readonly code: 'not_found' | 'closed' | 'invalid') {
    super(message);
    this.name = 'DebateError';
  }
}

export { DebateError };

async function assertProposalDeliberating(proposalId: number): Promise<void> {
  const [proposal] = await db
    .select({ status: proposals.status })
    .from(proposals)
    .where(eq(proposals.id, proposalId));

  if (!proposal) {
    throw new DebateError(`Proposal ${proposalId} not found`, 'not_found');
  }
  if (!isProposalState(proposal.status) || !DEBATE_ACTIVE_STATES.includes(proposal.status)) {
    throw new DebateError(
      `Debate is closed: proposal is in '${proposal.status}', not a deliberation state`,
      'closed',
    );
  }
}

/**
 * Create a top-level thread on a proposal. Throws DebateError('closed')
 * if the proposal is not currently in a deliberation state.
 */
export async function createThread(
  proposalId: number,
  authorId: number,
  content: string,
): Promise<DebateThread> {
  if (!content.trim()) {
    throw new DebateError('Thread content cannot be empty', 'invalid');
  }
  await assertProposalDeliberating(proposalId);

  const [thread] = await db
    .insert(debateThreads)
    .values({ proposalId, authorId, content: content.trim(), parentId: null })
    .returning();

  return thread;
}

/**
 * Reply to an existing thread. The reply inherits the parent's proposal so
 * a single round-trip is enough on the caller side. Throws if the parent
 * does not exist or its proposal is no longer deliberating.
 */
export async function replyToThread(
  parentId: number,
  authorId: number,
  content: string,
): Promise<DebateThread> {
  if (!content.trim()) {
    throw new DebateError('Reply content cannot be empty', 'invalid');
  }

  const [parent] = await db
    .select()
    .from(debateThreads)
    .where(eq(debateThreads.id, parentId));

  if (!parent) {
    throw new DebateError(`Parent thread ${parentId} not found`, 'not_found');
  }

  await assertProposalDeliberating(parent.proposalId);

  const [reply] = await db
    .insert(debateThreads)
    .values({
      proposalId: parent.proposalId,
      authorId,
      parentId,
      content: content.trim(),
    })
    .returning();

  return reply;
}

/**
 * Cast or toggle an up/down vote on a thread.
 *
 * - First vote: insert + increment the matching counter
 * - Same direction again: delete + decrement (toggle off)
 * - Opposite direction: update + swap counters
 *
 * Counters on the thread row are kept in sync atomically with the votes
 * row so list rendering does not need a JOIN. The proposal must still be
 * in a deliberation state — votes on closed debates are rejected.
 */
export async function voteThread(
  threadId: number,
  userId: number,
  direction: VoteDirection,
): Promise<DebateThread> {
  if (direction !== 'up' && direction !== 'down') {
    throw new DebateError(`Invalid vote direction: ${String(direction)}`, 'invalid');
  }

  const [thread] = await db
    .select()
    .from(debateThreads)
    .where(eq(debateThreads.id, threadId));

  if (!thread) {
    throw new DebateError(`Thread ${threadId} not found`, 'not_found');
  }

  await assertProposalDeliberating(thread.proposalId);

  const [existing] = await db
    .select()
    .from(debateVotes)
    .where(and(eq(debateVotes.threadId, threadId), eq(debateVotes.userId, userId)));

  if (!existing) {
    await db.insert(debateVotes).values({ threadId, userId, direction });
    await db
      .update(debateThreads)
      .set(
        direction === 'up'
          ? { upvotes: sql`COALESCE(${debateThreads.upvotes}, 0) + 1` }
          : { downvotes: sql`COALESCE(${debateThreads.downvotes}, 0) + 1` },
      )
      .where(eq(debateThreads.id, threadId));
  } else if (existing.direction === direction) {
    // Toggle off: same user clicked the same arrow twice.
    await db.delete(debateVotes).where(eq(debateVotes.id, existing.id));
    await db
      .update(debateThreads)
      .set(
        direction === 'up'
          ? { upvotes: sql`GREATEST(COALESCE(${debateThreads.upvotes}, 0) - 1, 0)` }
          : { downvotes: sql`GREATEST(COALESCE(${debateThreads.downvotes}, 0) - 1, 0)` },
      )
      .where(eq(debateThreads.id, threadId));
  } else {
    // Switch direction: increment new, decrement old in one update.
    await db.update(debateVotes).set({ direction }).where(eq(debateVotes.id, existing.id));
    await db
      .update(debateThreads)
      .set(
        direction === 'up'
          ? {
              upvotes: sql`COALESCE(${debateThreads.upvotes}, 0) + 1`,
              downvotes: sql`GREATEST(COALESCE(${debateThreads.downvotes}, 0) - 1, 0)`,
            }
          : {
              downvotes: sql`COALESCE(${debateThreads.downvotes}, 0) + 1`,
              upvotes: sql`GREATEST(COALESCE(${debateThreads.upvotes}, 0) - 1, 0)`,
            },
      )
      .where(eq(debateThreads.id, threadId));
  }

  const [updated] = await db
    .select()
    .from(debateThreads)
    .where(eq(debateThreads.id, threadId));
  return updated;
}

/**
 * Fetch all threads for a proposal, nested by parentId. Top-level threads
 * are sorted by net score (upvotes - downvotes) descending; replies inherit
 * the same sort. One DB query, tree built in-memory.
 */
export async function getThreads(proposalId: number): Promise<ThreadNode[]> {
  const rows = await db
    .select()
    .from(debateThreads)
    .where(eq(debateThreads.proposalId, proposalId));

  const nodesById = new Map<number, ThreadNode>();
  for (const row of rows) {
    nodesById.set(row.id, { ...row, replies: [] });
  }

  const roots: ThreadNode[] = [];
  for (const node of nodesById.values()) {
    if (node.parentId === null || node.parentId === undefined) {
      roots.push(node);
    } else {
      const parent = nodesById.get(node.parentId);
      if (parent) {
        parent.replies.push(node);
      } else {
        // Orphaned reply (parent deleted out from under us): surface it as
        // a root so it is not silently lost.
        roots.push(node);
      }
    }
  }

  const score = (n: ThreadNode) => (n.upvotes ?? 0) - (n.downvotes ?? 0);
  const sortRecursive = (nodes: ThreadNode[]) => {
    nodes.sort((a, b) => score(b) - score(a));
    for (const n of nodes) sortRecursive(n.replies);
  };
  sortRecursive(roots);

  return roots;
}

/**
 * Aggregate stats for a proposal's debate. `topContributors` is capped at
 * 5 by default and ranks by thread count (replies + top-levels).
 */
export async function getThreadStats(
  proposalId: number,
  topContributorLimit: number = 5,
): Promise<DebateStats> {
  const [aggregate] = await db
    .select({
      totalThreads: sql<number>`COUNT(*)::int`,
      totalUpvotes: sql<number>`COALESCE(SUM(${debateThreads.upvotes}), 0)::int`,
      totalDownvotes: sql<number>`COALESCE(SUM(${debateThreads.downvotes}), 0)::int`,
    })
    .from(debateThreads)
    .where(eq(debateThreads.proposalId, proposalId));

  const contributors = await db
    .select({
      userId: debateThreads.authorId,
      name: users.name,
      threadCount: sql<number>`COUNT(*)::int`,
    })
    .from(debateThreads)
    .innerJoin(users, eq(users.id, debateThreads.authorId))
    .where(eq(debateThreads.proposalId, proposalId))
    .groupBy(debateThreads.authorId, users.name)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(topContributorLimit);

  return {
    totalThreads: aggregate?.totalThreads ?? 0,
    totalUpvotes: aggregate?.totalUpvotes ?? 0,
    totalDownvotes: aggregate?.totalDownvotes ?? 0,
    topContributors: contributors,
  };
}
