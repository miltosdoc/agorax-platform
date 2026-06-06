/**
 * Notifications Router
 *
 * Handles notifications routes.
 */

import type { Express, Request, Response } from 'express';
import { notificationRepo } from '../storage';
import { requireAuth } from '../auth';
import { db } from '../db';
import { eq, and, desc, sql, inArray, or } from 'drizzle-orm';
import { z } from 'zod';
import { sortitionNotifications } from '@shared/schema';
import { notificationBus, type NotificationEvent } from '../utils/notification-bus';

export function registerNotificationsRoutes(app: Express): void {

  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const notifications = await notificationRepo.getUserNotifications(userId);
      res.json(notifications);
    } catch (error) {
      res.status(500).json({ message: "Σφάλμα κατά την ανάκτηση ειδοποιήσεων" });
    }
  });
  app.post("/api/notifications/:id/read", requireAuth, async (req, res) => {
    try {
      const notificationId = parseInt(req.params.id);
      const userId = req.user!.id;
      const notifications = await notificationRepo.getUserNotifications(userId);
      const notification = notifications.find(n => n.id === notificationId);
      if (!notification) {
        return res.status(404).json({ message: "Η ειδοποίηση δεν βρέθηκε" });
      }
      if (notification.userId !== userId) {
        return res.status(403).json({ message: "Δεν έχετε δικαίωμα πρόσβασης σε αυτή την ειδοποίηση" });
      }
      const updatedNotification = await notificationRepo.markNotificationAsRead(notificationId);
      res.json({ success: true, notification: updatedNotification });
    } catch (error) {
      res.status(500).json({ message: "Σφάλμα κατά την ενημέρωση ειδοποίησης" });
    }
  });
  app.get("/api/notifications/unread/count", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const notifications = await notificationRepo.getUserNotifications(userId);
      const unreadCount = notifications.filter(n => !n.read).length;
      res.json({ count: unreadCount });
    } catch (error) {
      res.status(500).json({ message: "Σφάλμα κατά την ανάκτηση μη αναγνωσμένων ειδοποιήσεων" });
    }
  });
  // User location routes
  const locationSchema = z.object({
    latitude: z.string().optional(),
    longitude: z.string().optional(),
    locationConfirmed: z.boolean().optional(),
  });
  // Location verification schema
  const verifyLocationSchema = z.object({
    verified: z.boolean()
  });
  app.get("/api/sortition-notifications", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user!.id;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const unreadOnly = req.query.unread === 'true';
      const conditions = unreadOnly
        ? and(eq(sortitionNotifications.userId, userId), eq(sortitionNotifications.read, false))
        : eq(sortitionNotifications.userId, userId);
      const notifications = await db
        .select()
        .from(sortitionNotifications)
        .where(conditions)
        .orderBy(desc(sortitionNotifications.createdAt))
        .limit(limit)
        .offset(offset);
      const [unread] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(sortitionNotifications)
        .where(and(eq(sortitionNotifications.userId, userId), eq(sortitionNotifications.read, false)));
      res.json({
        notifications,
        unreadCount: unread?.count ?? 0,
        total: notifications.length,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });
  app.get("/api/sortition-notifications/unread-count", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user!.id;
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(sortitionNotifications)
        .where(and(eq(sortitionNotifications.userId, userId), eq(sortitionNotifications.read, false)));
      res.json({ count: row?.count ?? 0 });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch unread count" });
    }
  });
  app.post("/api/sortition-notifications/:id/read", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user!.id;
      const notificationId = parseInt(req.params.id);
      const [existing] = await db
        .select({ userId: sortitionNotifications.userId })
        .from(sortitionNotifications)
        .where(eq(sortitionNotifications.id, notificationId));
      if (!existing) {
        return res.status(404).json({ message: "Notification not found" });
      }
      if (existing.userId !== userId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      await db
        .update(sortitionNotifications)
        .set({ read: true, readAt: new Date() })
        .where(eq(sortitionNotifications.id, notificationId));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to mark as read" });
    }
  });
  // ─── SSE: Real-time notification stream ─────────────────────────────────
  // GET /api/sortition-notifications/stream — keeps a long-lived connection
  // open and pushes each new notification as a `data:` SSE frame. Clients use
  // EventSource() and update their bell badge / show a local toast on receive.
  app.get("/api/sortition-notifications/stream", requireAuth, async (req: any, res) => {
    const userId: number = req.user!.id;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering if proxied
    res.flushHeaders?.();

    // Initial comment so the client knows we're live.
    res.write(': connected\n\n');

    const send = (event: NotificationEvent) => {
      try {
        res.write(`event: notification\ndata: ${JSON.stringify(event)}\n\n`);
      } catch {
        // socket likely dropped — cleanup handler will run
      }
    };
    const unsubscribe = notificationBus.subscribe(userId, send);

    // Heartbeat every 25s — keeps proxies from idling the connection, and
    // lets us detect dead clients via the write throwing.
    const heartbeat = setInterval(() => {
      try { res.write(': ping\n\n'); } catch { /* noop */ }
    }, 25_000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  app.post("/api/sortition-notifications/mark-all-read", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user!.id;
      await db
        .update(sortitionNotifications)
        .set({ read: true, readAt: new Date() })
        .where(and(eq(sortitionNotifications.userId, userId), eq(sortitionNotifications.read, false)));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to mark all as read" });
    }
  });
  app.get("/api/notification-preferences", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user!.id;
      const { getOrCreatePreferences } = await import('../utils/notifications');
      const prefs = await getOrCreatePreferences(userId);
      res.json(prefs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch preferences" });
    }
  });
  app.patch("/api/notification-preferences", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user!.id;
      const { updatePreferences } = await import('../utils/notifications');
      await updatePreferences(userId, req.body);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to update preferences" });
    }
  });
  // ─── End Sortition Notification Routes ──────────────────────────────────
}