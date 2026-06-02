/**
 * LiveKit server wrapper — token issuance + room CRUD against the
 * self-hosted SFU.
 *
 * Three env vars wire this up:
 *   LIVEKIT_URL         — wss://livekit.your-host:7880  (the SFU)
 *   LIVEKIT_API_KEY     — server-only key (NEVER ship to the client)
 *   LIVEKIT_API_SECRET  — server-only HMAC secret
 *
 * When the env is missing every function throws `LivekitUnavailableError`
 * so callers can surface "video disabled" without crashing the request.
 */

import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

export class LivekitUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LivekitUnavailableError';
  }
}

export interface LivekitConfig {
  url: string;          // wss:// — passed back to the client for connect
  apiKey: string;
  apiSecret: string;
  httpUrl: string;      // http(s):// — used by the RoomService REST API
}

export function readLivekitConfig(): LivekitConfig | null {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) return null;
  // Server-side REST calls expect http(s) not wss; derive from the wss URL.
  const httpUrl = url
    .replace(/^wss:\/\//, 'https://')
    .replace(/^ws:\/\//, 'http://');
  return { url, apiKey, apiSecret, httpUrl };
}

export function isLivekitConfigured(): boolean {
  return readLivekitConfig() !== null;
}

function requireConfig(): LivekitConfig {
  const cfg = readLivekitConfig();
  if (!cfg) {
    throw new LivekitUnavailableError(
      'LiveKit env not configured (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)',
    );
  }
  return cfg;
}

export interface IssueTokenOptions {
  roomName: string;
  identity: string;            // typically `user-<id>`
  name?: string;               // display name shown in the room
  canPublish?: boolean;        // mic/cam producer (default true)
  canSubscribe?: boolean;      // can hear/see others (default true)
  canPublishData?: boolean;    // data channel (default true — chat, reactions)
  isAdmin?: boolean;           // hostadmin: kick, mute others, end room
  ttlSeconds?: number;         // default 4h, plenty for a sortition session
}

/**
 * Mint a JWT the browser will hand to LiveKit to join. The grants follow
 * the principle of least privilege — admins get room-admin rights, others
 * just publish + subscribe.
 */
export async function issueJoinToken(opts: IssueTokenOptions): Promise<string> {
  const cfg = requireConfig();
  const ttl = opts.ttlSeconds ?? 4 * 60 * 60;
  const token = new AccessToken(cfg.apiKey, cfg.apiSecret, {
    identity: opts.identity,
    name: opts.name,
    ttl,
  });
  token.addGrant({
    room: opts.roomName,
    roomJoin: true,
    canPublish: opts.canPublish ?? true,
    canSubscribe: opts.canSubscribe ?? true,
    canPublishData: opts.canPublishData ?? true,
    roomAdmin: !!opts.isAdmin,
  });
  return await token.toJwt();
}

/**
 * Force-close a room on the LiveKit side. Kicks all participants and
 * frees the room slot. We call this when the proposal author / community
 * admin closes their conference, or when a sortition body's status flips
 * to completed.
 */
export async function deleteRoom(roomName: string): Promise<void> {
  const cfg = requireConfig();
  const svc = new RoomServiceClient(cfg.httpUrl, cfg.apiKey, cfg.apiSecret);
  try {
    await svc.deleteRoom(roomName);
  } catch (err: any) {
    // If the room never materialised on the SFU (no one joined yet),
    // LiveKit returns 404 — treat as a no-op.
    if (!/not.found|does not exist/i.test(err?.message ?? '')) throw err;
  }
}

/**
 * Public LiveKit URL the browser uses to connect. Safe to ship in API
 * responses — it's the wss endpoint, the secret lives only here.
 */
export function publicLivekitUrl(): string {
  return requireConfig().url;
}
