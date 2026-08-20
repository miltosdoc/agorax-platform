/**
 * In-process notification bus.
 *
 * `createNotification` (notifications.ts) publishes a one-line event here
 * after persisting; the SSE endpoint (routers/notifications.ts) subscribes
 * per logged-in user and pipes events to that client.
 *
 * Single-node only — fine for the current self-hosted Linux deploy. If we
 * later split the server, swap this for Postgres LISTEN/NOTIFY or Redis pub/sub.
 */

import { EventEmitter } from 'node:events';

export interface NotificationEvent {
  userId: number;
  type: string;
  title: string;
  message: string | null;
  proposalId: number | null;
  sortitionBodyId: number | null;
  communityId: number | null;
  actionUrl: string | null;
  createdAt: string;
}

class NotificationBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(0);
  }

  publish(event: NotificationEvent): void {
    this.emit(`user:${event.userId}`, event);
  }

  subscribe(userId: number, handler: (event: NotificationEvent) => void): () => void {
    const key = `user:${userId}`;
    this.on(key, handler);
    return () => this.off(key, handler);
  }
}

export const notificationBus = new NotificationBus();
