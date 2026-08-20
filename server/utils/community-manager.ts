/**
 * Community Manager
 *
 * Lifecycle helpers for the autonomous ↔ managed split.
 *
 * Autonomous communities have no admin team (no_admin governance, empty
 * adminIds). Managed communities are run by an admin team — the array on
 * `adminIds` is the authoritative list, and the matching members get
 * `role = 'admin'` for legacy callers that still inspect the role column.
 *
 * Both transitions are gated behind explicit calls because in production
 * they only fire after a successful proposal vote (autonomous→managed)
 * or a successful admin vote (managed→autonomous). The vote logic itself
 * lives in routes.ts; this module just executes the resulting flip.
 *
 * Also handles community merging: transferring members and proposals
 * from a source community into a target community, archiving the source.
 */

import { db } from '../db';
import {
  communities,
  communityMembers,
  proposals as proposalsTable,
  sortitionBodies,
  type Community,
  type CommunityMember,
} from '@shared/schema';
import { COMMUNITY_TYPES, type CommunityType } from '@shared/community-settings';
import { and, eq, inArray } from 'drizzle-orm';

// ─── Lifecycle Types ────────────────────────────────────────────────────────

export interface CommunityWithMemberSummary {
  community: Community;
  members: CommunityMember[];
  adminIds: number[];
}

class CommunityManagerError extends Error {
  constructor(message: string, public readonly code: 'not_found' | 'invalid_type' | 'invalid_input') {
    super(message);
    this.name = 'CommunityManagerError';
  }
}

export { CommunityManagerError };

function parseAdminIds(raw: unknown): number[] {
  if (Array.isArray(raw)) {
    return raw.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function getAdminIds(community: Pick<Community, 'adminIds'>): number[] {
  return parseAdminIds(community.adminIds);
}

// ─── Lifecycle Functions ────────────────────────────────────────────────────

export async function createCommunity(
  name: string,
  description: string | null,
  type: CommunityType,
  creatorId: number,
  options: { isGeneral?: boolean } = {},
): Promise<Community> {
  if (!name.trim()) {
    throw new CommunityManagerError('Community name is required', 'invalid_input');
  }
  if (!(COMMUNITY_TYPES as readonly string[]).includes(type)) {
    throw new CommunityManagerError(`Invalid community type: ${String(type)}`, 'invalid_type');
  }

  const adminIds = type === 'managed' ? [creatorId] : [];
  const governanceModel = type === 'managed' ? 'admin_team' : 'no_admin';

  const [community] = await db
    .insert(communities)
    .values({
      name: name.trim(),
      description: description ?? null,
      type,
      governanceModel,
      creatorId,
      adminIds,
      isGeneral: options.isGeneral === true,
    })
    .returning();

  await db.insert(communityMembers).values({
    communityId: community.id,
    userId: creatorId,
    role: type === 'managed' ? 'admin' : 'founder',
  });

  return community;
}

export async function transitionToManaged(
  communityId: number,
  adminIds: number[],
): Promise<Community> {
  if (adminIds.length === 0) {
    throw new CommunityManagerError(
      'transitionToManaged requires at least one admin',
      'invalid_input',
    );
  }

  const community = await getCommunityRow(communityId);
  if (community.type === 'managed') {
    throw new CommunityManagerError(
      `Community ${communityId} is already managed`,
      'invalid_type',
    );
  }

  const cleaned = Array.from(new Set(adminIds.filter(n => Number.isFinite(n))));

  const [updated] = await db
    .update(communities)
    .set({ type: 'managed', governanceModel: 'admin_team', adminIds: cleaned })
    .where(eq(communities.id, communityId))
    .returning();

  await db
    .update(communityMembers)
    .set({ role: 'member' })
    .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.role, 'admin')));
  await db
    .update(communityMembers)
    .set({ role: 'admin' })
    .where(and(eq(communityMembers.communityId, communityId), inArray(communityMembers.userId, cleaned)));

  return updated;
}

export async function transitionToAutonomous(communityId: number): Promise<Community> {
  const community = await getCommunityRow(communityId);
  if (community.type === 'autonomous') {
    throw new CommunityManagerError(
      `Community ${communityId} is already autonomous`,
      'invalid_type',
    );
  }

  const [updated] = await db
    .update(communities)
    .set({ type: 'autonomous', governanceModel: 'no_admin', adminIds: [] })
    .where(eq(communities.id, communityId))
    .returning();

  await db
    .update(communityMembers)
    .set({ role: 'member' })
    .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.role, 'admin')));

  return updated;
}

export async function addMember(communityId: number, userId: number): Promise<CommunityMember> {
  const [existing] = await db
    .select()
    .from(communityMembers)
    .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, userId)));
  if (existing) return existing;

  const community = await getCommunityRow(communityId);
  const adminIds = getAdminIds(community);
  const role = adminIds.includes(userId) ? 'admin' : 'member';

  const [member] = await db
    .insert(communityMembers)
    .values({ communityId, userId, role })
    .returning();
  return member;
}

export async function removeMember(communityId: number, userId: number): Promise<void> {
  const community = await getCommunityRow(communityId);
  const adminIds = getAdminIds(community);
  if (adminIds.includes(userId)) {
    const next = adminIds.filter(id => id !== userId);
    await db.update(communities).set({ adminIds: next }).where(eq(communities.id, communityId));
  }

  await db
    .delete(communityMembers)
    .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, userId)));
}

