/**
 * Web Push Router — manages the per-browser PushSubscription rows.
 *
 *   GET    /api/push/public-key — VAPID public key the browser needs
 *                                 to call `pushManager.subscribe`.
 *   POST   /api/push/subscribe  — upsert (endpoint, keys, ua) for the
 *                                 current user. Endpoint is unique, so
 *                                 a re-subscribe on the same browser
 *                                 just updates the timestamp.
 *   DELETE /api/push/subscribe  — remove a single subscription by
 *                                 endpoint (clicked "disable" in the UI).
 */

import type { Express } from 'express';
import { db } from '../db';
import { pushSubscriptions } from '@shared/schema';
import { and, eq } from 'drizzle-orm';
import { requireAuth } from '../auth';
import { isPushConfigured, publicVapidKey } from '../utils/push-client';
import { logger } from '../utils/logger';

export function registerPushRoutes(app: Express): void {

  app.get('/api/push/public-key', (req, res) => {
    if (!isPushConfigured()) {
      return res.json({ available: false });
    }
    res.json({ available: true, publicKey: publicVapidKey() });
  });

  app.post('/api/push/subscribe', requireAuth, async (req: any, res) => {
    try {
      if (!isPushConfigured()) {
        return res.status(503).json({ message: 'push not configured' });
      }
      const userId: number = req.user.id;
      const { endpoint, keys } = req.body ?? {};
      if (typeof endpoint !== 'string' || !endpoint
          || !keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') {
        return res.status(400).json({ message: 'endpoint and keys{p256dh, auth} required' });
      }
      const userAgent = (req.headers['user-agent'] as string | undefined)?.slice(0, 500) ?? null;
      // Upsert — same endpoint on the same browser reusing its subscription.
      const existing = await db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, endpoint));
      if (existing.length > 0) {
        await db.update(pushSubscriptions)
          .set({ userId, p256dh: keys.p256dh, auth: keys.auth, userAgent, lastUsedAt: new Date() })
          .where(eq(pushSubscriptions.endpoint, endpoint));
        return res.status(200).json({ ok: true, id: existing[0].id });
      }
      const [row] = await db.insert(pushSubscriptions).values({
        userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent,
      }).returning({ id: pushSubscriptions.id });
      res.status(201).json({ ok: true, id: row.id });
    } catch (err: any) {
      logger.error('push subscribe failed', { err: err?.message });
      res.status(500).json({ message: 'failed to subscribe' });
    }
  });

  app.delete('/api/push/subscribe', requireAuth, async (req: any, res) => {
    try {
      const userId: number = req.user.id;
      const { endpoint } = req.body ?? {};
      if (typeof endpoint !== 'string' || !endpoint) {
        return res.status(400).json({ message: 'endpoint required' });
      }
      await db.delete(pushSubscriptions).where(and(
        eq(pushSubscriptions.endpoint, endpoint),
        eq(pushSubscriptions.userId, userId),
      ));
      res.json({ ok: true });
    } catch (err: any) {
      logger.error('push unsubscribe failed', { err: err?.message });
      res.status(500).json({ message: 'failed to unsubscribe' });
    }
  });
}
