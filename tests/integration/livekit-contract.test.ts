/**
 * LiveKit infra contract tests — file-shape and wiring checks.
 *
 * No live SFU is hit; we just pin the route surface, env contract,
 * and access gates so a future refactor can't silently drop them.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const schema    = read('shared/schema.ts');
const migration = read('migrations/0027_livekit_rooms.sql');
const client    = read('server/utils/livekit-client.ts');
const repo      = read('server/storage/livekit.ts');
const router    = read('server/routers/livekit.ts');
const routes    = read('server/routes.ts');
const compose   = read('docker-compose.yml');

describe('livekit_rooms migration', () => {
  it('creates the table with kind + status checks', () => {
    expect(migration).toMatch(/CREATE TABLE\s+"livekit_rooms"/);
    expect(migration).toMatch(/CHECK\s*\(\s*"kind"\s*IN\s*\(\s*'community'\s*,\s*'sortition'\s*\)\s*\)/);
    expect(migration).toMatch(/CHECK\s*\(\s*"status"\s*IN\s*\(\s*'scheduled'\s*,\s*'active'\s*,\s*'closed'\s*\)\s*\)/);
  });

  it('enforces sortition rooms must reference a body, community rooms must not', () => {
    expect(migration).toMatch(/livekit_rooms_sortition_consistency/);
  });

  it('caps a sortition body to a single room via partial unique index', () => {
    expect(migration).toMatch(/CREATE UNIQUE INDEX\s+"livekit_rooms_sortition_unique"[\s\S]*WHERE "sortition_body_id" IS NOT NULL/);
  });
});

describe('shared/schema.ts — livekitRooms', () => {
  it('exports the table + types', () => {
    expect(schema).toMatch(/export const livekitRooms = pgTable\("livekit_rooms"/);
    expect(schema).toMatch(/export type LivekitRoom/);
    expect(schema).toMatch(/export type LivekitRoomKind/);
    expect(schema).toMatch(/export type InsertLivekitRoom/);
  });
});

describe('LiveKit server SDK wrapper', () => {
  it('reads its config from LIVEKIT_URL/API_KEY/API_SECRET only', () => {
    expect(client).toMatch(/LIVEKIT_URL/);
    expect(client).toMatch(/LIVEKIT_API_KEY/);
    expect(client).toMatch(/LIVEKIT_API_SECRET/);
  });

  it('issues AccessToken with explicit grants (not blanket roomAdmin for everyone)', () => {
    expect(client).toMatch(/new AccessToken/);
    expect(client).toMatch(/roomAdmin:\s*!!opts\.isAdmin/);
  });

  it('exposes deleteRoom that swallows "not found" but not other errors', () => {
    expect(client).toMatch(/deleteRoom\(roomName/);
    expect(client).toMatch(/not.found|does not exist/i);
  });

  it('throws LivekitUnavailableError when env is missing', () => {
    expect(client).toMatch(/class LivekitUnavailableError/);
    expect(client).toMatch(/throw new LivekitUnavailableError/);
  });
});

describe('LiveKit repository', () => {
  it('exposes the queries the router needs', () => {
    expect(repo).toMatch(/listOpenForCommunity\(/);
    expect(repo).toMatch(/getForSortitionBody\(/);
    expect(repo).toMatch(/setStatus\(/);
    expect(repo).toMatch(/setRecordingEnabled\(/);
  });

  it('filters community list to scheduled+active and to kind=community', () => {
    expect(repo).toMatch(/scheduled.*active|active.*scheduled/);
    expect(repo).toMatch(/eq\(livekitRooms\.kind,\s*['"]community['"]\)/);
  });
});

describe('LiveKit router — route surface', () => {
  it('exposes the documented routes', () => {
    expect(router).toMatch(/\/api\/livekit\/config/);
    expect(router).toMatch(/\/api\/communities\/:id\/rooms/);
    expect(router).toMatch(/\/api\/sortition\/:bodyId\/room/);
    expect(router).toMatch(/\/api\/livekit\/rooms\/:id\/token/);
    expect(router).toMatch(/app\.patch\(['"]\/api\/livekit\/rooms\/:id['"]/);
  });

  it('returns 503 with livekit_unavailable when SFU is not configured', () => {
    expect(router).toMatch(/livekit_unavailable/);
    expect(router).toMatch(/res\.status\(503\)/);
  });

  it('gates community room creation behind admin/founder', () => {
    expect(router).toMatch(/isCommunityHost\(/);
    expect(router).toMatch(/only community admins can schedule conferences/);
  });

  it('gates sortition room access by sortition_members membership', () => {
    expect(router).toMatch(/isSortitionMember\(/);
    expect(router).toMatch(/not a member of this body/);
  });

  it('makes sortition room creation idempotent', () => {
    expect(router).toMatch(/getForSortitionBody\([\s\S]*?if \(existing\) return res\.json\(existing\)/);
  });
});

describe('routes.ts wiring', () => {
  it('registers the LiveKit router', () => {
    expect(routes).toMatch(/registerLivekitRoutes/);
  });
});

describe('conference notifications + .ics', () => {
  const notifyMod = read('server/utils/conference-notify.ts');
  const notifTypes = read('server/utils/notifications.ts');

  it('declares the three new notification types', () => {
    expect(notifTypes).toMatch(/'conference_scheduled'/);
    expect(notifTypes).toMatch(/'conference_starting'/);
    expect(notifTypes).toMatch(/'sortition_room_opened'/);
  });

  it('isNotificationEnabled defaults unknown types to on', () => {
    // Future-proofing: a new type added to NotificationType but not yet
    // mapped to a preference column should still ship a notification.
    expect(notifTypes).toMatch(/if \(!key\) return true/);
  });

  it('exposes the two fan-out helpers', () => {
    expect(notifyMod).toMatch(/export async function notifyConferenceScheduled/);
    expect(notifyMod).toMatch(/export async function notifyRoomOpened/);
  });

  it('community fan-out excludes the room author', () => {
    expect(notifyMod).toMatch(/filter\(uid => uid !== authorUserId\)/);
  });

  it('sortition fan-out excludes the opener', () => {
    expect(notifyMod).toMatch(/filter\(uid => uid !== openerUserId\)/);
  });

  it('LiveKit router calls notifyConferenceScheduled after community room creation', () => {
    expect(router).toMatch(/notifyConferenceScheduled\(/);
  });

  it('LiveKit router calls notifyRoomOpened after sortition room creation', () => {
    expect(router).toMatch(/notifyRoomOpened\(/);
  });

  it('exposes the .ics download endpoint', () => {
    expect(router).toMatch(/app\.get\(['"]\/api\/livekit\/rooms\/:id\/ics['"]/);
    expect(router).toMatch(/text\/calendar/);
  });

  it('buildIcs emits a well-formed VEVENT with URL + UID', () => {
    expect(notifyMod).toMatch(/export function buildIcs/);
    expect(notifyMod).toMatch(/BEGIN:VCALENDAR/);
    expect(notifyMod).toMatch(/BEGIN:VEVENT/);
    expect(notifyMod).toMatch(/UID:/);
    expect(notifyMod).toMatch(/URL:/);
  });

  it('buildIcs escapes commas, semicolons, and newlines per RFC 5545', () => {
    expect(notifyMod).toMatch(/function icsEscape/);
    // The escape function must handle all three special characters.
    expect(notifyMod).toContain(`replace(/,/g, '\\\\,')`);
    expect(notifyMod).toContain(`replace(/;/g, '\\\\;')`);
    expect(notifyMod).toContain(`'\\\\n'`); // newline replacement target
  });
});

describe('docker-compose sidecar', () => {
  it('declares the livekit service with LIVEKIT_KEYS env mapping', () => {
    expect(compose).toMatch(/livekit\/livekit-server/);
    expect(compose).toMatch(/LIVEKIT_KEYS/);
  });

  it('exposes the required ports', () => {
    expect(compose).toMatch(/7880/); // signalling
    expect(compose).toMatch(/7881/); // TURN
    expect(compose).toMatch(/50000-50100\/udp/); // media
  });
});
