/**
 * LiveKit wrapper — token issuance + room management.
 *
 * Env vars:
 *   LIVEKIT_API_KEY     — API key (server-only, never sent to client)
 *   LIVEKIT_SECRET      — API secret (HMAC key for JWTs)
 *   LIVEKIT_WEBSOCKET   — wss:// URL clients connect to (LiveKit Cloud or proxy)
 *   LIVEKIT_URL         — http(s):// URL for server-side Twirp calls (optional,
 *                         derived from LIVEKIT_WEBSOCKET if absent)
 *
 * Uses native Node crypto — no livekit-server-sdk needed.
 */

import { createHmac } from 'crypto';
import { readRoomCapacity } from '@shared/conference';

export class LivekitUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LivekitUnavailableError';
  }
}

export interface LivekitConfig {
  wsUrl: string;    // wss:// — given to clients for Room.connect()
  httpUrl: string;  // https:// — used for Twirp REST calls (deleteRoom, etc.)
  apiKey: string;
  apiSecret: string;
}

export function readLivekitConfig(): LivekitConfig | null {
  const apiKey    = process.env.LIVEKIT_API_KEY;
  // Accept LIVEKIT_SECRET (new) or LIVEKIT_API_SECRET (old fallback)
  const apiSecret = process.env.LIVEKIT_SECRET ?? process.env.LIVEKIT_API_SECRET;
  // LIVEKIT_WEBSOCKET is the cloud wss:// URL; fall back to LIVEKIT_URL
  const wsUrl     = process.env.LIVEKIT_WEBSOCKET ?? process.env.LIVEKIT_URL;

  if (!apiKey || !apiSecret || !wsUrl) return null;

  // Guard against the user pasting "wss://host KEY=val SECRET=val" into one field
  const cleanWsUrl = wsUrl.split(/\s+/)[0];

  const httpUrl = cleanWsUrl
    .replace(/^wss:\/\//, 'https://')
    .replace(/^ws:\/\//, 'http://');

  return { wsUrl: cleanWsUrl, httpUrl, apiKey, apiSecret };
}

export function isLivekitConfigured(): boolean {
  return readLivekitConfig() !== null;
}

function requireConfig(): LivekitConfig {
  const cfg = readLivekitConfig();
  if (!cfg) {
    throw new LivekitUnavailableError(
      'LiveKit env not configured (LIVEKIT_API_KEY, LIVEKIT_SECRET, LIVEKIT_WEBSOCKET)',
    );
  }
  return cfg;
}

// ── Native HS256 JWT ────────────────────────────────────────────────────────

function b64url(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64url');
}

function mintJwt(
  apiKey: string,
  apiSecret: string,
  payload: Record<string, unknown>,
  ttlSeconds = 4 * 3600,
): string {
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: apiKey, nbf: now, exp: now + ttlSeconds, ...payload };
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body   = b64url(JSON.stringify(claims));
  const sig    = b64url(
    createHmac('sha256', apiSecret).update(`${header}.${body}`).digest(),
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
      // Raising a hand is the participant writing to their own attribute map.
      // Without this grant the SFU rejects setAttributes() and the queue is a
      // button that does nothing.
      canUpdateOwnMetadata: true,
      roomAdmin: !!opts.isAdmin,
    },
  }, opts.ttlSeconds ?? 4 * 3600);
}

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
      if (/not.found|does not exist/i.test(text) || res.status === 404) return;
      throw new Error(`LiveKit DeleteRoom ${res.status}: ${text}`);
    }
  } catch (err: any) {
    if (/not.found|does not exist/i.test(err?.message ?? '')) return;
    throw err;
  }
}


// ── Room service calls ──────────────────────────────────────────────────────

/**
 * Admin token for a RoomService call.
 *
 * `roomAdmin` is only honoured for the room named in the same grant — a
 * project-wide roomAdmin token is rejected with 401 "permissions denied" by
 * per-room calls such as ListParticipants. Pass the room whenever the call
 * addresses one.
 */
function adminToken(cfg: LivekitConfig, roomName?: string, ttlSeconds = 60): string {
  return mintJwt(cfg.apiKey, cfg.apiSecret, {
    sub: 'server',
    video: {
      roomCreate: true,
      roomList: true,
      roomAdmin: true,
      ...(roomName ? { room: roomName } : {}),
    },
  }, ttlSeconds);
}

async function twirp(cfg: LivekitConfig, method: string, body: unknown, roomName?: string): Promise<any> {
  const res = await fetch(`${cfg.httpUrl}/twirp/livekit.RoomService/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken(cfg, roomName)}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    // A room nobody has connected to yet does not exist on the SFU. That is
    // an empty room, not a failure.
    if (res.status === 404 || /not.?found|does not exist/i.test(text)) return null;
    throw new Error(`LiveKit ${method} ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

/** How many participants the platform allows in one room at a time. */
export function roomCapacity(): number {
  return readRoomCapacity(process.env.LIVEKIT_MAX_PARTICIPANTS);
}

/**
 * Identities currently connected to a room, or [] when the room has not been
 * created on the SFU yet.
 */
export async function listParticipantIdentities(roomName: string): Promise<string[]> {
  const cfg = requireConfig();
  const data = await twirp(cfg, 'ListParticipants', { room: roomName }, roomName);
  if (!data || !Array.isArray(data.participants)) return [];
  return data.participants
    .map((p: any) => String(p?.identity ?? ''))
    .filter((identity: string) => identity.length > 0);
}

/**
 * Create the room with a hard participant cap before anyone connects.
 *
 * The app already refuses a join past the cap with a message that explains
 * itself; this is the backstop for the race where two people pass that check
 * in the same instant. CreateRoom on a room that already exists returns it
 * unchanged, so this is safe to call on every join.
 */
export async function ensureRoom(roomName: string, maxParticipants: number): Promise<void> {
  const cfg = requireConfig();
  await twirp(cfg, 'CreateRoom', { name: roomName, max_participants: maxParticipants }, roomName);
}

/**
 * The URL the browser uses to connect. For LiveKit Cloud this is
 * LIVEKIT_WEBSOCKET directly — no need to derive from request host.
 */
export function publicLivekitUrl(_reqHost?: string): string {
  return requireConfig().wsUrl;
}
