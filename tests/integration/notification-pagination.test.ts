import 'dotenv/config';
import { afterAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../server/db';
import { users, sortitionNotifications } from '../../shared/schema';
import { NotificationRepository, parseNotificationListQuery } from '../../server/storage/notifications';

describe('notification query parameters', () => {
  it('keeps defaults compatible and supports both list filters', () => {
    expect(parseNotificationListQuery({})).toEqual({ limit: 50, offset: 0, unreadOnly: false });
    expect(parseNotificationListQuery({ limit: '20', offset: '0', unread: 'true' })).toEqual({ limit: 20, offset: 0, unreadOnly: true });
    expect(parseNotificationListQuery({ limit: '5', offset: '10', unread: 'false' })).toEqual({ limit: 5, offset: 10, unreadOnly: false });
  });

  it('caps oversized pages', () => {
    expect(parseNotificationListQuery({ limit: '10000' }).limit).toBe(100);
  });

  it.each([
    { limit: '0' }, { limit: '-1' }, { limit: '1.5' }, { limit: '20extra' }, { limit: '' }, { limit: ['20'] },
    { offset: '-1' }, { offset: '1.5' }, { offset: 'Infinity' }, { offset: '2147483648' }, { offset: {} },
    { limit: '9007199254740992' }, { unread: 'yes' }, { unread: ['true'] },
  ])('rejects invalid notification query %j', query => {
    expect(() => parseNotificationListQuery(query)).toThrow();
  });
});

const fixtureUserIds: number[] = [];
afterAll(async () => {
  if (fixtureUserIds.length) {
    await db.delete(sortitionNotifications).where(inArray(sortitionNotifications.userId, fixtureUserIds));
    await db.delete(users).where(inArray(users.id, fixtureUserIds));
  }
});

describe('recipient-scoped notification pagination', () => {
  it('reports the full filtered count, paginates tied timestamps and excludes another recipient', async () => {
    const tag = `notifications-${process.pid}-${Date.now()}`;
    const accounts = await db.insert(users).values([
      { username: `${tag}-a`, name: `${tag}-a`, email: `${tag}-a@example.invalid` },
      { username: `${tag}-b`, name: `${tag}-b`, email: `${tag}-b@example.invalid` },
    ]).returning();
    fixtureUserIds.push(...accounts.map(account => account.id));
    const viewerId = accounts[0].id;
    const createdAt = new Date('2026-10-07T08:00:00.000Z');
    const rows = await db.insert(sortitionNotifications).values([
      { userId: viewerId, type: 'platform_update', title: 'Already read', read: true, createdAt },
      { userId: viewerId, type: 'forum_reply', title: 'Unread older ID', read: false, createdAt },
      { userId: viewerId, type: 'new_proposal', title: 'Unread newest ID', read: false, createdAt },
      { userId: accounts[1].id, type: 'platform_update', title: 'Another recipient', read: false, createdAt },
    ]).returning();
    const repository = new NotificationRepository();
    const unreadFirst = await repository.getSortitionNotifications(viewerId, { limit: 1, offset: 0, unreadOnly: true });
    expect(unreadFirst.notifications.map(notification => notification.id)).toEqual([rows[2].id]);
    expect(unreadFirst.total).toBe(2);
    expect(unreadFirst.unreadCount).toBe(2);
    const unreadSecond = await repository.getSortitionNotifications(viewerId, { limit: 1, offset: 1, unreadOnly: true });
    expect(unreadSecond.notifications.map(notification => notification.id)).toEqual([rows[1].id]);
    const all = await repository.getSortitionNotifications(viewerId, { limit: 1, offset: 0, unreadOnly: false });
    expect(all.total).toBe(3);
    expect(all.unreadCount).toBe(2);
    expect(all.notifications).toHaveLength(1);
    const pastEnd = await repository.getSortitionNotifications(viewerId, { limit: 1, offset: 99, unreadOnly: false });
    expect(pastEnd.notifications).toEqual([]);
    expect(pastEnd.total).toBe(3);
    expect(await db.select().from(sortitionNotifications).where(eq(sortitionNotifications.userId, accounts[1].id))).toHaveLength(1);
  });
});
