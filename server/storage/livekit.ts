/**
 * LiveKit rooms repository — DB-side state for community + sortition
 * conference rooms. The SFU itself is stateless from our app's
 * perspective; this table is what we use to enumerate, gate access,
 * and remember settings across page loads.
 */

import { db } from '../db';
import {
  livekitRooms,
  type LivekitRoom,
  type InsertLivekitRoom,
} from '../../shared/schema';
import { and, desc, eq, sql } from 'drizzle-orm';

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
