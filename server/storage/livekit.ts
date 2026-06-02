/**
 * LiveKit rooms repository — DB-side state for community + sortition
 * conference rooms. The SFU itself is stateless from our app's
 * perspective; this table is what we use to enumerate, gate access,
 * and remember settings across page loads.
 */

import { db } from '../db';
import {
  livekitRooms,
  livekitParticipations,
  users,
  type LivekitRoom,
  type InsertLivekitRoom,
} from '../../shared/schema';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';

export interface RoomHistoryEntry extends LivekitRoom {
  durationSeconds: number | null;
  participants: Array<{ userId: number; name: string; joinedAt: Date; leftAt: Date | null }>;
}

export class LivekitRepository {

  async create(insert: InsertLivekitRoom): Promise<LivekitRoom> {
    const [row] = await db.insert(livekitRooms).values(insert).returning();
    return row;
  }

  async getById(id: number): Promise<LivekitRoom | undefined> {
    const [row] = await db.select().from(livekitRooms).where(eq(livekitRooms.id, id));
    return row;
  }

  async getByRoomName(roomName: string): Promise<LivekitRoom | undefined> {
    const [row] = await db.select().from(livekitRooms).where(eq(livekitRooms.roomName, roomName));
    return row;
  }

  /**
   * Find (or null) the single sortition body's room. Used so the
   * "Deliberation Room" button is idempotent — clicking it twice
   * doesn't create two rows.
   */
  async getForSortitionBody(bodyId: number): Promise<LivekitRoom | undefined> {
    const [row] = await db
      .select()
      .from(livekitRooms)
      .where(eq(livekitRooms.sortitionBodyId, bodyId));
    return row;
  }

  /**
   * Open community rooms — what the dashboard meetings widget pulls.
   * Hides closed rooms; sortition rooms never appear here.
   */
  async listOpenForCommunity(communityId: number): Promise<LivekitRoom[]> {
    return await db
      .select()
      .from(livekitRooms)
      .where(and(
        eq(livekitRooms.communityId, communityId),
        eq(livekitRooms.kind, 'community'),
        sql`${livekitRooms.status} IN ('scheduled', 'active')`,
      ))
      .orderBy(desc(livekitRooms.createdAt));
  }

  async setStatus(id: number, status: 'scheduled' | 'active' | 'closed'): Promise<LivekitRoom> {
    const update: Partial<LivekitRoom> = { status };
    if (status === 'closed') update.closedAt = new Date();
    const [row] = await db
      .update(livekitRooms)
      .set(update)
      .where(eq(livekitRooms.id, id))
      .returning();
    if (!row) throw new Error('Room not found');
    return row;
  }

  /**
   * Rooms the user can currently join: every community room in a community
   * where they're a member (active OR scheduled), plus every sortition
   * room of a body they sit on. Ordered live-first then by start.
   */
  async listJoinableForUser(userId: number): Promise<LivekitRoom[]> {
    const { communityMembers, sortitionMembers } = await import('../../shared/schema');
    const myCommunities = await db
      .select({ id: communityMembers.communityId })
      .from(communityMembers)
      .where(eq(communityMembers.userId, userId));
    const myBodies = await db
      .select({ id: sortitionMembers.bodyId })
      .from(sortitionMembers)
      .where(eq(sortitionMembers.userId, userId));
    const communityIds = myCommunities.map(r => r.id);
    const bodyIds = myBodies.map(r => r.id);
    if (communityIds.length === 0 && bodyIds.length === 0) return [];

    const conditions = [sql`${livekitRooms.status} IN ('scheduled', 'active')`];
    const orParts: any[] = [];
    if (communityIds.length) {
      orParts.push(and(
        eq(livekitRooms.kind, 'community'),
        sql`${livekitRooms.communityId} IN (${sql.join(communityIds.map(id => sql`${id}`), sql`, `)})`,
      ));
    }
    if (bodyIds.length) {
      orParts.push(and(
        eq(livekitRooms.kind, 'sortition'),
        sql`${livekitRooms.sortitionBodyId} IN (${sql.join(bodyIds.map(id => sql`${id}`), sql`, `)})`,
      ));
    }
    if (orParts.length === 0) return [];
    const orClause = orParts.length === 1 ? orParts[0] : sql`(${sql.join(orParts, sql` OR `)})`;
    return await db
      .select()
      .from(livekitRooms)
      .where(and(...conditions, orClause))
      .orderBy(desc(livekitRooms.status), desc(livekitRooms.createdAt));
  }

