import 'dotenv/config';
import { db } from '../server/db';
import { users, pushSubscriptions } from '../shared/schema';
import { eq, or } from 'drizzle-orm';

async function main(): Promise<void> {
  const ident = process.argv[2];
  if (!ident) { console.error('usage: tsx clear-push-subs.ts <email-or-username>'); process.exit(2); }
  const [user] = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(or(eq(users.email, ident), eq(users.username, ident)));
  if (!user) { console.error(`no user ${ident}`); process.exit(1); }
  const deleted = await db
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, user.id))
    .returning({ id: pushSubscriptions.id });
  console.log(`cleared ${deleted.length} subscription(s) for ${user.username}`);
  process.exit(0);
}
void main().catch((e) => { console.error(e); process.exit(1); });
