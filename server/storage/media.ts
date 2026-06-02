/**
 * Proposal media repository — podcast (MP3) and video teaser (MP4) uploads
 * tied to a proposal. Curated by the proposal author (feature/hide/delete);
 * any community member can submit.
 */

import { db } from '../db';
import {
  proposalMedia,
  proposals,
  communities,
  users,
  type ProposalMedia,
  type InsertProposalMedia,
} from '../../shared/schema';
import { and, desc, eq, or, sql, inArray, isNull } from 'drizzle-orm';

export interface MediaWithContext extends ProposalMedia {
  proposalQuestion: string;
  proposalSolution: string | null;
  communityId: number;
  communityName: string;
  uploaderName: string;
}

export class MediaRepository {

  async create(insert: InsertProposalMedia): Promise<ProposalMedia> {
    const [row] = await db.insert(proposalMedia).values(insert).returning();
    return row;
  }

  async getById(id: number): Promise<ProposalMedia | undefined> {
    const [row] = await db.select().from(proposalMedia).where(eq(proposalMedia.id, id));
    return row;
  }

  /**
   * List media attached to a proposal. Hidden entries are filtered out
   * unless `includeHidden` is true (the author/admin view).
   * When `userId` is provided, the uploader's own hidden entries are
   * always included so they can unhide them.
   */
  async listForProposal(
    proposalId: number,
    opts: { includeHidden?: boolean; userId?: number } = {},
  ): Promise<ProposalMedia[]> {
    const conditions = [eq(proposalMedia.proposalId, proposalId)];
    if (!opts.includeHidden) {
      if (opts.userId) {
        // Show published items + this user's own hidden items.
        const publishedFilter = eq(proposalMedia.status, 'published');
        const ownHiddenFilter = and(
          eq(proposalMedia.status, 'hidden'),
          eq(proposalMedia.uploaderId, opts.userId),
        );
        if (ownHiddenFilter) {
          const combined = or(publishedFilter, ownHiddenFilter);
          if (combined) conditions.push(combined);
        }
      } else {
        conditions.push(eq(proposalMedia.status, 'published'));
      }
    }
    return await db
      .select()
      .from(proposalMedia)
      .where(and(...conditions))
      .orderBy(desc(proposalMedia.isFeatured), desc(proposalMedia.createdAt));
  }

  /**
   * Set or clear the `is_featured` flag. Only one media per (proposal,kind)
   * may be featured — the unique partial index enforces it; we make the
   * write atomic by first un-featuring siblings.
   */
  async setFeatured(id: number, featured: boolean): Promise<ProposalMedia> {
    if (!featured) {
      const [row] = await db
        .update(proposalMedia)
        .set({ isFeatured: false })
        .where(eq(proposalMedia.id, id))
        .returning();
      if (!row) throw new Error('Media not found');
      return row;
    }
    const [target] = await db.select().from(proposalMedia).where(eq(proposalMedia.id, id));
    if (!target) throw new Error('Media not found');
    return await db.transaction(async (tx) => {
      await tx
        .update(proposalMedia)
        .set({ isFeatured: false })
        .where(and(
          eq(proposalMedia.proposalId, target.proposalId),
          eq(proposalMedia.kind, target.kind),
          eq(proposalMedia.isFeatured, true),
        ));
      const [row] = await tx
        .update(proposalMedia)
        .set({ isFeatured: true, status: 'published' })
        .where(eq(proposalMedia.id, id))
        .returning();
      if (!row) throw new Error('Media not found');
      return row;
    });
  }

  async setStatus(id: number, status: 'published' | 'hidden'): Promise<ProposalMedia> {
    const update: Partial<ProposalMedia> = { status };
    // Hiding a featured entry also clears the feature flag — otherwise the
    // /feed would surface a row marked hidden, since it sorts featured-first.
    if (status === 'hidden') update.isFeatured = false;
    const [row] = await db
      .update(proposalMedia)
      .set(update)
      .where(eq(proposalMedia.id, id))
      .returning();
    if (!row) throw new Error('Media not found');
    return row;
  }

  async deleteById(id: number): Promise<ProposalMedia | undefined> {
    const [row] = await db
      .delete(proposalMedia)
      .where(eq(proposalMedia.id, id))
      .returning();
    return row;
  }

  /**
   * Global feed of media joined with the proposal + community + uploader.
   * Ordered newest first; the caller filters by kind when needed.
   * Cursor is the integer media id (rows with id < cursor come next).
   */
  async feed(opts: {
    kind?: 'podcast' | 'video';
    cursor?: number;
    limit?: number;
  } = {}): Promise<MediaWithContext[]> {
    const limit = Math.min(opts.limit ?? 20, 50);
    const conditions = [eq(proposalMedia.status, 'published')];
    if (opts.kind) conditions.push(eq(proposalMedia.kind, opts.kind));
    if (opts.cursor && Number.isFinite(opts.cursor)) {
      conditions.push(sql`${proposalMedia.id} < ${opts.cursor}`);
    }

    const rows = await db
      .select({
        id: proposalMedia.id,
        proposalId: proposalMedia.proposalId,
        uploaderId: proposalMedia.uploaderId,
        kind: proposalMedia.kind,
        filePath: proposalMedia.filePath,
        thumbPath: proposalMedia.thumbPath,
        mimeType: proposalMedia.mimeType,
        sizeBytes: proposalMedia.sizeBytes,
        durationS: proposalMedia.durationS,
        status: proposalMedia.status,
        isFeatured: proposalMedia.isFeatured,
        createdAt: proposalMedia.createdAt,
        proposalQuestion: proposals.question,
        proposalSolution: proposals.solution,
        communityId: communities.id,
        communityName: communities.name,
        uploaderName: users.name,
      })
      .from(proposalMedia)
      .innerJoin(proposals, eq(proposalMedia.proposalId, proposals.id))
      .innerJoin(communities, eq(proposals.communityId, communities.id))
      .innerJoin(users, eq(proposalMedia.uploaderId, users.id))
      .where(and(...conditions))
      .orderBy(desc(proposalMedia.id))
      .limit(limit);

    return rows as unknown as MediaWithContext[];
  }
}
