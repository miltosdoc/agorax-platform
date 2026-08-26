/**
 * Community Forum Repository
 *
 * Topics and replies that belong to a community rather than to a proposal.
 *
 * Everything that decides *what a reader is allowed to see* lives in the
 * router; this file only reads and writes rows. The one exception is the
 * tombstone: `toView` strips the text of a hidden or deleted post here, at
 * the single point every read passes through, rather than trusting each
 * caller to remember. A moderation decision that leaks through one forgotten
 * endpoint is not a moderation decision.
 */

import { db } from '../db';
import {
  communityPosts,
  communityPostVotes,
  communityPostFlags,
  users,
  type CommunityPost,
} from '../../shared/schema';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { shouldHideByFlags, type FlagDirection, type FlagTally } from '../../shared/forum-moderation';

export interface ForumAuthor {
  id: number;
  username: string;
  name: string | null;
  profilePicture: string | null;
}

export interface ForumPostView {
  id: number;
  communityId: number;
  parentId: number | null;
  title: string | null;
  content: string;
  author: ForumAuthor | null;
  upvotes: number;
  downvotes: number;
  replyCount: number;
  pinned: boolean;
  score: number;
  yourVote: 'up' | 'down' | null;
  yourFlag: FlagDirection | null;
  flags: FlagTally;
  /** 'hidden' — taken down; 'deleted' — withdrawn by its author. */
  removed: 'hidden' | 'deleted' | null;
  hiddenReason: string | null;
  hiddenByMembers: boolean;
  promotedProposalId: number | null;
  lastActivityAt: string;
  createdAt: string;
  editedAt: string | null;
}

type Row = CommunityPost & { author?: ForumAuthor | null };

const iso = (value: unknown): string =>
  value instanceof Date ? value.toISOString() : String(value ?? '');

export class CommunityForumRepository {
  /**
   * Row → what a reader receives. The text of a removed post never leaves
   * this function, for anyone: an administrator who wants to know what was
   * said has the database, and a member who wants to know has the reason.
   */
  private toView(
    row: Row,
    ctx: { vote?: 'up' | 'down' | null; flag?: FlagDirection | null; tally?: FlagTally },
  ): ForumPostView {
    const removed: 'hidden' | 'deleted' | null =
      row.deletedAt ? 'deleted' : row.hiddenAt ? 'hidden' : null;
    const tally = ctx.tally ?? { hide: 0, keep: 0 };
    return {
      id: row.id,
      communityId: row.communityId,
      parentId: row.parentId ?? null,
      title: removed ? null : row.title ?? null,
      content: removed ? '' : row.content,
      author: removed === 'deleted' ? null : row.author ?? null,
      upvotes: row.upvotes ?? 0,
      downvotes: row.downvotes ?? 0,
      replyCount: row.replyCount ?? 0,
      pinned: !!row.pinned,
      score: (row.upvotes ?? 0) - (row.downvotes ?? 0),
      yourVote: ctx.vote ?? null,
      yourFlag: ctx.flag ?? null,
      flags: tally,
      removed,
      // Only meaningful once removed, and only ever the stated reason.
      hiddenReason: removed === 'hidden' ? row.hiddenReason ?? null : null,
      hiddenByMembers: removed === 'hidden' && row.hiddenBy == null,
      promotedProposalId: row.promotedProposalId ?? null,
      lastActivityAt: iso(row.lastActivityAt),
      createdAt: iso(row.createdAt),
      // A post edited within the same second as its creation was not edited.
      editedAt:
        row.updatedAt && row.createdAt && iso(row.updatedAt) !== iso(row.createdAt)
          ? iso(row.updatedAt)
          : null,
    };
  }

  private authorColumns() {
    return {
      id: users.id,
      username: users.username,
      name: users.name,
      profilePicture: users.profilePicture,
    };
  }

  /** Flag tallies for a set of posts, in one query. */
  private async flagTallies(postIds: number[]): Promise<Map<number, FlagTally>> {
    const out = new Map<number, FlagTally>();
    if (postIds.length === 0) return out;
    const rows = await db
      .select({
        postId: communityPostFlags.postId,
        direction: communityPostFlags.direction,
        count: sql<number>`count(*)::int`,
      })
      .from(communityPostFlags)
      .where(inArray(communityPostFlags.postId, postIds))
      .groupBy(communityPostFlags.postId, communityPostFlags.direction);
    for (const row of rows) {
      const entry = out.get(row.postId) ?? { hide: 0, keep: 0 };
      if (row.direction === 'hide') entry.hide = Number(row.count);
      else if (row.direction === 'keep') entry.keep = Number(row.count);
      out.set(row.postId, entry);
    }
    return out;
  }

