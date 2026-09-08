/**
 * Discovery Repository
 *
 * The shelves the AGORA 2026 design hangs off the sides of every page:
 * bookmarks, tags, community meetings, the newsletter list, and the curated
 * Κατακτήσεις Δημοκρατίας.
 *
 * They share a file because they share a shape — small, mostly-read tables
 * that decorate the main objects without participating in deliberation. None
 * of them may ever gate a vote, a proposal phase, or a member's standing; if
 * something here starts deciding who may do what, it belongs in its own
 * repository next to the machinery it governs.
 *
 * Access control lives in the router, as everywhere else in this codebase.
 * This file reads and writes rows.
 */

import { randomBytes } from 'crypto';
import { db } from '../db';
import {
  bookmarks,
  tags,
  entityTags,
  communityMeetings,
  meetingRsvps,
  newsletterSubscribers,
  democracyAchievements,
  livekitRooms,
  communities,
  communityMembers,
  communityPosts,
  communityMedia,
  proposals,
  users,
  type CommunityMeeting,
  type DemocracyAchievement,
} from '../../shared/schema';
import { and, asc, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';

/** The kinds a bookmark may point at. Mirrors the CHECK in migration 0046. */
export const BOOKMARK_KINDS = ['community', 'proposal', 'survey', 'media', 'post'] as const;
export type BookmarkKind = (typeof BOOKMARK_KINDS)[number];

export function isBookmarkKind(value: unknown): value is BookmarkKind {
  return typeof value === 'string' && (BOOKMARK_KINDS as readonly string[]).includes(value);
}

/** The kinds a tag may be attached to. Mirrors the CHECK in migration 0046. */
export const TAGGABLE_KINDS = ['community', 'proposal', 'survey', 'media'] as const;
export type TaggableKind = (typeof TAGGABLE_KINDS)[number];

/**
 * Fold a label into its identity. "Θεσσαλονίκη", "θεσσαλονίκη" and
 * " Θεσσαλονίκη " are one tag, not three. Accents are kept: in Greek they are
 * part of the word, and stripping them would merge distinct words.
 */
export function tagSlug(label: string): string {
  return label
    .trim()
    .toLocaleLowerCase('el')
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .slice(0, 64);
}

/**
 * One upcoming thing in a community's diary, from either of the two places a
 * community can put one.
 *
 * `source` matters to the reader, not just the code: a scheduled call is
 * joined, an announced meeting is answered. The rail shows a different action
 * for each, so it has to know which it is holding.
 */
export interface MeetingView {
  id: number;
  source: 'meeting' | 'room';
  communityId: number;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date | null;
  location: string | null;
  isOnline: boolean;
  isUrgent: boolean;
  /** Rooms only — where to join. */
  roomId: number | null;
  /** Announced meetings only; a call has no RSVP, you either join or you don't. */
  attendingCount: number;
  viewerAttending: boolean;
}

export class DiscoveryRepository {
  // ── Bookmarks ─────────────────────────────────────────────────────────────

  /**
   * Toggle and report the resulting state. One round trip per direction, and
   * the unique index is what makes the double-click safe rather than a
   * read-then-write that two tabs can both win.
   */
  async toggleBookmark(userId: number, entityType: BookmarkKind, entityId: number): Promise<boolean> {
    const deleted = await db
      .delete(bookmarks)
      .where(and(
        eq(bookmarks.userId, userId),
        eq(bookmarks.entityType, entityType),
        eq(bookmarks.entityId, entityId),
      ))
      .returning({ id: bookmarks.id });

    if (deleted.length > 0) return false;

    await db
      .insert(bookmarks)
      .values({ userId, entityType, entityId })
      .onConflictDoNothing();
    return true;
  }

  /**
   * Which of these ids has the viewer saved? Bulk on purpose: a grid of 12
   * cards must not become 12 queries.
   */
  async bookmarkedIds(userId: number, entityType: BookmarkKind, ids: number[]): Promise<Set<number>> {
    if (ids.length === 0) return new Set();
    const rows = await db
      .select({ entityId: bookmarks.entityId })
      .from(bookmarks)
      .where(and(
        eq(bookmarks.userId, userId),
        eq(bookmarks.entityType, entityType),
        inArray(bookmarks.entityId, ids),
      ));
    return new Set(rows.map((r) => r.entityId));
  }

  /** Everything a user saved, newest first, grouped by kind for the client. */
  async listBookmarks(userId: number) {
    return db
      .select()
      .from(bookmarks)
      .where(eq(bookmarks.userId, userId))
      .orderBy(desc(bookmarks.createdAt));
  }

  // ── Tags ──────────────────────────────────────────────────────────────────

  async tagsFor(entityType: TaggableKind, entityId: number) {
    return db
      .select({ id: tags.id, slug: tags.slug, label: tags.label })
      .from(entityTags)
      .innerJoin(tags, eq(entityTags.tagId, tags.id))
      .where(and(eq(entityTags.entityType, entityType), eq(entityTags.entityId, entityId)))
      .orderBy(asc(tags.label));
  }

  /**
   * Replace an object's tags with exactly this set. Labels that do not exist
   * yet are created; tags left unreferenced are NOT deleted, because a tag is
   * shared vocabulary and another object may be about to use it.
   */
  async setTags(entityType: TaggableKind, entityId: number, labels: string[]): Promise<void> {
    const wanted = new Map<string, string>();
    for (const raw of labels) {
      const slug = tagSlug(raw);
      if (slug) wanted.set(slug, raw.trim());
    }

    await db
      .delete(entityTags)
      .where(and(eq(entityTags.entityType, entityType), eq(entityTags.entityId, entityId)));

    if (wanted.size === 0) return;

    await db
      .insert(tags)
      .values([...wanted].map(([slug, label]) => ({ slug, label })))
      .onConflictDoNothing();

    const rows = await db
      .select({ id: tags.id, slug: tags.slug })
      .from(tags)
      .where(inArray(tags.slug, [...wanted.keys()]));

    if (rows.length === 0) return;
    await db
      .insert(entityTags)
      .values(rows.map((tag) => ({ tagId: tag.id, entityType, entityId })))
      .onConflictDoNothing();
  }

  // ── Meetings ──────────────────────────────────────────────────────────────

  /**
   * The next things in a community's diary.
   *
   * Reads BOTH sources deliberately. `community_meetings` holds announcements
   * — including in-person ones with an address and an RSVP. `livekit_rooms`
   * holds scheduled calls, which is what the community's own "schedule a call"
   * button has always created. Showing only the first is why a call scheduled
   * in the app never reached this card.
   *
   * Active rooms are included regardless of their scheduled time: a call
   * happening right now is the most useful row this card can carry, and it
   * would otherwise vanish the moment it started.
   */
  async upcomingMeetings(communityId: number, viewerId?: number, limit = 6): Promise<MeetingView[]> {
    const now = new Date();

    const [announced, rooms] = await Promise.all([
      db
        .select()
        .from(communityMeetings)
        .where(and(
          eq(communityMeetings.communityId, communityId),
          isNull(communityMeetings.cancelledAt),
          gte(communityMeetings.startsAt, now),
        ))
        .orderBy(asc(communityMeetings.startsAt))
        .limit(limit),

      db
        .select()
        .from(livekitRooms)
        .where(and(
          eq(livekitRooms.communityId, communityId),
          isNull(livekitRooms.closedAt),
          sql`(${livekitRooms.status} = 'active'
               or (${livekitRooms.status} = 'scheduled'
                   and ${livekitRooms.scheduledAt} is not null
                   and ${livekitRooms.scheduledAt} >= ${now}))`,
        ))
        .orderBy(asc(livekitRooms.scheduledAt))
        .limit(limit),
    ]);

    const decorated = await this.decorateMeetings(announced, viewerId);

    const roomViews: MeetingView[] = rooms.map((room) => ({
      id: room.id,
      source: 'room' as const,
      communityId: room.communityId,
      title: room.title,
      description: room.description,
      // An active call with no scheduled time is happening now.
      startsAt: room.scheduledAt ?? now,
      endsAt: null,
      location: null,
      isOnline: true,
      isUrgent: room.status === 'active',
      roomId: room.id,
      attendingCount: 0,
      viewerAttending: false,
    }));

    return [...decorated, ...roomViews]
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
      .slice(0, limit);
  }

  /**
   * Upcoming meetings across every community the viewer belongs to.
   *
   * One query rather than the client fanning out per community — which it did
   * first, capped at four to avoid a request storm, and that cap silently hid
   * meetings from a member of five communities. A cap that loses data without
   * saying so is worse than the round trips it saved.
   */
  async myUpcomingMeetings(userId: number, limit = 6): Promise<MeetingView[]> {
    const memberships = await db
      .select({ communityId: communityMembers.communityId })
      .from(communityMembers)
      .where(eq(communityMembers.userId, userId));

    const ids = memberships.map((m) => m.communityId);
    if (ids.length === 0) return [];

    const now = new Date();

    const [announced, rooms] = await Promise.all([
      db
        .select()
        .from(communityMeetings)
        .where(and(
          inArray(communityMeetings.communityId, ids),
          isNull(communityMeetings.cancelledAt),
          gte(communityMeetings.startsAt, now),
        ))
        .orderBy(asc(communityMeetings.startsAt))
        .limit(limit),

      db
        .select()
        .from(livekitRooms)
        .where(and(
          inArray(livekitRooms.communityId, ids),
          isNull(livekitRooms.closedAt),
          sql`(${livekitRooms.status} = 'active'
               or (${livekitRooms.status} = 'scheduled'
                   and ${livekitRooms.scheduledAt} is not null
                   and ${livekitRooms.scheduledAt} >= ${now}))`,
        ))
        .orderBy(asc(livekitRooms.scheduledAt))
        .limit(limit),
    ]);

    const decorated = await this.decorateMeetings(announced, userId);
    const roomViews: MeetingView[] = rooms.map((room) => ({
      id: room.id,
      source: 'room' as const,
      communityId: room.communityId,
      title: room.title,
      description: room.description,
      startsAt: room.scheduledAt ?? now,
      endsAt: null,
      location: null,
      isOnline: true,
      isUrgent: room.status === 'active',
      roomId: room.id,
      attendingCount: 0,
      viewerAttending: false,
    }));

    return [...decorated, ...roomViews]
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
      .slice(0, limit);
  }

  private async decorateMeetings(rows: CommunityMeeting[], viewerId?: number): Promise<MeetingView[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);

    const counts = await db
      .select({ meetingId: meetingRsvps.meetingId, count: sql<number>`count(*)::int` })
      .from(meetingRsvps)
      .where(and(inArray(meetingRsvps.meetingId, ids), eq(meetingRsvps.status, 'yes')))
      .groupBy(meetingRsvps.meetingId);
    const countByMeeting = new Map(counts.map((c) => [c.meetingId, c.count]));

    let mine = new Set<number>();
    if (viewerId) {
      const rsvps = await db
        .select({ meetingId: meetingRsvps.meetingId })
        .from(meetingRsvps)
        .where(and(
          inArray(meetingRsvps.meetingId, ids),
          eq(meetingRsvps.userId, viewerId),
          eq(meetingRsvps.status, 'yes'),
        ));
      mine = new Set(rsvps.map((r) => r.meetingId));
    }

    return rows.map((row) => ({
      id: row.id,
      source: 'meeting' as const,
      communityId: row.communityId,
      title: row.title,
      description: row.description,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      location: row.location,
      isOnline: row.isOnline,
      isUrgent: row.isUrgent,
      roomId: row.roomId,
      attendingCount: countByMeeting.get(row.id) ?? 0,
      viewerAttending: mine.has(row.id),
    }));
  }

  async getMeeting(id: number): Promise<CommunityMeeting | undefined> {
    const [row] = await db.select().from(communityMeetings).where(eq(communityMeetings.id, id));
    return row;
  }

  async createMeeting(values: {
    communityId: number; createdBy: number; title: string; description?: string | null;
    startsAt: Date; endsAt?: Date | null; location?: string | null; isOnline: boolean;
    isUrgent?: boolean;
  }): Promise<CommunityMeeting> {
    const [row] = await db.insert(communityMeetings).values(values).returning();
    return row;
  }

  /** Returns the viewer's new attendance state. */
  async toggleRsvp(meetingId: number, userId: number): Promise<boolean> {
    const [existing] = await db
      .select()
      .from(meetingRsvps)
      .where(and(eq(meetingRsvps.meetingId, meetingId), eq(meetingRsvps.userId, userId)));

    if (existing && existing.status === 'yes') {
      // 'no' rather than a delete: an explicit decline is information the
      // organiser can act on, an absent row is not.
      await db
        .update(meetingRsvps)
        .set({ status: 'no' })
        .where(eq(meetingRsvps.id, existing.id));
      return false;
    }

    if (existing) {
      await db.update(meetingRsvps).set({ status: 'yes' }).where(eq(meetingRsvps.id, existing.id));
      return true;
    }

    await db.insert(meetingRsvps).values({ meetingId, userId, status: 'yes' }).onConflictDoNothing();
    return true;
  }

  // ── Newsletter ────────────────────────────────────────────────────────────

  /**
   * Record an address and hand back the token that confirms it.
   *
   * Re-subscribing an address that is already confirmed is a no-op that
   * returns null: it must not mint a fresh confirm token, or the endpoint
   * becomes a way to make this server mail an arbitrary address on demand.
   */
  async subscribeNewsletter(email: string, locale: string, userId?: number): Promise<string | null> {
    const normalised = email.trim();
    const [existing] = await db
      .select()
      .from(newsletterSubscribers)
      .where(sql`lower(${newsletterSubscribers.email}) = lower(${normalised})`);

    if (existing?.confirmedAt && !existing.unsubscribedAt) return null;

    const confirmToken = randomBytes(24).toString('hex');
    if (existing) {
      await db
        .update(newsletterSubscribers)
        .set({ confirmToken, locale, userId: userId ?? existing.userId, unsubscribedAt: null })
        .where(eq(newsletterSubscribers.id, existing.id));
      return confirmToken;
    }

    await db.insert(newsletterSubscribers).values({
      email: normalised,
      locale,
      userId: userId ?? null,
      confirmToken,
      unsubscribeToken: randomBytes(24).toString('hex'),
    });
    return confirmToken;
  }

  async confirmNewsletter(token: string): Promise<boolean> {
    const updated = await db
      .update(newsletterSubscribers)
      .set({ confirmedAt: new Date(), confirmToken: null })
      .where(and(eq(newsletterSubscribers.confirmToken, token), isNull(newsletterSubscribers.confirmedAt)))
      .returning({ id: newsletterSubscribers.id });
    return updated.length > 0;
  }

  async unsubscribeNewsletter(token: string): Promise<boolean> {
    const updated = await db
      .update(newsletterSubscribers)
      .set({ unsubscribedAt: new Date() })
      .where(eq(newsletterSubscribers.unsubscribeToken, token))
      .returning({ id: newsletterSubscribers.id });
    return updated.length > 0;
  }

  // ── Κατακτήσεις Δημοκρατίας ───────────────────────────────────────────────

  /**
   * Published achievements, newest first. Unpublished rows are invisible to
   * everyone including their author: the card is an editorial surface, and a
   * draft on it would read as a claim the community has not made.
   */
  async listAchievements(limit = 6): Promise<Array<DemocracyAchievement & { communityName: string | null }>> {
    const rows = await db
      .select({
        achievement: democracyAchievements,
        communityName: communities.name,
      })
      .from(democracyAchievements)
      .leftJoin(communities, eq(democracyAchievements.communityId, communities.id))
      .where(sql`${democracyAchievements.publishedAt} is not null`)
      .orderBy(desc(democracyAchievements.publishedAt))
      .limit(limit);

    return rows.map((r) => ({ ...r.achievement, communityName: r.communityName }));
  }
}

