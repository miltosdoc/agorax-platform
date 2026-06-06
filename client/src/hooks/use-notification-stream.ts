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
              extra?: Record<string, unknown>;
            }>;
          }) => Promise<unknown>;
          requestPermissions?: () => Promise<{ display: string }>;
        };
      };
    };
  }
}

function isNativeApp(): boolean {
  return !!window.Capacitor?.isNativePlatform?.();
}

async function fireSystemNotification(n: IncomingNotification): Promise<void> {
  const plugin = window.Capacitor?.Plugins?.LocalNotifications;
  if (!plugin) return;
  try {
    await plugin.schedule({
      notifications: [
        {
          id: Date.now() % 2_147_483_647,
          title: n.title,
          body: n.message ?? '',
          extra: { actionUrl: n.actionUrl ?? '/notifications' },
        },
      ],
    });
  } catch {
    // best-effort; permission may not be granted
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
        void fireSystemNotification(payload);
      }
    });

    return () => es.close();
  }, [enabled]);
}