  private async viewerMarks(postIds: number[], userId?: number) {
    const votes = new Map<number, 'up' | 'down'>();
    const flags = new Map<number, FlagDirection>();
    if (!userId || postIds.length === 0) return { votes, flags };

    const [voteRows, flagRows] = await Promise.all([
      db.select({ postId: communityPostVotes.postId, direction: communityPostVotes.direction })
        .from(communityPostVotes)
        .where(and(inArray(communityPostVotes.postId, postIds), eq(communityPostVotes.userId, userId))),
      db.select({ postId: communityPostFlags.postId, direction: communityPostFlags.direction })
        .from(communityPostFlags)
        .where(and(inArray(communityPostFlags.postId, postIds), eq(communityPostFlags.userId, userId))),
    ]);
    for (const row of voteRows) votes.set(row.postId, row.direction as 'up' | 'down');
    for (const row of flagRows) flags.set(row.postId, row.direction as FlagDirection);
    return { votes, flags };
  }

  private async decorate(rows: Row[], userId?: number): Promise<ForumPostView[]> {
    const ids = rows.map(r => r.id);
    const [tallies, marks] = await Promise.all([
      this.flagTallies(ids),
      this.viewerMarks(ids, userId),
    ]);
    return rows.map(row => this.toView(row, {
      vote: marks.votes.get(row.id) ?? null,
      flag: marks.flags.get(row.id) ?? null,
      tally: tallies.get(row.id),
    }));
  }

