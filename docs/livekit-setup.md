# LiveKit conference rooms — operator guide

AgoraX gets two flavours of real-time room via a self-hosted LiveKit SFU:

* **Community conferences** — open to every member; only community admins/founders can schedule. Mounted on `/communities/:id` under the "Συναντήσεις" / "Community conferences" tab.
* **Sortition deliberation rooms** — private to the 20 (or however many) members of a sortition body. Mounted on `/sortition/body/:bodyId`.

The Node app never streams audio/video itself — it issues short-lived JWT join tokens (`livekit-server-sdk`) that the browser hands to the SFU. Same auth surface as everything else.

## 1. Generate keys

```bash
openssl rand -hex 32   # → LIVEKIT_API_KEY
openssl rand -hex 32   # → LIVEKIT_API_SECRET
```

Both go into `.env` (server-side only — they are NEVER shipped to the client).

## 2. Add to `.env`

```dotenv
# Public wss URL the browser connects to (the SFU).
# For local dev: ws://localhost:7880   (no TLS)
# In production: wss://livekit.yourdomain.gr  (behind your reverse proxy with TLS)
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=<from-step-1>
LIVEKIT_API_SECRET=<from-step-1>

# Optional — exposed compose ports (defaults are usually fine):
# LIVEKIT_PORT=7880
# LIVEKIT_TLS_PORT=7881
```

If any of the three are missing, the Node API returns `503 livekit_unavailable` from every LiveKit-touching endpoint and the UI silently hides itself. So you can leave video off until you're ready.

## 3. Bring up the sidecar

`docker-compose.yml` already declares the `livekit` service:

```bash
docker compose up -d livekit
```

Verify it's healthy:

```bash
docker compose ps livekit
curl http://localhost:7880   # should return a non-empty page
```

## 4. Reverse proxy + TLS (production)

Browsers require **secure context** for camera/microphone (HTTPS in production). Terminate TLS at nginx/caddy and forward to LiveKit:

```nginx
server {
  listen 443 ssl http2;
  server_name livekit.yourdomain.gr;

  ssl_certificate     /etc/letsencrypt/live/livekit.yourdomain.gr/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/livekit.yourdomain.gr/privkey.pem;

  location / {
    proxy_pass http://localhost:7880;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 24h;   # keep WS open across long sessions
  }
}
```

Then point `LIVEKIT_URL=wss://livekit.yourdomain.gr` in `.env`.

**TURN ports:** UDP 50000-50100 must be reachable from clients (firewall + NAT). If your users sit behind very strict corporate firewalls, expose 7881/tcp (TLS-over-TCP TURN) and they will fall through to it automatically.

## 5. Operator surface

* The `livekit_rooms` table lists every room ever created (`status` IN `'scheduled' | 'active' | 'closed'`).
* `kind = 'sortition'` rows are 1:1 with a `sortition_bodies.id` and unique on it.
* Closing a row (`status = 'closed'` via the host's UI or a manual `UPDATE`) calls `RoomServiceClient.deleteRoom` on the SFU, which kicks everyone.
* If a room ever gets orphaned (DB row says `active` but SFU lost the room), no harm done — the next `POST /api/livekit/rooms/:id/token` issues a fresh join token and the SFU recreates the room on first connect.

## 6. Recordings (off by default)

`recording_enabled` is `false` for every room until the host explicitly flips it. The current build exposes the flag in the data model and the patch route but does **not** auto-start an Egress recording — wiring that requires a separate egress worker (`livekit-egress`). Plan ahead: voice + faces is Art. 9 personal data, so a recording feature ships with a consent surface or it doesn't ship.

## 7. Closing a room programmatically

A future cron should close any sortition room whose parent body just flipped to `completed`. Pseudo-handler:

```ts
// when sortition_bodies.status moves to 'completed'
const room = await livekitRepo.getForSortitionBody(bodyId);
if (room && room.status !== 'closed') {
  await livekitRepo.setStatus(room.id, 'closed');
  await deleteRoom(room.roomName);
}
```

Add this to `server/utils/sortition-timeout.ts` or to the same job that flips the body — out of scope for the first cut.
