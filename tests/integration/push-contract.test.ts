/**
 * Web Push contract tests — file-shape only, no live VAPID/SW exercise.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const migration = read('migrations/0028_push_subscriptions.sql');
const schema    = read('shared/schema.ts');
const client    = read('server/utils/push-client.ts');
const router    = read('server/routers/push.ts');
const routes    = read('server/routes.ts');
const sw        = read('client/public/sw.js');
const optIn     = read('client/src/components/notifications/PushOptIn.tsx');
const notify    = read('server/utils/conference-notify.ts');

describe('push_subscriptions migration', () => {
  it('creates the table with a unique endpoint', () => {
    expect(migration).toMatch(/CREATE TABLE\s+"push_subscriptions"/);
    expect(migration).toMatch(/"endpoint"\s+text NOT NULL UNIQUE/);
  });

  it('cascades on user delete', () => {
    expect(migration).toMatch(/REFERENCES\s+"users"\("id"\)\s+ON DELETE CASCADE/);
  });
});

describe('shared/schema.ts — pushSubscriptions', () => {
  it('exports the table + type', () => {
    expect(schema).toMatch(/export const pushSubscriptions = pgTable\("push_subscriptions"/);
    expect(schema).toMatch(/export type PushSubscription/);
  });
});

describe('push client', () => {
  it('configures VAPID lazily from env', () => {
    expect(client).toMatch(/VAPID_PUBLIC_KEY/);
    expect(client).toMatch(/VAPID_PRIVATE_KEY/);
    expect(client).toMatch(/webpush\.setVapidDetails/);
  });

  it('purges 404/410 subscriptions automatically', () => {
    expect(client).toMatch(/status === 404 \|\| status === 410/);
    expect(client).toMatch(/db\.delete\(pushSubscriptions\)/);
  });

  it('exposes a pushToUsers fan-out that is non-throwing', () => {
    expect(client).toMatch(/export async function pushToUsers/);
    expect(client).toMatch(/pushToUsers failed/); // logger.warn branch
  });
});

describe('push router', () => {
  it('exposes the documented routes', () => {
    expect(router).toMatch(/\/api\/push\/public-key/);
    expect(router).toMatch(/\/api\/push\/subscribe/);
    expect(router).toMatch(/app\.delete\(['"]\/api\/push\/subscribe['"]/);
  });

  it('upserts on duplicate endpoint instead of erroring', () => {
    expect(router).toMatch(/db\.update\(pushSubscriptions\)/);
  });

  it('requires auth on subscribe/unsubscribe', () => {
    expect(router).toMatch(/\/api\/push\/subscribe['"]\s*,\s*requireAuth/);
  });
});

describe('routes.ts wiring', () => {
  it('registers the push router', () => {
    expect(routes).toMatch(/registerPushRoutes/);
  });
});

describe('service worker', () => {
  it('listens for push, notificationclick events', () => {
    expect(sw).toMatch(/addEventListener\(['"]push['"]/);
    expect(sw).toMatch(/addEventListener\(['"]notificationclick['"]/);
    expect(sw).toMatch(/showNotification/);
  });

  it('reads url from payload and focuses an existing tab if open', () => {
    expect(sw).toMatch(/matchAll\(/);
    expect(sw).toMatch(/openWindow/);
  });
});

describe('PushOptIn component', () => {
  it('hides itself when push is unsupported or unconfigured', () => {
    expect(optIn).toMatch(/status === 'unsupported'/);
    expect(optIn).toMatch(/status === 'unconfigured'/);
  });
});

describe('conference notify wires push alongside in-app', () => {
  it('imports pushToUsers and calls it on both fan-outs', () => {
    expect(notify).toMatch(/import.*pushToUsers.*from.*push-client/);
    // Both notifyConferenceScheduled and notifyRoomOpened call pushToUsers.
    const occurrences = notify.match(/pushToUsers\(/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });
});
