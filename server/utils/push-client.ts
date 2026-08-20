/**
 * Web Push delivery — VAPID-signed, encrypted-at-rest payloads to the
 * browser push services (FCM for Chrome/Edge/Firefox, APNs-WebPush
 * for Safari/iOS 16.4+).
 *
 * Env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_CONTACT (mailto:).
 * If any is missing every call here returns silently — push is
 * graceful-degradation, in-app notifications still fire.
 */

import webpush from 'web-push';
import { db } from '../db';
import { pushSubscriptions } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { logger } from './logger';

let configured = false;

function configure(): boolean {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const contact = process.env.VAPID_CONTACT || 'mailto:noreply@agorax.gr';
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(contact, publicKey, privateKey);
  configured = true;
  return true;
}

export function isPushConfigured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function publicVapidKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;       // where the bell click should land
  tag?: string;       // service-worker dedup key
}

/**
 * Send a single notification to one subscription. On a 410/404 the
 * subscription is dead (browser cleared site data, user uninstalled the
 * PWA, etc.) so we purge the row — keeps the table tidy without a cron.
 */
async function deliver(
  sub: { id: number; endpoint: string; p256dh: string; auth: string },
  payload: PushPayload,
): Promise<void> {
  if (!configure()) return;
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify(payload),
      { TTL: 60 * 60 },
    );
    await db.update(pushSubscriptions)
      .set({ lastUsedAt: new Date() })
      .where(eq(pushSubscriptions.id, sub.id));
  } catch (err: any) {
    const status = err?.statusCode ?? err?.status;
    if (status === 404 || status === 410) {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
      return;
    }
    logger.warn('web push delivery failed', {
      subId: sub.id, status, err: err?.body ?? err?.message,
    });
  }
}

/**
 * Fan out a push notification to every active subscription of every
 * user in `userIds`. Non-blocking from the caller's perspective: a
 * failure in any one delivery does not affect the others, and the
 * fan-out itself never throws.
 */
export async function pushToUsers(userIds: number[], payload: PushPayload): Promise<void> {
  if (!isPushConfigured() || userIds.length === 0) return;
  try {
    const subs = await db
      .select({
        id: pushSubscriptions.id,
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
        userId: pushSubscriptions.userId,
      })
      .from(pushSubscriptions);
    const wanted = new Set(userIds);
    const targets = subs.filter(s => wanted.has(s.userId));
    await Promise.all(targets.map(s => deliver(s, payload)));
  } catch (err: any) {
    logger.warn('pushToUsers failed', { err: err?.message });
  }
}
