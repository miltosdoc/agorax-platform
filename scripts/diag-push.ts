import 'dotenv/config';
import { db } from '../server/db';
import { users, pushSubscriptions } from '../shared/schema';
import { eq, or } from 'drizzle-orm';

async function main(): Promise<void> {
  const ident = process.argv[2];
  if (!ident) { console.error('usage: tsx diag-push.ts <email-or-username>'); process.exit(2); }
  const [user] = await db
    .select({ id: users.id, username: users.username, email: users.email })
    .from(users)
    .where(or(eq(users.email, ident), eq(users.username, ident)));
  if (!user) { console.error(`no user ${ident}`); process.exit(1); }
  console.log(`user ${user.id}  ${user.username}  ${user.email}`);

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, user.id));
  console.log(`Web Push subscriptions: ${subs.length}`);
  for (const s of subs) {
    const ep = s.endpoint || '';
    const host = ep.replace(/^https?:\/\//, '').split('/')[0];
    console.log(`  id=${s.id} host=${host} createdAt=${s.createdAt} lastUsedAt=${s.lastUsedAt}`);
  }

  console.log(`VAPID configured: ${!!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)}`);
  process.exit(0);
}
void main().catch((e) => { console.error(e); process.exit(1); });
