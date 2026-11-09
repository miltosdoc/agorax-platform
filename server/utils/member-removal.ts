/**
 * Member removal: the server side of shared/member-removal.ts.
 *
 *  - removeMember()       carries out a removal (admin action or passed vote)
 *  - activeRemoval()      the cooldown that blocks someone from rejoining
 *  - openRemovalVote() / castRemovalBallot() / settleRemovalVote()
 *                         the autonomous-community vote
 *  - sweepRemovalVotes()  settles votes whose deadline passed (job worker)
 */

import { db } from '../db';
import {
  communities,
  communityMembers,
  communityJoinRequests,
  communityInvites,
  communitySettingVotes,
  communityRemovals,
  communityRemovalVotes,
  communityRemovalBallots,
  sortitionBodies,
  sortitionMembers,
  users,
  type CommunityRemoval,
  type CommunityRemovalVote,
} from '@shared/schema';
import { and, desc, eq, gt, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import {
  REJOIN_COOLDOWN_DAYS,
  REMOVAL_VOTE_DAYS,
  REVOTE_COOLDOWN_DAYS,
  addDays,
  removalOutcome,
  removalQuorum,
  type RemovalChoice,
} from '@shared/member-removal';
import { isGovernableSettingKey, type GovernableSettingKey } from '@shared/governable-settings';

export class RemovalError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ─── Cooldown ───────────────────────────────────────────────────────────────

/** The removal that still keeps this user out of the community, if any. */
export async function activeRemoval(communityId: number, userId: number): Promise<CommunityRemoval | null> {
  const [row] = await db
    .select()
    .from(communityRemovals)
    .where(and(
      eq(communityRemovals.communityId, communityId),
      eq(communityRemovals.userId, userId),
      isNull(communityRemovals.liftedAt),
      gt(communityRemovals.rejoinAfter, new Date()),
    ))
    .orderBy(desc(communityRemovals.rejoinAfter))
    .limit(1);
  return row ?? null;
}

/** The message shown to someone turned away by a cooldown. */
export function cooldownMessage(removal: CommunityRemoval): string {
  const until = removal.rejoinAfter.toISOString().slice(0, 10);
  return `You were removed from this community and can rejoin after ${until}.`;
}

/** Lift a cooldown early (managed communities, admin action). */
export async function liftRemoval(communityId: number, removalId: number, byUserId: number): Promise<boolean> {
  const rows = await db
    .update(communityRemovals)
    .set({ liftedAt: new Date(), liftedByUserId: byUserId })
    .where(and(
      eq(communityRemovals.id, removalId),
      eq(communityRemovals.communityId, communityId),
      isNull(communityRemovals.liftedAt),
    ))
    .returning({ id: communityRemovals.id });
  return rows.length > 0;
}

// ─── Carrying out a removal ─────────────────────────────────────────────────

interface RemoveParams {
  communityId: number;
  userId: number;
  reason: string;
  /** Admin who removed them; null when a vote did. */
  removedByUserId: number | null;
  voteId?: number | null;
}

/**
 * Remove a member and everything that would let them keep acting as one.
 * Their past contributions — proposals, comments, ballots already cast —
 * stay: ballots are anchored in the vote chain and must not change.
 */
export async function removeMember(params: RemoveParams): Promise<CommunityRemoval> {
  const { communityId, userId, reason } = params;
  const now = new Date();

  const { removal, settingKeys } = await db.transaction(async (tx) => {
    await tx.delete(communityMembers).where(and(
      eq(communityMembers.communityId, communityId),
      eq(communityMembers.userId, userId),
    ));

    // Admin power lives on the community row too (see removeCommunityMember).
    const [community] = await tx
      .select({ adminIds: communities.adminIds })
      .from(communities)
      .where(eq(communities.id, communityId));
    const adminIds = Array.isArray(community?.adminIds) ? community.adminIds as number[] : [];
    if (adminIds.includes(userId)) {
      await tx.update(communities)
        .set({ adminIds: adminIds.filter((id) => id !== userId) })
        .where(eq(communities.id, communityId));
    }

    // Their say over the community's settings goes with their membership.
    const settingVotes = await tx
      .delete(communitySettingVotes)
      .where(and(
        eq(communitySettingVotes.communityId, communityId),
        eq(communitySettingVotes.userId, userId),
      ))
      .returning({ key: communitySettingVotes.settingKey });

    // No way back in through a pending application or an unused invitation.
    await tx.update(communityJoinRequests)
      .set({ status: 'rejected', decidedAt: now, decidedByUserId: params.removedByUserId })
      .where(and(
        eq(communityJoinRequests.communityId, communityId),
        eq(communityJoinRequests.userId, userId),
        eq(communityJoinRequests.status, 'pending'),
      ));
    await tx.update(communityInvites)
      .set({ status: 'revoked' })
      .where(and(
        eq(communityInvites.communityId, communityId),
        eq(communityInvites.invitedUserId, userId),
        eq(communityInvites.status, 'pending'),
      ));

    // A seat they have not filled yet in a running jury would only stall it.
    const bodies = await tx
      .select({ id: sortitionBodies.id })
      .from(sortitionBodies)
      .where(and(
        eq(sortitionBodies.communityId, communityId),
        inArray(sortitionBodies.status, ['selecting', 'active']),
      ));
    if (bodies.length > 0) {
      await tx.delete(sortitionMembers).where(and(
        inArray(sortitionMembers.bodyId, bodies.map((b) => b.id)),
        eq(sortitionMembers.userId, userId),
        eq(sortitionMembers.responded, false),
      ));
    }

    // Open removal votes: a vote about them is moot; their ballots in
    // others no longer count, since they are no longer a member.
    await tx.update(communityRemovalVotes)
      .set({ status: 'cancelled', decidedAt: now })
      .where(and(
        eq(communityRemovalVotes.communityId, communityId),
        eq(communityRemovalVotes.targetUserId, userId),
        eq(communityRemovalVotes.status, 'open'),
        params.voteId ? ne(communityRemovalVotes.id, params.voteId) : sql`true`,
      ));
    const openVotes = await tx
      .select({ id: communityRemovalVotes.id })
      .from(communityRemovalVotes)
      .where(and(
        eq(communityRemovalVotes.communityId, communityId),
        eq(communityRemovalVotes.status, 'open'),
      ));
    if (openVotes.length > 0) {
      await tx.delete(communityRemovalBallots).where(and(
        inArray(communityRemovalBallots.voteId, openVotes.map((v) => v.id)),
        eq(communityRemovalBallots.userId, userId),
      ));
    }

    const [removal] = await tx.insert(communityRemovals).values({
      communityId,
      userId,
      removedByUserId: params.removedByUserId,
      voteId: params.voteId ?? null,
      reason,
      rejoinAfter: addDays(now, REJOIN_COOLDOWN_DAYS),
    }).returning();

    return { removal, settingKeys: Array.from(new Set(settingVotes.map((v) => v.key))) };
  });

  // Recount the settings they had voted on, now without them.
  if (settingKeys.length > 0) {
    const { communityRepo } = await import('../storage');
    for (const key of settingKeys) {
      if (!isGovernableSettingKey(key)) continue;
      try {
        await communityRepo.recomputeAutonomousSetting(communityId, key as GovernableSettingKey);
      } catch (err: any) {
        console.warn(`[removal] recount of ${key} in community ${communityId} failed: ${err?.message}`);
      }
    }
  }

  await notifyRemoved(removal);
  return removal;
}

async function communityName(communityId: number): Promise<string> {
  const [c] = await db.select({ name: communities.name }).from(communities).where(eq(communities.id, communityId));
  return c?.name ?? '';
}

async function notifyRemoved(removal: CommunityRemoval): Promise<void> {
  try {
    const { createNotification } = await import('./notifications');
    const name = await communityName(removal.communityId);
    const until = removal.rejoinAfter.toISOString().slice(0, 10);
    await createNotification({
      userId: removal.userId,
      type: 'community_membership',
      title: `Αφαιρεθήκατε από την κοινότητα «${name}»`,
      message: `${removal.voteId ? 'Με ψηφοφορία των μελών.' : 'Από τη διαχείριση της κοινότητας.'} Αιτιολογία: ${removal.reason}\nΜπορείτε να ξαναγίνετε μέλος μετά τις ${until}.`,
      communityId: removal.communityId,
      actionUrl: `/communities/${removal.communityId}`,
    });
  } catch (err: any) {
    console.warn(`[removal] notification for removal ${removal.id} failed: ${err?.message}`);
  }
}

// ─── Removal votes (autonomous communities) ─────────────────────────────────

/** Members who may vote: joined before the vote opened, minus the person. */
async function eligibleVoterIds(vote: Pick<CommunityRemovalVote, 'communityId' | 'targetUserId' | 'createdAt'>): Promise<number[]> {
  const rows = await db
    .select({ userId: communityMembers.userId })
    .from(communityMembers)
    .where(and(
      eq(communityMembers.communityId, vote.communityId),
      ne(communityMembers.userId, vote.targetUserId),
      lt(communityMembers.joinedAt, vote.createdAt),
    ));
  return rows.map((r) => r.userId);
}

async function countBallots(voteId: number, eligible: number[]): Promise<{ yes: number; no: number }> {
  if (eligible.length === 0) return { yes: 0, no: 0 };
  const rows = await db
    .select({ choice: communityRemovalBallots.choice, n: sql<number>`cast(count(*) as int)` })
    .from(communityRemovalBallots)
    .where(and(
      eq(communityRemovalBallots.voteId, voteId),
      inArray(communityRemovalBallots.userId, eligible),
    ))
    .groupBy(communityRemovalBallots.choice);
  return {
    yes: rows.find((r) => r.choice === 'yes')?.n ?? 0,
    no: rows.find((r) => r.choice === 'no')?.n ?? 0,
  };
}

export async function openRemovalVote(params: {
  communityId: number;
  targetUserId: number;
  openedByUserId: number;
  reason: string;
}): Promise<CommunityRemovalVote> {
  const { communityId, targetUserId, openedByUserId, reason } = params;

  const recentlyFailed = await db
    .select({ decidedAt: communityRemovalVotes.decidedAt })
    .from(communityRemovalVotes)
    .where(and(
      eq(communityRemovalVotes.communityId, communityId),
      eq(communityRemovalVotes.targetUserId, targetUserId),
      eq(communityRemovalVotes.status, 'rejected'),
      gt(communityRemovalVotes.decidedAt, addDays(new Date(), -REVOTE_COOLDOWN_DAYS)),
    ))
    .limit(1);
  if (recentlyFailed.length > 0) {
    const until = addDays(recentlyFailed[0].decidedAt!, REVOTE_COOLDOWN_DAYS).toISOString().slice(0, 10);
    throw new RemovalError(409, `A vote to remove this member failed recently. A new one can start after ${until}.`);
  }

  const now = new Date();
  let vote: CommunityRemovalVote;
  try {
    [vote] = await db.insert(communityRemovalVotes).values({
      communityId,
      targetUserId,
      openedByUserId,
      reason,
      createdAt: now,
      closesAt: addDays(now, REMOVAL_VOTE_DAYS),
    }).returning();
  } catch {
    // The partial unique index: someone opened one a moment ago.
    throw new RemovalError(409, 'A vote to remove this member is already open.');
  }

  // Whoever opens the vote is voting yes.
  await db.insert(communityRemovalBallots).values({ voteId: vote.id, userId: openedByUserId, choice: 'yes' })
    .onConflictDoNothing();

  await notifyVoteOpened(vote);
  // A tiny community may already be decided by the opener's own vote.
  await settleRemovalVote(vote.id);
  return vote;
}

async function notifyVoteOpened(vote: CommunityRemovalVote): Promise<void> {
  try {
    const { createNotification } = await import('./notifications');
    const name = await communityName(vote.communityId);
    const [target] = await db.select({ name: users.name, username: users.username }).from(users).where(eq(users.id, vote.targetUserId));
    const targetLabel = target?.name || `@${target?.username ?? ''}`;
    const actionUrl = `/communities/${vote.communityId}?tab=members`;

    await createNotification({
      userId: vote.targetUserId,
      type: 'community_membership',
      title: `Ψηφοφορία για την αφαίρεσή σας από την κοινότητα «${name}»`,
      message: `Αιτιολογία: ${vote.reason}\nΜπορείτε να απαντήσετε· τα μέλη θα δουν την απάντησή σας πριν ψηφίσουν.`,
      communityId: vote.communityId,
      actionUrl,
    });

    const voters = (await eligibleVoterIds(vote)).filter((id) => id !== vote.openedByUserId);
    for (const userId of voters) {
      await createNotification({
        userId,
        type: 'community_membership',
        title: `Ψηφοφορία: αφαίρεση του μέλους ${targetLabel} από την κοινότητα «${name}»`,
        message: `Αιτιολογία: ${vote.reason}`,
        communityId: vote.communityId,
        actionUrl,
      });
    }
  } catch (err: any) {
    console.warn(`[removal] vote ${vote.id} notifications failed: ${err?.message}`);
  }
}

export async function getRemovalVote(voteId: number): Promise<CommunityRemovalVote | null> {
  const [vote] = await db.select().from(communityRemovalVotes).where(eq(communityRemovalVotes.id, voteId));
  return vote ?? null;
}

export async function castRemovalBallot(vote: CommunityRemovalVote, userId: number, choice: RemovalChoice): Promise<void> {
  if (vote.status !== 'open') throw new RemovalError(409, 'This vote has closed.');
  if (userId === vote.targetUserId) throw new RemovalError(403, 'You cannot vote on your own removal.');
  const eligible = await eligibleVoterIds(vote);
  if (!eligible.includes(userId)) {
    throw new RemovalError(403, 'Only members who had joined before this vote opened can take part.');
  }
  await db.insert(communityRemovalBallots)
    .values({ voteId: vote.id, userId, choice })
    .onConflictDoUpdate({
      target: [communityRemovalBallots.voteId, communityRemovalBallots.userId],
      set: { choice, updatedAt: new Date() },
    });
  await settleRemovalVote(vote.id);
}

export async function setRemovalResponse(vote: CommunityRemovalVote, userId: number, text: string): Promise<void> {
  if (vote.status !== 'open') throw new RemovalError(409, 'This vote has closed.');
  if (userId !== vote.targetUserId) throw new RemovalError(403, 'Only the member concerned can respond.');
  await db.update(communityRemovalVotes)
    .set({ targetResponse: text || null })
    .where(eq(communityRemovalVotes.id, vote.id));
}

export async function cancelRemovalVote(vote: CommunityRemovalVote, userId: number): Promise<void> {
  if (vote.status !== 'open') throw new RemovalError(409, 'This vote has closed.');
  if (userId !== vote.openedByUserId) throw new RemovalError(403, 'Only the member who opened the vote can withdraw it.');
  await db.update(communityRemovalVotes)
    .set({ status: 'cancelled', decidedAt: new Date() })
    .where(and(eq(communityRemovalVotes.id, vote.id), eq(communityRemovalVotes.status, 'open')));
}

/**
 * Settle the vote if its result can no longer change, or its deadline has
 * passed. Safe to call any number of times, from any number of places: only
 * the call that flips status away from 'open' acts on the result.
 */
export async function settleRemovalVote(voteId: number): Promise<CommunityRemovalVote['status']> {
  const vote = await getRemovalVote(voteId);
  if (!vote || vote.status !== 'open') return vote?.status ?? 'cancelled';

  const [community] = await db
    .select({ minParticipationPct: communities.minParticipationPct })
    .from(communities)
    .where(eq(communities.id, vote.communityId));
  const eligible = await eligibleVoterIds(vote);
  const { yes, no } = await countBallots(vote.id, eligible);
  const outcome = removalOutcome(
    { yes, no, eligible: eligible.length, minParticipationPct: community?.minParticipationPct },
    vote.closesAt.getTime() <= Date.now(),
  );
  if (outcome === 'open') return 'open';

  const [decided] = await db.update(communityRemovalVotes)
    .set({ status: outcome, yesCount: yes, noCount: no, eligibleCount: eligible.length, decidedAt: new Date() })
    .where(and(eq(communityRemovalVotes.id, vote.id), eq(communityRemovalVotes.status, 'open')))
    .returning();
  if (!decided) return 'open';

  if (outcome === 'passed') {
    const stillMember = await db
      .select({ id: communityMembers.id })
      .from(communityMembers)
      .where(and(eq(communityMembers.communityId, vote.communityId), eq(communityMembers.userId, vote.targetUserId)));
    if (stillMember.length > 0) {
      await removeMember({
        communityId: vote.communityId,
        userId: vote.targetUserId,
        reason: vote.reason,
        removedByUserId: null,
        voteId: vote.id,
      });
    }
  } else {
    await notifyVoteFailed(decided);
  }
  return outcome;
}

async function notifyVoteFailed(vote: CommunityRemovalVote): Promise<void> {
  try {
    const { createNotification } = await import('./notifications');
    const name = await communityName(vote.communityId);
    for (const userId of [vote.targetUserId, vote.openedByUserId].filter((id): id is number => id != null)) {
      await createNotification({
        userId,
        type: 'community_membership',
        title: `Η ψηφοφορία αφαίρεσης στην κοινότητα «${name}» δεν πέρασε`,
        message: `Υπέρ ${vote.yesCount}, κατά ${vote.noCount}. Χρειαζόταν πλειοψηφία ⅔ των ψήφων.`,
        communityId: vote.communityId,
        actionUrl: `/communities/${vote.communityId}?tab=members`,
      });
    }
  } catch (err: any) {
    console.warn(`[removal] vote ${vote.id} outcome notification failed: ${err?.message}`);
  }
}

/** Settle every open vote whose deadline has passed. */
export async function sweepRemovalVotes(): Promise<number> {
  const due = await db
    .select({ id: communityRemovalVotes.id })
    .from(communityRemovalVotes)
    .where(and(eq(communityRemovalVotes.status, 'open'), lt(communityRemovalVotes.closesAt, new Date())));
  for (const { id } of due) {
    try {
      await settleRemovalVote(id);
    } catch (err: any) {
      console.warn(`[removal] settling vote ${id} failed: ${err?.message}`);
    }
  }
  return due.length;
}

// ─── What members see ───────────────────────────────────────────────────────

type UserLabel = { id: number; username: string; name: string | null; profilePicture: string | null };

async function labelsFor(ids: Array<number | null | undefined>): Promise<Map<number, UserLabel>> {
  const unique = Array.from(new Set(ids.filter((id): id is number => typeof id === 'number')));
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ id: users.id, username: users.username, name: users.name, profilePicture: users.profilePicture })
    .from(users)
    .where(inArray(users.id, unique));
  return new Map(rows.map((r) => [r.id, r]));
}

