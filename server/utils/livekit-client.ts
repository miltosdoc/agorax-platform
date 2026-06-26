/**
 * LiveKit server wrapper — token issuance + room CRUD against the
 * self-hosted SFU.
 *
 * Three env vars wire this up:
 *   LIVEKIT_URL         — ws://localhost:7880  (the local SFU)
 *   LIVEKIT_API_KEY     — server-only key (NEVER ship to the client)
 *   LIVEKIT_API_SECRET  — server-only HMAC secret
 *
 * This module intentionally avoids `livekit-server-sdk` (which is
 * stubbed in this environment) and implements the JWT + Twirp calls
 * natively using Node's built-in `crypto` and `fetch`.
 */

import { createHmac } from 'crypto';

export class LivekitUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LivekitUnavailableError';
  }
}

export interface LivekitConfig {
  url: string;      // ws:// or wss:// — the SFU WebSocket URL
  apiKey: string;
  apiSecret: string;
  httpUrl: string;  // http:// or https:// — derived from url for REST/Twirp
}

export function readLivekitConfig(): LivekitConfig | null {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) return null;
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

// ── Native HS256 JWT ────────────────────────────────────────────────────────

function b64url(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64url');
}

/**
 * Mint a LiveKit-compatible HS256 JWT.
 * Spec: https://docs.livekit.io/realtime/server/generating-tokens/
 */
function mintJwt(
  apiKey: string,
  apiSecret: string,
  payload: Record<string, unknown>,
  ttlSeconds = 4 * 3600,
): string {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: apiKey,
    nbf: now,
    exp: now + ttlSeconds,
    ...payload,
  };
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body   = b64url(JSON.stringify(claims));
  const sig = b64url(
    createHmac('sha256', apiSecret)
      .update(`${header}.${body}`)
      .digest(),
  );
  return `${header}.${body}.${sig}`;
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface IssueTokenOptions {
  roomName: string;
  identity: string;
  name?: string;
  canPublish?: boolean;
  canSubscribe?: boolean;
  canPublishData?: boolean;
  isAdmin?: boolean;
  ttlSeconds?: number;
}

/** Mint a JWT the browser hands to LiveKit to join a room. */
export async function issueJoinToken(opts: IssueTokenOptions): Promise<string> {
  const cfg = requireConfig();
  return mintJwt(cfg.apiKey, cfg.apiSecret, {
    sub: opts.identity,
    name: opts.name ?? opts.identity,
    video: {
      room: opts.roomName,
      roomJoin: true,
      canPublish: opts.canPublish ?? true,
      canSubscribe: opts.canSubscribe ?? true,
      canPublishData: opts.canPublishData ?? true,
      roomAdmin: !!opts.isAdmin,
    },
  }, opts.ttlSeconds ?? 4 * 3600);
}

/**
 * Force-close a room via LiveKit's Twirp API.
 * Uses a short-lived admin token (roomCreate + roomAdmin grants).
 */
export async function deleteRoom(roomName: string): Promise<void> {
  const cfg = requireConfig();
  const adminToken = mintJwt(cfg.apiKey, cfg.apiSecret, {
    sub: 'server',
    video: { roomCreate: true, roomList: true, roomAdmin: true },
  }, 60);

  try {
    const res = await fetch(`${cfg.httpUrl}/twirp/livekit.RoomService/DeleteRoom`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ room: roomName }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (/not.found|does not exist/i.test(text)) return; // no-op
      if (res.status === 404) return;
      throw new Error(`LiveKit DeleteRoom ${res.status}: ${text}`);
    }
  } catch (err: any) {
    if (/not.found|does not exist/i.test(err?.message ?? '')) return;
    throw err;
  }
}

/**
 * Public LiveKit URL the browser uses to connect.  Derived from the
 * request host so it works in any environment without updating env vars.
 * The Express proxy forwards /rtc (WS) and /twirp (HTTP) to port 7880.
 */
export function publicLivekitUrl(reqHost?: string): string {
  if (reqHost) {
    const scheme = (reqHost.startsWith('localhost') || reqHost.startsWith('127.')) ? 'ws' : 'wss';
    return `${scheme}://${reqHost}`;
  }
  return requireConfig().url;
}
