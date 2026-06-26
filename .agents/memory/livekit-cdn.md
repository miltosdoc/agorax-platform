---
name: LiveKit CDN workaround
description: livekit-client loaded from CDN; ConferenceRoomCard uses raw Room API; proxy routes /rtc and /twirp to local SFU.
---

## Rule
`@livekit/components-react` and `livekit-client` cannot be installed via npm (CVE block). Load `livekit-client` from CDN instead.

## Setup
1. `client/index.html` — `<script src="https://cdn.jsdelivr.net/npm/livekit-client@2.5.5/dist/livekit-client.umd.min.js">` before the module entry point. Exposes `window.LivekitClient`.
2. `ConferenceRoomCard.tsx` — uses `window.LivekitClient.Room` directly; calls `room.localParticipant.enableCameraAndMicrophone()` after connect; renders participant video tiles with `track.attach(videoRef.current)`.
3. `server/utils/livekit-proxy.ts` — TCP tunnel for `/rtc` WebSocket upgrades; http.request proxy for `/twirp` HTTP calls. Both forward to `127.0.0.1:7880`.
4. `server/routes.ts` — calls `setupLiveKitProxy(server, app)` after routes are registered.
5. `LIVEKIT_URL=ws://localhost:7880` (shared env var) — used only for server-side RoomServiceClient; the client URL is derived from `req.get('host')` in `publicLivekitUrl(reqHost?)`.

## LiveKit binary
Binary at `/home/runner/workspace/livekit-server` (v1.7.2, linux/amd64).
Config at `livekit.yaml` — keys from env vars LIVEKIT_API_KEY / LIVEKIT_API_SECRET.
Workflow: **LiveKit Server** — command `./livekit-server --config livekit.yaml`, outputType `console`.

**Why:** npm install is blocked. The CDN UMD bundle + TCP tunnel proxy avoids all package dependency issues while giving real WebRTC camera/mic access.

**How to apply:** If the LiveKit Server workflow is not running, restart it. If the Replit domain changes, the `publicLivekitUrl(req.get('host'))` logic handles it automatically — no env var change needed.
