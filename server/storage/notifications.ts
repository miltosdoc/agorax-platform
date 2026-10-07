/**
 * Notification Repository
 *
 * Handles user notifications: get notifications, mark as read,
 * and enrich poll data with user context.
 */

import { db } from '../db';
import { pollNotifications, polls, pollOptions, votes, sortitionNotifications, type Poll } from '../../shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

export interface NotificationListOptions {
  limit: number;
  offset: number;
  unreadOnly: boolean;
}

/** Reject ambiguous inputs and cap a page before it reaches the database. */
export function parseNotificationListQuery(query: Record<string, unknown>): NotificationListOptions {
  const integer = (value: unknown, fallback: number, minimum: number): number => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new Error('Invalid notification pagination');
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < minimum) throw new Error('Invalid notification pagination');
    return parsed;
  };
  const limit = Math.min(integer(query.limit, 50, 1), 100);
  const offset = integer(query.offset, 0, 0);
  if (offset > 2_147_483_647) throw new Error('Invalid notification offset');
  if (query.unread !== undefined && query.unread !== 'true' && query.unread !== 'false') throw new Error('Invalid notification filter');
  return { limit, offset, unreadOnly: query.unread === 'true' };
}

export class NotificationRepository {

  /** Recipient-scoped notifications with counts independent of the page size. */
  async getSortitionNotifications(userId: number, { limit, offset, unreadOnly }: NotificationListOptions) {
    const unreadConditions = and(eq(sortitionNotifications.userId, userId), eq(sortitionNotifications.read, false));
    const conditions = unreadOnly ? unreadConditions : eq(sortitionNotifications.userId, userId);
    const [notifications, [unread], [total]] = await Promise.all([
      db.select().from(sortitionNotifications).where(conditions)
        .orderBy(desc(sortitionNotifications.createdAt), desc(sortitionNotifications.id)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(sortitionNotifications).where(unreadConditions),
      db.select({ count: sql<number>`count(*)::int` }).from(sortitionNotifications).where(conditions),
    ]);
    return { notifications, unreadCount: unread?.count ?? 0, total: total?.count ?? 0 };
  }

  /**
   * Get all notifications for a user.
   * @returns Array of notifications with enriched poll data.
   */
  async getUserNotifications(userId: number) {
    const notifications = await db
      .select()
      .from(pollNotifications)
      .where(eq(pollNotifications.userId, userId))
      .orderBy(desc(pollNotifications.createdAt));

    // Enrich each notification with poll data
    const enriched = [];
    for (const notification of notifications) {
      let poll = undefined;
      if (notification.pollId) {
        const [foundPoll] = await db
          .select()
          .from(polls)
          .where(eq(polls.id, notification.pollId));
        if (foundPoll) {
          poll = await this.enrichPoll(foundPoll, userId);
        }
      }
      enriched.push({ ...notification, poll });
    }

    return enriched;
  }

  /**
   * Mark a notification as read.
   * @returns The updated notification.
   * @throws Error if notification not found.
   */
  async markNotificationAsRead(notificationId: number) {
    const [updatedNotification] = await db
      .update(pollNotifications)
      .set({ read: true })
      .where(eq(pollNotifications.id, notificationId))
      .returning();

    if (!updatedNotification) {
      throw new Error("Notification not found");
    }

    return updatedNotification;
  }

  /**
   * Enrich a poll with options and user vote data.
   * @returns Poll with options and user vote information.
   */
  private async enrichPoll(poll: Poll, userId?: number) {
    // Get options
    const options = await db
      .select()
      .from(pollOptions)
      .where(eq(pollOptions.pollId, poll.id))
      .orderBy(pollOptions.order);

    // Get user vote if provided
    let userVote = undefined;
    if (userId) {
      const [vote] = await db
        .select()
        .from(votes)
        .where(and(
          eq(votes.pollId, poll.id),
          eq(votes.userId, userId)
        ));
      userVote = vote;
    }

    return {
      ...poll,
      options,
      userVote,
    };
  }

}