// ─── Community activity ─────────────────────────────────────────────────────

export interface ActivityEvent {
  kind: 'joined' | 'proposal' | 'post' | 'media' | 'decided';
  at: Date;
  actorName: string | null;
  title: string | null;
  href: string | null;
  count?: number;
}

/**
 * The "Ροή δραστηριότητας" of a community page.
 *
 * Composed from public acts only. The comps show a line reading "Eleni voted
 * on the proposal …", and that line is not built here: naming who voted
 * publishes participation this platform never publishes elsewhere, and on a
 * small proposal turnout plus a couple of such lines narrows the ballot
 * considerably. A decided proposal is reported with its total instead, which
 * is the fact the reader actually wanted.
 */
export async function communityActivity(communityId: number, limit = 12): Promise<ActivityEvent[]> {
  const [joins, newProposals, decided, posts, media] = await Promise.all([
    db.select({ at: communityMembers.joinedAt, name: users.name })
      .from(communityMembers)
      .innerJoin(users, eq(communityMembers.userId, users.id))
      .where(eq(communityMembers.communityId, communityId))
      .orderBy(desc(communityMembers.joinedAt))
      .limit(limit),

    db.select({ at: proposals.createdAt, name: users.name, id: proposals.id, question: proposals.question })
      .from(proposals)
      .innerJoin(users, eq(proposals.authorId, users.id))
      .where(and(eq(proposals.communityId, communityId), sql`${proposals.status} not in ('draft','archived')`))
      .orderBy(desc(proposals.createdAt))
      .limit(limit),

    db.select({
        at: proposals.updatedAt,
        id: proposals.id,
        question: proposals.question,
        votes: sql<number>`(select count(*)::int from proposal_votes pv where pv.proposal_id = ${proposals.id})`,
      })
      .from(proposals)
      .where(and(eq(proposals.communityId, communityId), eq(proposals.status, 'decided')))
      .orderBy(desc(proposals.updatedAt))
      .limit(limit),

    db.select({ at: communityPosts.createdAt, name: users.name, id: communityPosts.id, title: communityPosts.title })
      .from(communityPosts)
      .innerJoin(users, eq(communityPosts.authorId, users.id))
      .where(and(
        eq(communityPosts.communityId, communityId),
        isNull(communityPosts.parentId),
        isNull(communityPosts.deletedAt),
        isNull(communityPosts.hiddenAt),
      ))
      .orderBy(desc(communityPosts.createdAt))
      .limit(limit),

    db.select({ at: communityMedia.createdAt, name: users.name, title: communityMedia.title, kind: communityMedia.kind })
      .from(communityMedia)
      .innerJoin(users, eq(communityMedia.uploaderId, users.id))
      .where(and(eq(communityMedia.communityId, communityId), eq(communityMedia.status, 'published')))
      .orderBy(desc(communityMedia.createdAt))
      .limit(limit),
  ]);

  const events: ActivityEvent[] = [
    ...joins.map((r) => ({ kind: 'joined' as const, at: r.at, actorName: r.name, title: null, href: null })),
    ...newProposals.map((r) => ({ kind: 'proposal' as const, at: r.at, actorName: r.name, title: r.question, href: `/proposals/${r.id}` })),
    ...decided.map((r) => ({ kind: 'decided' as const, at: r.at, actorName: null, title: r.question, href: `/proposals/${r.id}`, count: r.votes })),
    ...posts.map((r) => ({ kind: 'post' as const, at: r.at, actorName: r.name, title: r.title, href: `/communities/${communityId}?tab=forum` })),
    ...media.map((r) => ({ kind: 'media' as const, at: r.at, actorName: r.name, title: r.title, href: `/communities/${communityId}?tab=library` })),
  ];

  return events
    .filter((e) => e.at instanceof Date || typeof e.at === 'string')
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit);
}
