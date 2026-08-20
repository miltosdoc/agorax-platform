/**
 * Send a Web Push directly via the `web-push` lib and print the exact
 * response from FCM — lets us see status codes, headers, and any
 * error body that the production `pushToUsers` swallows into a warn log.
 */

import 'dotenv/config';
import webpush from 'web-push';
import { db } from '../server/db';
import { users, pushSubscriptions } from '../shared/schema';
import { eq, or } from 'drizzle-orm';

async function main(): Promise<void> {
  const ident = process.argv[2];
  if (!ident) { console.error('usage'); process.exit(2); }
  const [user] = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(or(eq(users.email, ident), eq(users.username, ident)));
  if (!user) { console.error('no user'); process.exit(1); }

  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, user.id));
  console.log(`User: ${user.username} (id=${user.id})`);
  console.log(`Subscriptions: ${subs.length}`);

  webpush.setVapidDetails(
    process.env.VAPID_CONTACT || 'mailto:noreply@agorax.gr',
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );

  for (const sub of subs) {
    console.log(`\n--- sub id=${sub.id} ---`);
    console.log(`endpoint: ${sub.endpoint.slice(0, 80)}…`);
    console.log(`createdAt: ${sub.createdAt}`);
    console.log(`lastUsedAt: ${sub.lastUsedAt}`);

    try {
      const resp = await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({
          title: 'AgoraX RAW test',
          body: `OS-level test @ ${new Date().toLocaleTimeString()}`,
          url: '/notifications',
        }),
        { TTL: 60 },
      );
      console.log(`✓ FCM accepted: status=${resp.statusCode}`);
      console.log(`  headers:`, resp.headers);
      if (resp.body) console.log(`  body: ${resp.body.slice(0, 200)}`);
    } catch (err: any) {
      console.log(`✗ FCM REJECTED`);
      console.log(`  statusCode: ${err?.statusCode}`);
      console.log(`  body: ${err?.body}`);
      console.log(`  headers:`, err?.headers);
      console.log(`  message: ${err?.message}`);
    }
  }
  await new Promise((r) => setTimeout(r, 2000));
  process.exit(0);
}
void main().catch((e) => { console.error(e); process.exit(1); });
