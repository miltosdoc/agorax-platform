/**
 * Notification Repository
 *
 * Handles user notifications: get notifications, mark as read,
 * and enrich poll data with user context.
 */

import { db } from '../db';
import { pollNotifications, polls, pollOptions, votes, type PollNotification, type Poll, type PollWithOptions } from '../../shared/schema';
import { eq, and, desc } from 'drizzle-orm';

export class NotificationRepository {

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