  // ── Participation log ──────────────────────────────────────────────

  /** Insert a join row; returns the participation id for the beacon. */
  async recordJoin(roomId: number, userId: number): Promise<number> {
    const [row] = await db
      .insert(livekitParticipations)
      .values({ roomId, userId })
      .returning({ id: livekitParticipations.id });
    return row.id;
  }

  /**
   * Stamp left_at on the most recent un-closed row for this (room,user).
   * The beacon endpoint passes (roomId, userId) — we don't need the
   * specific participation id because we always close the freshest row,
   * which is unambiguous: a user can't be on two devices in the same
   * room with the same user_id.
   */
  async recordLeave(roomId: number, userId: number): Promise<void> {
    const [row] = await db
      .select({ id: livekitParticipations.id })
      .from(livekitParticipations)
      .where(and(
        eq(livekitParticipations.roomId, roomId),
        eq(livekitParticipations.userId, userId),
        isNull(livekitParticipations.leftAt),
      ))
      .orderBy(desc(livekitParticipations.joinedAt))
      .limit(1);
    if (!row) return;
    await db.update(livekitParticipations)
      .set({ leftAt: new Date() })
      .where(eq(livekitParticipations.id, row.id));
  }

  /**
   * Recent closed/finished rooms for a community with computed duration
   * and a deduped participant list (one entry per user, earliest join
   * & latest leave wins). Powers the "Recent calls" widget.
   */
  async listHistoryForCommunity(
    communityId: number,
    limit: number = 10,
  ): Promise<RoomHistoryEntry[]> {
    const rooms = await db
      .select()
      .from(livekitRooms)
      .where(and(
        eq(livekitRooms.communityId, communityId),
        eq(livekitRooms.kind, 'community'),
        eq(livekitRooms.status, 'closed'),
      ))
      .orderBy(desc(livekitRooms.closedAt))
      .limit(limit);

    if (rooms.length === 0) return [];

    const roomIds = rooms.map(r => r.id);
    const parts = await db
      .select({
        roomId: livekitParticipations.roomId,
        userId: livekitParticipations.userId,
        joinedAt: livekitParticipations.joinedAt,
        leftAt: livekitParticipations.leftAt,
        name: users.name,
      })
      .from(livekitParticipations)
      .innerJoin(users, eq(livekitParticipations.userId, users.id))
      .where(sql`${livekitParticipations.roomId} IN (${sql.join(roomIds.map(id => sql`${id}`), sql`, `)})`)
      .orderBy(livekitParticipations.joinedAt);

    // Group + dedupe by user per room.
    const grouped = new Map<number, Map<number, { name: string; joinedAt: Date; leftAt: Date | null }>>();
    for (const p of parts) {
      let perRoom = grouped.get(p.roomId);
      if (!perRoom) { perRoom = new Map(); grouped.set(p.roomId, perRoom); }
      const existing = perRoom.get(p.userId);
      if (!existing) {
        perRoom.set(p.userId, { name: p.name, joinedAt: p.joinedAt, leftAt: p.leftAt });
      } else {
        if (p.joinedAt < existing.joinedAt) existing.joinedAt = p.joinedAt;
        if (p.leftAt && (!existing.leftAt || p.leftAt > existing.leftAt)) existing.leftAt = p.leftAt;
      }
    }

    return rooms.map(room => {
      const end = room.closedAt ?? new Date();
      const start = room.createdAt;
      const durationSeconds = Math.max(0, Math.round((+end - +start) / 1000));
      const perRoom = grouped.get(room.id) ?? new Map();
      const participants = Array.from(perRoom.entries())
        .map(([userId, v]) => ({ userId, name: v.name, joinedAt: v.joinedAt, leftAt: v.leftAt }))
        .sort((a, b) => +a.joinedAt - +b.joinedAt);
      return { ...room, durationSeconds, participants };
    });
  }

  async setRecordingEnabled(id: number, enabled: boolean): Promise<LivekitRoom> {
    const [row] = await db
      .update(livekitRooms)
      .set({ recordingEnabled: enabled })
      .where(eq(livekitRooms.id, id))
      .returning();
    if (!row) throw new Error('Room not found');
    return row;
  }
}
