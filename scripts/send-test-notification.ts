/**
 * Fires a single test notification at one user by email.
 *
 *   npx tsx scripts/send-test-notification.ts <email>
 *
 * Calls the same createNotification() the real triggers use, so the row
 * lands in the DB, the SSE bus broadcasts it (any open browser/APK gets it
 * instantly), and pushToUsers fans out to active Web Push subscriptions.
 */

import 'dotenv/config';
import { db } from '../server/db';
import { users } from '../shared/schema';
import { eq, or } from 'drizzle-orm';
import { createNotification } from '../server/utils/notifications';

async function main(): Promise<void> {
  const ident = process.argv[2];
  if (!ident) {
    console.error('usage: tsx scripts/send-test-notification.ts <email-or-username>');
    process.exit(2);
  }
  const [user] = await db
    .select({ id: users.id, username: users.username, email: users.email })
    .from(users)
    .where(or(eq(users.email, ident), eq(users.username, ident)));
  if (!user) {
    console.error(`no user with email or username ${ident}`);
    process.exit(1);
  }
  await createNotification({
    userId: user.id,
    type: 'new_proposal',
    title: 'Δοκιμαστική ειδοποίηση AgoraX',
    message: 'Αν τη βλέπεις, οι ειδοποιήσεις δουλεύουν!',
    actionUrl: '/notifications',
  });
  console.log(`sent test notification to user ${user.id} (${user.username} / ${user.email})`);
  // createNotification's pushToUsers is void/fire-and-forget so handlers don't
  // block. In script context that means the FCM round-trip is still in flight
  // when we'd otherwise exit — give it a moment to land before tearing down.
  await new Promise((r) => setTimeout(r, 4000));
  process.exit(0);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
