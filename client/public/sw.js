// AgoraX Service Worker — Web Push receiver.
//
// Responsibilities (deliberately minimal):
//   1. Listen for push events; show a notification with the payload's
//      title/body and remember the URL so the click handler can land
//      the user where the notification is about.
//   2. On notification click: focus an existing tab on that URL if one
//      is open, otherwise open a new one.
//
// Caching, offline shell, background sync — out of scope. AgoraX needs
// to be online to deliberate.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'AgoraX', body: event.data.text(), url: '/' };
  }
  const title = payload.title || 'AgoraX';
  const options = {
    body: payload.body || '',
    icon: '/favicon.png',
    badge: '/favicon.png',
    data: { url: payload.url || '/' },
    tag: payload.tag,
    renotify: !!payload.tag,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      try {
        const u = new URL(client.url);
        const t = new URL(targetUrl, self.location.origin);
        if (u.origin === t.origin) {
          await client.focus();
          if ('navigate' in client) {
            try { await client.navigate(t.toString()); } catch { /* noop */ }
          }
          return;
        }
      } catch { /* noop */ }
    }
    await self.clients.openWindow(targetUrl);
  })());
});