/**
 * Open and recent removal votes plus the removal log, for a member's eyes.
 * Only totals are shown; who voted which way is never exposed.
 */
export async function removalOverview(communityId: number, viewerId: number) {
  // Settle anything overdue so nobody sees a vote past its deadline as open.
  const overdue = await db
    .select({ id: communityRemovalVotes.id })
    .from(communityRemovalVotes)
    .where(and(
      eq(communityRemovalVotes.communityId, communityId),
      eq(communityRemovalVotes.status, 'open'),
      lt(communityRemovalVotes.closesAt, new Date()),
    ));
  for (const { id } of overdue) await settleRemovalVote(id).catch(() => {});

  const [community] = await db
    .select({ minParticipationPct: communities.minParticipationPct })
    .from(communities)
    .where(eq(communities.id, communityId));

  const votes = await db
    .select()
    .from(communityRemovalVotes)
    .where(and(
      eq(communityRemovalVotes.communityId, communityId),
      sql`(${communityRemovalVotes.status} = 'open' OR ${communityRemovalVotes.decidedAt} > now() - interval '30 days')`,
    ))
    .orderBy(desc(communityRemovalVotes.createdAt))
    .limit(30);

  const removals = await db
    .select()
    .from(communityRemovals)
    .where(eq(communityRemovals.communityId, communityId))
    .orderBy(desc(communityRemovals.createdAt))
    .limit(50);

  const labels = await labelsFor([
    ...votes.flatMap((v) => [v.targetUserId, v.openedByUserId]),
    ...removals.flatMap((r) => [r.userId, r.removedByUserId]),
  ]);

  const voteViews = [];
  for (const v of votes) {
    let yes = v.yesCount, no = v.noCount, eligibleCount = v.eligibleCount;
    let myChoice: string | null = null;
    let canVote = false;
    if (v.status === 'open') {
      const eligible = await eligibleVoterIds(v);
      ({ yes, no } = await countBallots(v.id, eligible));
      eligibleCount = eligible.length;
      canVote = eligible.includes(viewerId);
    }
    const [mine] = await db
      .select({ choice: communityRemovalBallots.choice })
      .from(communityRemovalBallots)
      .where(and(eq(communityRemovalBallots.voteId, v.id), eq(communityRemovalBallots.userId, viewerId)));
    myChoice = mine?.choice ?? null;
    voteViews.push({
      id: v.id,
      status: v.status,
      reason: v.reason,
      targetResponse: v.targetResponse,
      target: labels.get(v.targetUserId) ?? null,
      openedBy: v.openedByUserId ? labels.get(v.openedByUserId) ?? null : null,
      openedByMe: v.openedByUserId === viewerId,
      isAboutMe: v.targetUserId === viewerId,
      yes,
      no,
      eligible: eligibleCount,
      quorum: removalQuorum(eligibleCount, community?.minParticipationPct),
      myChoice,
      canVote,
      closesAt: v.closesAt,
      decidedAt: v.decidedAt,
      createdAt: v.createdAt,
    });
  }

  const now = Date.now();
  return {
    votes: voteViews,
    removals: removals.map((r) => ({
      id: r.id,
      user: labels.get(r.userId) ?? null,
      removedBy: r.removedByUserId ? labels.get(r.removedByUserId) ?? null : null,
      byVote: r.voteId != null,
      reason: r.reason,
      createdAt: r.createdAt,
      rejoinAfter: r.rejoinAfter,
      lifted: r.liftedAt != null,
      blocking: r.liftedAt == null && r.rejoinAfter.getTime() > now,
    })),
  };
}
