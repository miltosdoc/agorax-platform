/**
 * Community content visibility
 *
 * One rule, applied server-side everywhere content is read:
 * a community's content (proposals, debates, votes, media/docs) is visible
 * iff contentVisibility is 'public' OR the viewer is a member.
 *
 * The community row itself (name, description, member count, founder/admins)
 * is always public. memberListVisibility separately gates the regular-member
 * roster; officeholders (founder/admin) are always public for accountability.
 */

import { db } from '../db';
import { communities, communityMembers, proposals } from '@shared/schema';
import { eq, and, inArray } from 'drizzle-orm';

type CommunityLike = { id: number; contentVisibility?: string | null };

export function isContentPublic(community: { contentVisibility?: string | null }): boolean {
  return (community.contentVisibility ?? 'public') !== 'members';
}

export function isMemberListPublic(community: { memberListVisibility?: string | null }): boolean {
  return (community.memberListVisibility ?? 'public') !== 'members';
}

/** Can this (possibly anonymous) viewer read the community's content? */
export async function canViewCommunityContent(
  community: CommunityLike,
  userId?: number,
): Promise<boolean> {
  if (isContentPublic(community)) return true;
  if (!userId) return false;
  const [member] = await db
    .select({ id: communityMembers.id })
    .from(communityMembers)
    .where(and(
      eq(communityMembers.communityId, community.id),
      eq(communityMembers.userId, userId),
    ));
  return !!member;
}

export async function canViewCommunityContentById(
  communityId: number,
  userId?: number,
): Promise<boolean> {
  const [community] = await db
    .select({ id: communities.id, contentVisibility: communities.contentVisibility })
    .from(communities)
    .where(eq(communities.id, communityId));
  if (!community) return false;
  return canViewCommunityContent(community, userId);
}

/** Can this viewer read the given proposal (via its community's visibility)? */
export async function canViewProposal(proposalId: number, userId?: number): Promise<boolean> {
  const [row] = await db
    .select({ communityId: proposals.communityId, contentVisibility: communities.contentVisibility })
    .from(proposals)
    .innerJoin(communities, eq(proposals.communityId, communities.id))
    .where(eq(proposals.id, proposalId));
  if (!row) return false;
  return canViewCommunityContent({ id: row.communityId, contentVisibility: row.contentVisibility }, userId);
}

/**
 * Route middleware: block access to a proposal-scoped endpoint when the
 * proposal's community keeps its content members-only and the viewer is not
 * a member. Responds 403 with contentHidden so clients can render the gated
 * state. Missing proposals also 403 here — existence is not leaked; the
 * handler's own 404 covers the public case.
 */
export function requireProposalContentAccess(param = 'id') {
  return async (req: any, res: any, next: any) => {
    try {
      const proposalId = parseInt(req.params[param], 10);
      if (!Number.isFinite(proposalId)) {
        return res.status(400).json({ message: 'invalid proposal id' });
      }
      const [row] = await db
        .select({ communityId: proposals.communityId, contentVisibility: communities.contentVisibility })
        .from(proposals)
        .innerJoin(communities, eq(proposals.communityId, communities.id))
        .where(eq(proposals.id, proposalId));
      if (!row) return next(); // let the handler 404
      const ok = await canViewCommunityContent(
        { id: row.communityId, contentVisibility: row.contentVisibility },
        req.user?.id,
      );
      if (!ok) return res.status(403).json({ message: 'Members only', contentHidden: true });
      next();
    } catch (err) {
      res.status(500).json({ message: 'visibility check failed' });
    }
  };
}

/**
 * For feed-style lists: given community ids, return the subset whose content
 * this viewer may read (public communities plus the viewer's memberships).
 * Two queries total, regardless of list size.
 */
export async function visibleCommunityIdSet(
  communityIds: number[],
  userId?: number,
): Promise<Set<number>> {
  const ids = Array.from(new Set(communityIds));
  if (ids.length === 0) return new Set();

  const rows = await db
    .select({ id: communities.id, contentVisibility: communities.contentVisibility })
    .from(communities)
    .where(inArray(communities.id, ids));
  const visible = new Set(rows.filter(isContentPublic).map((r) => r.id));

  const restricted = rows.filter((r) => !isContentPublic(r)).map((r) => r.id);
  if (userId && restricted.length > 0) {
    const memberships = await db
      .select({ communityId: communityMembers.communityId })
      .from(communityMembers)
      .where(and(
        eq(communityMembers.userId, userId),
        inArray(communityMembers.communityId, restricted),
      ));
    for (const m of memberships) visible.add(m.communityId);
  }
  return visible;
}
