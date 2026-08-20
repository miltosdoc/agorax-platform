# Web Push notifications — operator guide

AgoraX fires native push notifications on phones and laptops for two
classes of events: **conference scheduled / starting** (community room)
and **sortition deliberation room opened**. Same fan-out as the in-app
notification bell — every recipient gets both the in-app card and (if
they opted in) a push to every browser they've subscribed.

There is **no recording**, **no third-party push gateway with payload
visibility** (FCM / APNs route encrypted blobs), and **no notification
content stored externally**. Push is a transport, not a side surface.

## 1. Generate VAPID keys

```bash
node -e "const wp=require('web-push'); const k=wp.generateVAPIDKeys(); console.log('public:', k.publicKey); console.log('private:', k.privateKey);"
```

VAPID is a one-time identity for the AgoraX instance — every push the
server sends is signed with the private key, and the browser uses the
public key to verify it before showing the notification. The keys live
on the server only; the public key is also served to the browser at
`GET /api/push/public-key` so it can call `pushManager.subscribe`.

## 2. Add to `.env`

```dotenv
VAPID_PUBLIC_KEY=<from step 1>
VAPID_PRIVATE_KEY=<from step 1>
VAPID_CONTACT=mailto:ops@yourdomain.gr
```

`VAPID_CONTACT` is the abuse-contact the push services (FCM, APNs)
display if the endpoint behaves badly. Use a real address.

If any of the three is missing:

* `GET /api/push/public-key` → `{ "available": false }`
* The opt-in card on `/notifications` hides itself.
* The in-app notification path still works — push is purely
  graceful-degradation.

## 3. HTTPS

Service workers and the Push API only run in **secure contexts**.
`localhost` is treated as secure; anything else needs TLS. The same
nginx/caddy in front of AgoraX is fine — no separate edge needed.

## 4. Storage

One row per `(user, browser instance)` in `push_subscriptions`:

```
push_subscriptions
├── id
├── user_id      → users.id (cascade delete)
├── endpoint     → unique; the push service URL
├── p256dh       → ECDH public key from the browser
├── auth         → 16-byte secret from the browser
├── user_agent   → bookkeeping (so the user can recognise it in a future "your devices" UI)
├── created_at
└── last_used_at
```

The browser produces all three keys at `pushManager.subscribe` time;
the server never sees the user's private subscription material. We
just relay `(endpoint, p256dh, auth)` to the `web-push` library.

`web-push` does the message encryption (Message Encryption for Web
Push, RFC 8291) and the VAPID JWT signing before POSTing to the
endpoint. The push service forwards the still-encrypted payload to the
device.

## 5. Service worker

`client/public/sw.js`:

* `install` — `skipWaiting()` so the new worker takes over immediately.
* `activate` — `clients.claim()` so in-flight tabs get the new worker.
* `push` — parses the JSON payload, calls `registration.showNotification`
  with the title, body, icon, badge, and `tag` for dedup.
* `notificationclick` — focuses an existing AgoraX tab on the payload's
  `url` if open, otherwise opens a new one.

Cache management / offline shell is **not** in scope. AgoraX needs
to be online to deliberate.

## 6. Opt-in surface

`/notifications` mounts `<PushOptIn />`. State machine:

```
unsupported   browser is missing Push API or service workers
unconfigured  server has no VAPID keys; card hides
idle          permission not asked yet
denied        user blocked notifications; card shows "open site settings"
subscribed    active push subscription on this browser
```

The card hides itself for the unsupported and unconfigured states so
the page stays clean on browsers / instances where push isn't possible.

## 7. Lifecycle: dead subscriptions

When a push service returns **404** or **410** (browser cleared site
data, PWA uninstalled, device wiped), the `web-push` call raises and
`pushToUsers` deletes the row. No cron needed.

## 8. Adding a new notification type

`server/utils/notifications.ts` is the source of truth:

1. Add the type to the `NotificationType` union.
2. The `isNotificationEnabled` map defaults unknown types to `on` —
   new types ship enabled without a preference column.
3. Call `createNotification({ userId, type, title, message, … })`
   from your event site (in-app bell card).
4. Also call `pushToUsers(userIds, { title, body, url, tag })`
   if you want the same event to fire a push.

The conference fan-out helpers in `server/utils/conference-notify.ts`
are the canonical example — they call both, in that order, on every
room creation.

## 9. Privacy notes

* The push payload contains the title and body the user sees on their
  device, nothing else. No proposal text, no community membership,
  no identifiers.
* Each payload is encrypted with a key the device alone holds. The
  push service (FCM / APNs) sees ciphertext only.
* `VAPID_CONTACT` is sent in the signed VAPID claim. It's the only
  identifier the push service learns about your AgoraX instance.
* AgoraX does not track delivery outcomes (read, dismissed, etc.) —
  the push service does not report them back, and even if it did,
  AgoraX wouldn't be the right surface to record them.

## 10. Disabling push everywhere

Unset `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, or `VAPID_CONTACT` and
restart. The opt-in card vanishes, every subscribe / unsubscribe
call returns 503, and existing rows stop firing. To purge the table:

```sql
TRUNCATE push_subscriptions;
```

Subscriptions can also be cleared per-user via the standard cascade —
deleting the user drops every subscription they ever held.
