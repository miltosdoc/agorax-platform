---
name: LiveKit Cloud setup
description: How LiveKit Cloud is integrated — env vars, JWT generation, no self-hosted SFU needed.
---

Switched from self-hosted LiveKit binary to LiveKit Cloud (`wss://agorax-0hmsv1yt.livekit.cloud`).

**Why:** Replit only exposes one port (5000/443). WebRTC media requires a separate TCP/UDP port that Replit doesn't expose — self-hosted LiveKit cannot do video/audio in Replit's environment (dev or deployed).

**Env vars (server-only):**
- `LIVEKIT_API_KEY` — cloud API key (format: `APIxxxxxxx`)
- `LIVEKIT_SECRET` or `LIVEKIT_API_SECRET` — HMAC secret (code accepts either)
- `LIVEKIT_URL` or `LIVEKIT_WEBSOCKET` — cloud wss:// URL (code accepts either)

**How to apply:**
- `readLivekitConfig()` in `server/utils/livekit-client.ts` reads all three, sanitizes the URL by splitting on whitespace (user may paste "wss://host KEY=val" into one field).
- JWT is minted natively with Node `crypto` (no livekit-server-sdk — it's stubbed).
- `publicLivekitUrl()` returns the cloud URL directly; no request-host derivation needed.
- `deleteRoom()` calls `https://agorax-0hmsv1yt.livekit.cloud/twirp/livekit.RoomService/DeleteRoom`.
- Client (`ConferenceRoomCard.tsx`) uses `window.LivekitClient` from CDN, calls `room.connect(url, token)` — no extra ICE/TURN config needed (cloud handles it).
- The Express `/rtc` and `/twirp` proxy routes remain but are unused for cloud connections.
- The "LiveKit Server" self-hosted workflow was removed.
