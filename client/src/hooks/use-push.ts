/**
 * Web Push opt-in hook.
 *
 * Encapsulates the four-step dance:
 *   1. Probe the server's VAPID public key (works only if push is
 *      configured server-side; otherwise the toggle is hidden).
 *   2. Register the service worker `/sw.js` and wait for it to be
 *      ready.
 *   3. Ask the browser for permission to show notifications.
 *   4. Subscribe to push via `pushManager.subscribe(applicationServerKey)`
 *      and POST the resulting endpoint + keys to /api/push/subscribe.
 *
 * State machine: unsupported → unconfigured → idle → granted → subscribed.
 */

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

export type PushStatus =
  | 'unsupported'    // browser doesn't support Push API / service workers
  | 'unconfigured'   // server has no VAPID keys
  | 'idle'           // not yet subscribed; permission not asked
  | 'denied'         // user denied notifications
  | 'subscribed';    // active push subscription on this browser

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

function subscriptionToPayload(sub: PushSubscription) {
  const json = sub.toJSON();
  return {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
  };
}

export function usePush() {
  const [status, setStatus] = useState<PushStatus>('idle');
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const supported = typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;

  useEffect(() => {
    if (!supported) {
      setStatus('unsupported');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const cfg = await api.get<{ available: boolean; publicKey?: string }>('/api/push/public-key');
        if (cancelled) return;
        if (!cfg.data.available || !cfg.data.publicKey) {
          setStatus('unconfigured');
          return;
        }
        setPublicKey(cfg.data.publicKey);
        const reg = await navigator.serviceWorker.register('/sw.js');
        const sub = await reg.pushManager.getSubscription();
        if (cancelled) return;
        if (sub) {
          setStatus('subscribed');
        } else if (Notification.permission === 'denied') {
          setStatus('denied');
        } else {
          setStatus('idle');
        }
      } catch {
        if (!cancelled) setStatus('unconfigured');
      }
    })();
    return () => { cancelled = true; };
  }, [supported]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!supported || !publicKey) return false;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setStatus('denied');
        return false;
      }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }
      const payload = subscriptionToPayload(sub);
      await api.post('/api/push/subscribe', payload);
      setStatus('subscribed');
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  }, [supported, publicKey]);

  const unsubscribe = useCallback(async (): Promise<void> => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        try {
          await api.delete(`/api/push/subscribe?_=${Date.now()}`);
          // Server route expects endpoint in body; api.delete doesn't carry one,
          // so do a direct fetch fallback.
        } catch { /* noop */ }
        try {
          await fetch('/api/push/subscribe', {
            method: 'DELETE',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              'X-CSRF-Token': document.cookie
                .split(';').map(c => c.trim())
                .find(c => c.startsWith('agorax_csrf='))
                ?.slice('agorax_csrf='.length) ?? '',
            },
            body: JSON.stringify({ endpoint }),
          });
        } catch { /* noop */ }
      }
      setStatus('idle');
    } finally {
      setBusy(false);
    }
  }, []);

  return { status, busy, subscribe, unsubscribe };
}
