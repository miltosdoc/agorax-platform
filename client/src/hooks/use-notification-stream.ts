/**
 * Real-time notification subscriber.
 *
 * Opens an EventSource against `/api/sortition-notifications/stream` and:
 *   1. Invalidates the React Query caches that drive the bell badge + list,
 *      so they show the new state without waiting for the 30s poll.
 *   2. If the page is running inside the Capacitor Android wrapper, hands
 *      the event to the native LocalNotifications plugin so the user gets
 *      a real Android system notification (visible even with the app in the
 *      foreground on another tab).
 *
 * Falls back silently if the browser has no EventSource (very old) or the
 * server hasn't been deployed with the stream route yet (404 → onerror →
 * automatic reconnect attempts handled by EventSource).
 *
 * The Capacitor bridge is dynamic — no client dependency on @capacitor/core
 * in the web bundle. When this hook runs inside the APK, `window.Capacitor`
 * is injected by the runtime and `Plugins.LocalNotifications` is available
 * because we installed the plugin in mobile/.
 */

import { useEffect } from 'react';
import { queryClient } from '@/lib/queryClient';

interface IncomingNotification {
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

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      Plugins?: {
        LocalNotifications?: {
          schedule: (opts: {
            notifications: Array<{
              id: number;
              title: string;
              body: string;
              channelId?: string;
              smallIcon?: string;
              extra?: Record<string, unknown>;
            }>;
          }) => Promise<unknown>;
          requestPermissions?: () => Promise<{ display: string }>;
          createChannel?: (opts: {
            id: string;
            name: string;
            description?: string;
            importance: 1 | 2 | 3 | 4 | 5;  // 5 = IMPORTANCE_HIGH (pop-up + sound)
            visibility?: -1 | 0 | 1;
            sound?: string;
            vibration?: boolean;
            lights?: boolean;
            lightColor?: string;
          }) => Promise<unknown>;
        };
      };
    };
  }
}

// Channel id used by every native notification we schedule. Android 8+
// notifications need a channel; the channel's importance controls whether
// the notification pops as a banner or just lands silently in the tray.
// Capacitor's auto-created default channel uses importance 4 (Default —
// no pop-up), so we make and use our own at importance 5 (High).
const ANDROID_CHANNEL_ID = 'agorax-default-high';
let channelEnsured = false;

async function ensureAndroidChannel(): Promise<void> {
  if (channelEnsured) return;
  const plugin = window.Capacitor?.Plugins?.LocalNotifications;
  if (!plugin?.createChannel) {
    channelEnsured = true;
    return;
  }
  try {
    await plugin.createChannel({
      id: ANDROID_CHANNEL_ID,
      name: 'AgoraX',
      description: 'AgoraX notifications',
      importance: 5,        // HIGH: heads-up banner + sound
      visibility: 1,        // public on lock screen
      vibration: true,
      lights: true,
      sound: 'default',
    });
  } catch {
    // channel might already exist; createChannel is idempotent in Capacitor
  } finally {
    channelEnsured = true;
  }
}

function isNativeApp(): boolean {
  return !!window.Capacitor?.isNativePlatform?.();
}

async function fireNativeNotification(n: IncomingNotification): Promise<void> {
  const plugin = window.Capacitor?.Plugins?.LocalNotifications;
  if (!plugin) return;
  await ensureAndroidChannel();
  try {
    await plugin.schedule({
      notifications: [
        {
          id: Date.now() % 2_147_483_647,
          title: n.title,
          body: n.message ?? '',
          channelId: ANDROID_CHANNEL_ID,
          extra: { actionUrl: n.actionUrl ?? '/notifications' },
        },
      ],
    });
  } catch {
    // best-effort; permission may not be granted
  }
}

function fireBrowserNotification(n: IncomingNotification): void {
  // Page-context Notification — surfaces an OS-level toast while the tab is
  // open. For the closed-tab case the server fans out via Web Push (VAPID)
  // and the service worker shows the notification instead.
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  try {
    const notif = new Notification(n.title, {
      body: n.message ?? '',
      tag: n.actionUrl ?? `${n.type}-${Date.now()}`,
      data: { actionUrl: n.actionUrl ?? '/notifications' },
    });
    notif.onclick = () => {
      window.focus();
      const url = n.actionUrl ?? '/notifications';
      if (url) window.location.href = url;
      notif.close();
    };
  } catch {
    // some browsers throw if called outside a user gesture during dev; ignore
  }
}

export function useNotificationStream(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;

    if (isNativeApp()) {
      const plugin = window.Capacitor?.Plugins?.LocalNotifications;
      if (plugin?.requestPermissions) {
        void plugin.requestPermissions().catch(() => { /* user can deny; we'll just skip native toasts */ });
      }
      void ensureAndroidChannel();
    }

    const es = new EventSource('/api/sortition-notifications/stream', {
      withCredentials: true,
    });

    es.addEventListener('notification', (evt) => {
      let payload: IncomingNotification | null = null;
      try { payload = JSON.parse((evt as MessageEvent).data); } catch { return; }
      if (!payload) return;
      queryClient.invalidateQueries({ queryKey: ['/api/sortition-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/sortition-notifications/unread-count'] });
      if (isNativeApp()) {
        void fireNativeNotification(payload);
      } else {
        fireBrowserNotification(payload);
      }
    });

    return () => es.close();
  }, [enabled]);
}