export async function getCommunity(communityId: number): Promise<CommunityWithMemberSummary | null> {
  const [community] = await db
    .select()
    .from(communities)
    .where(eq(communities.id, communityId));
  if (!community) return null;

  const members = await db
    .select()
    .from(communityMembers)
    .where(eq(communityMembers.communityId, communityId));

  return {
    community,
    members,
    adminIds: getAdminIds(community),
  };
}

export async function getGeneralCommunity(): Promise<Community | null> {
  const [community] = await db
    .select()
    .from(communities)
    .where(eq(communities.isGeneral, true));
  return community ?? null;
}

async function getCommunityRow(communityId: number): Promise<Community> {
  const [community] = await db
    .select()
    .from(communities)
    .where(eq(communities.id, communityId));
  if (!community) {
    throw new CommunityManagerError(`Community ${communityId} not found`, 'not_found');
  }
  return community;
}

// ─── Merge Types ────────────────────────────────────────────────────────────

export interface MergeResult {
  success: boolean;
  sourceId: number;
  targetId: number;
  membersTransferred: number;
  proposalsTransferred: number;
  errors: string[];
}

export interface MergeValidation {
  canMerge: boolean;
  reasons: string[];
}

// ─── Merge Validation ───────────────────────────────────────────────────────

export async function validateMerge(
  sourceId: number,
  targetId: number,
): Promise<MergeValidation> {
  const reasons: string[] = [];

  if (sourceId === targetId) {
    reasons.push('Cannot merge a community into itself');
    return { canMerge: false, reasons };
  }

  const source = await db.query.communities.findFirst({
    where: eq(communities.id, sourceId),
  });
  const target = await db.query.communities.findFirst({
    where: eq(communities.id, targetId),
  });

  if (!source) {
    reasons.push(`Source community ${sourceId} not found`);
    return { canMerge: false, reasons };
  }
  if (!target) {
    reasons.push(`Target community ${targetId} not found`);
    return { canMerge: false, reasons };
  }

  if (source.mergedInto !== null) {
    reasons.push(`Source community has already been merged into community ${source.mergedInto}`);
  }
  if (target.mergedInto !== null) {
    reasons.push(`Target community has already been merged into community ${target.mergedInto}`);
  }

  return {
    canMerge: reasons.length === 0,
    reasons,
  };
}

// ─── Merge Logic ────────────────────────────────────────────────────────────

export async function mergeCommunities(
  sourceId: number,
  targetId: number,
): Promise<MergeResult> {
  const result: MergeResult = {
    success: false,
    sourceId,
    targetId,
    membersTransferred: 0,
    proposalsTransferred: 0,
    errors: [],
  };

  const validation = await validateMerge(sourceId, targetId);
  if (!validation.canMerge) {
    result.errors = validation.reasons;
    return result;
  }

  try {
    // Transfer members
    const sourceMembers = await db.query.communityMembers.findMany({
      where: eq(communityMembers.communityId, sourceId),
    });

    let membersTransferred = 0;
    for (const member of sourceMembers) {
      const existing = await db.query.communityMembers.findFirst({
        where: and(
          eq(communityMembers.communityId, targetId),
          eq(communityMembers.userId, member.userId),
        ),
      });

      if (existing) {
        const rolePriority = { founder: 3, admin: 2, member: 1 };
        const sourcePriority = rolePriority[member.role as keyof typeof rolePriority] || 1;
        const targetPriority = rolePriority[existing.role as keyof typeof rolePriority] || 1;

        if (sourcePriority > targetPriority) {
          await db.update(communityMembers)
            .set({ role: member.role } as any)
            .where(eq(communityMembers.id, existing.id));
        }
      } else {
        await db.insert(communityMembers).values({
          communityId: targetId,
          userId: member.userId,
          role: member.role,
          joinedAt: member.joinedAt,
        } as any);
      }
      membersTransferred++;
    }

    result.membersTransferred = membersTransferred;

    // Reassign proposals
    const proposalRows = await db.query.proposals.findMany({
      where: eq(proposalsTable.communityId, sourceId),
    });

    if (proposalRows.length > 0) {
      await db.update(proposalsTable)
        .set({ communityId: targetId })
        .where(eq(proposalsTable.communityId, sourceId));
    }

    result.proposalsTransferred = proposalRows.length;

    // Reassign sortition bodies
    const sortitions = await db.query.sortitionBodies.findMany({
      where: eq(sortitionBodies.communityId, sourceId),
    });

    if (sortitions.length > 0) {
      await db.update(sortitionBodies)
        .set({ communityId: targetId })
        .where(eq(sortitionBodies.communityId, sourceId));
    }

    // Mark source as merged
    await db.update(communities)
      .set({ mergedInto: targetId })
      .where(eq(communities.id, sourceId));

    result.success = true;
  } catch (error) {
    result.errors.push(`Merge failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return result;
}

// ─── Merge Helper Functions ─────────────────────────────────────────────────

export async function getMergedIntoCommunity(targetId: number): Promise<Community[]> {
  return await db.query.communities.findMany({
    where: eq(communities.mergedInto, targetId),
  });
}

export async function isMerged(communityId: number): Promise<boolean> {
  const community = await db.query.communities.findFirst({
    where: eq(communities.id, communityId),
  });
  return community?.mergedInto !== null;
}

export async function getFinalCommunityId(communityId: number): Promise<number> {
  let currentId = communityId;
  const visited = new Set<number>();

  while (true) {
    if (visited.has(currentId)) {
      throw new Error(`Circular merge reference detected at community ${currentId}`);
    }
    visited.add(currentId);

    const community = await db.query.communities.findFirst({
      where: eq(communities.id, currentId),
    });

    if (!community || community.mergedInto === null) {
      return currentId;
    }

    currentId = community.mergedInto;
  }
}
