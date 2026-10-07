import 'dotenv/config';
import { afterAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../server/db';
import { communities, communityMembers, proposals, users } from '../../shared/schema';
import { decodeFeedCursor } from '../../shared/activity-feed';
import { getActivityFeed } from '../../server/storage/activity-feed';

let userId: number | undefined;
let communityId: number | undefined;
const originalTimezone = process.env.TZ;

afterAll(async () => {
  if (communityId) {
    await db.delete(proposals).where(eq(proposals.communityId, communityId));
    await db.delete(communityMembers).where(eq(communityMembers.communityId, communityId));
    await db.delete(communities).where(eq(communities.id, communityId));
  }
  if (userId) await db.delete(users).where(eq(users.id, userId));
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
});

describe('activity feed database pagination', () => {
  it('advances once through UTC timestamps on a non-UTC host, including microsecond ties', async () => {
    process.env.TZ = 'Europe/Stockholm';
    const tag = `feed-cursor-${process.pid}-${Date.now()}`;
    const [user] = await db.insert(users).values({ username: tag, name: tag, email: `${tag}@example.invalid` }).returning();
    userId = user.id;
    const [community] = await db.insert(communities).values({ name: tag, creatorId: userId, contentVisibility: 'members' }).returning();
    communityId = community.id;
    await db.insert(communityMembers).values({ communityId, userId, role: 'member' });
    const rows = await db.insert(proposals).values([
      { communityId, authorId: userId, question: 'Older', solution: 'Test', status: 'voting', createdAt: sql`'2026-10-07 10:00:00.003999'::timestamp` },
      { communityId, authorId: userId, question: 'Tied A', solution: 'Test', status: 'voting', createdAt: sql`'2026-10-07 10:00:00.004500'::timestamp` },
      { communityId, authorId: userId, question: 'Tied B', solution: 'Test', status: 'voting', createdAt: sql`'2026-10-07 10:00:00.004100'::timestamp` },
    ]).returning();
    const options = { viewerId: userId, communityId, scope: 'mine' as const, stage: 'active' as const, kind: 'proposal' as const, limit: 1 };
    const first = await getActivityFeed(options);
    expect(first.items.map(item => item.id)).toEqual([rows[2].id]);
    expect(first.nextCursor).toBeTruthy();
    const second = await getActivityFeed({ ...options, cursor: decodeFeedCursor(first.nextCursor) });
    expect(second.items.map(item => item.id)).toEqual([rows[1].id]);
    expect(second.nextCursor).toBeTruthy();
    const third = await getActivityFeed({ ...options, cursor: decodeFeedCursor(second.nextCursor) });
    expect(third.items.map(item => item.id)).toEqual([rows[0].id]);
    expect(third.nextCursor).toBeNull();
    const anonymous = await getActivityFeed({ ...options, viewerId: undefined, scope: 'all' });
    expect(anonymous.items).toEqual([]);
  });
});