  /** Topics of a community, liveliest first, pinned above everything. */
  async listTopics(
    communityId: number,
    opts: { userId?: number; limit?: number; offset?: number } = {},
  ): Promise<{ topics: ForumPostView[]; total: number }> {
    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
    const offset = Math.max(opts.offset ?? 0, 0);

    const rows = await db
      .select({ post: communityPosts, author: this.authorColumns() })
      .from(communityPosts)
      .leftJoin(users, eq(users.id, communityPosts.authorId))
      .where(and(eq(communityPosts.communityId, communityId), isNull(communityPosts.parentId)))
      .orderBy(desc(communityPosts.pinned), desc(communityPosts.lastActivityAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(communityPosts)
      .where(and(eq(communityPosts.communityId, communityId), isNull(communityPosts.parentId)));

    const topics = await this.decorate(
      rows.map(r => ({ ...r.post, author: r.author })),
      opts.userId,
    );
    return { topics, total: Number(count) };
  }

  async getPost(postId: number): Promise<CommunityPost | undefined> {
    const [row] = await db.select().from(communityPosts).where(eq(communityPosts.id, postId));
    return row;
  }

  /** A topic with its replies, oldest first — a conversation reads forwards. */
  async getThread(
    postId: number,
    userId?: number,
  ): Promise<{ topic: ForumPostView; replies: ForumPostView[] } | null> {
    const [topicRow] = await db
      .select({ post: communityPosts, author: this.authorColumns() })
      .from(communityPosts)
      .leftJoin(users, eq(users.id, communityPosts.authorId))
      .where(and(eq(communityPosts.id, postId), isNull(communityPosts.parentId)));
    if (!topicRow) return null;

    const replyRows = await db
      .select({ post: communityPosts, author: this.authorColumns() })
      .from(communityPosts)
      .leftJoin(users, eq(users.id, communityPosts.authorId))
      .where(eq(communityPosts.parentId, postId))
      .orderBy(communityPosts.createdAt);

    const decorated = await this.decorate(
      [{ ...topicRow.post, author: topicRow.author }, ...replyRows.map(r => ({ ...r.post, author: r.author }))],
      userId,
    );
    return { topic: decorated[0], replies: decorated.slice(1) };
  }

  /** Most recent post by this author anywhere, for the write cooldown. */
  async lastPostAt(authorId: number): Promise<Date | null> {
    const [row] = await db
      .select({ createdAt: communityPosts.createdAt })
      .from(communityPosts)
      .where(eq(communityPosts.authorId, authorId))
      .orderBy(desc(communityPosts.createdAt))
      .limit(1);
    return row?.createdAt ?? null;
  }

  async createTopic(communityId: number, authorId: number, title: string, content: string) {
    const [row] = await db
      .insert(communityPosts)
      .values({ communityId, authorId, title, content })
      .returning();
    return row;
  }

  async createReply(topicId: number, communityId: number, authorId: number, content: string) {
    const [row] = await db
      .insert(communityPosts)
      .values({ communityId, authorId, parentId: topicId, content })
      .returning();
    // The topic rises for its newest reply, and counts it.
    await db
      .update(communityPosts)
      .set({
        replyCount: sql`${communityPosts.replyCount} + 1`,
        lastActivityAt: row.createdAt,
      })
      .where(eq(communityPosts.id, topicId));
    return row;
  }

  async editPost(postId: number, content: string, title?: string | null) {
    const [row] = await db
      .update(communityPosts)
      .set({
        content,
        ...(title !== undefined && title !== null ? { title } : {}),
        updatedAt: new Date(),
      })
      .where(eq(communityPosts.id, postId))
      .returning();
    return row;
  }

  async softDelete(postId: number) {
    const [row] = await db
      .update(communityPosts)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(communityPosts.id, postId))
      .returning();
    return row;
  }

  /** `hiddenBy` null records that the members decided, not a person. */
  async hide(postId: number, reason: string, hiddenBy: number | null) {
    const [row] = await db
      .update(communityPosts)
      .set({ hiddenAt: new Date(), hiddenBy, hiddenReason: reason, updatedAt: new Date() })
      .where(eq(communityPosts.id, postId))
      .returning();
    return row;
  }

  async unhide(postId: number) {
    const [row] = await db
      .update(communityPosts)
      .set({ hiddenAt: null, hiddenBy: null, hiddenReason: null, updatedAt: new Date() })
      .where(eq(communityPosts.id, postId))
      .returning();
    return row;
  }

  async setPinned(postId: number, pinned: boolean) {
    const [row] = await db
      .update(communityPosts)
      .set({ pinned, updatedAt: new Date() })
      .where(eq(communityPosts.id, postId))
      .returning();
    return row;
  }

  async linkProposal(postId: number, proposalId: number) {
    const [row] = await db
      .update(communityPosts)
      .set({ promotedProposalId: proposalId, updatedAt: new Date() })
      .where(eq(communityPosts.id, postId))
      .returning();
    return row;
  }

  /** Set or flip a member's usefulness vote; a repeated vote withdraws it. */
  async vote(postId: number, userId: number, direction: 'up' | 'down'): Promise<CommunityPost> {
    const [existing] = await db
      .select()
      .from(communityPostVotes)
      .where(and(eq(communityPostVotes.postId, postId), eq(communityPostVotes.userId, userId)));

    if (existing && existing.direction === direction) {
      await db.delete(communityPostVotes).where(eq(communityPostVotes.id, existing.id));
    } else if (existing) {
      await db.update(communityPostVotes).set({ direction }).where(eq(communityPostVotes.id, existing.id));
    } else {
      await db.insert(communityPostVotes).values({ postId, userId, direction });
    }
    return this.recountVotes(postId);
  }

  /**
   * Recount from the vote rows rather than incrementing counters. The rows
   * are the truth; a counter that drifts is a number nobody can explain.
   */
  private async recountVotes(postId: number): Promise<CommunityPost> {
    const rows = await db
      .select({ direction: communityPostVotes.direction, count: sql<number>`count(*)::int` })
      .from(communityPostVotes)
      .where(eq(communityPostVotes.postId, postId))
      .groupBy(communityPostVotes.direction);
    const up = Number(rows.find(r => r.direction === 'up')?.count ?? 0);
    const down = Number(rows.find(r => r.direction === 'down')?.count ?? 0);
    const [row] = await db
      .update(communityPosts)
      .set({ upvotes: up, downvotes: down })
      .where(eq(communityPosts.id, postId))
      .returning();
    return row;
  }

  async flagTally(postId: number): Promise<FlagTally> {
    return (await this.flagTallies([postId])).get(postId) ?? { hide: 0, keep: 0 };
  }

  /**
   * Record a member's moderation vote and return the resulting tally. A
   * repeated identical vote withdraws it, so a member can change their mind
   * about a neighbour's post the way they can about a setting.
   */
  async flag(
    postId: number,
    userId: number,
    direction: FlagDirection,
    reason: string | null,
  ): Promise<FlagTally> {
    const [existing] = await db
      .select()
      .from(communityPostFlags)
      .where(and(eq(communityPostFlags.postId, postId), eq(communityPostFlags.userId, userId)));

    if (existing && existing.direction === direction) {
      await db.delete(communityPostFlags).where(eq(communityPostFlags.id, existing.id));
    } else if (existing) {
      await db.update(communityPostFlags)
        .set({ direction, reason: reason ?? existing.reason })
        .where(eq(communityPostFlags.id, existing.id));
    } else {
      await db.insert(communityPostFlags).values({ postId, userId, direction, reason });
    }
    return this.flagTally(postId);
  }

  /** The reason attached to the earliest report, used when members hide. */
  async firstFlagReason(postId: number): Promise<string | null> {
    const [row] = await db
      .select({ reason: communityPostFlags.reason })
      .from(communityPostFlags)
      .where(and(eq(communityPostFlags.postId, postId), eq(communityPostFlags.direction, 'hide')))
      .orderBy(communityPostFlags.createdAt)
      .limit(1);
    return row?.reason ?? null;
  }

  /**
   * Apply the members' verdict if it has been reached. Returns whether the
   * post is hidden as a result, so the caller can tell the voter what their
   * vote just did.
   */
  async applyFlagVerdict(postId: number, tally: FlagTally): Promise<boolean> {
    const post = await this.getPost(postId);
    if (!post) return false;
    const hiddenByMembers = post.hiddenAt != null && post.hiddenBy == null;
    const verdict = shouldHideByFlags(tally);

    if (verdict && !post.hiddenAt) {
      await this.hide(postId, await this.firstFlagReason(postId) ?? '', null);
      return true;
    }
    // A members' hide is reversible by the same members: if the majority
    // swings back, the post returns. A hide by an administrator does not
    // unwind on member votes — that would let a brigade overturn a ruling.
    if (!verdict && hiddenByMembers) {
      await this.unhide(postId);
      return false;
    }
    return post.hiddenAt != null;
  }

  async countTopics(communityId: number): Promise<number> {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(communityPosts)
      .where(and(eq(communityPosts.communityId, communityId), isNull(communityPosts.parentId)));
    return Number(count);
  }
}
