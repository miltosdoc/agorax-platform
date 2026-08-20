/**
 * Activate the General community (Γενική Κοινότητα).
 *
 * Idempotent: creates the single isGeneral=true community if it doesn't
 * exist (a partial unique index from migration 0008 guarantees at most
 * one), then backfills EVERY existing user as a member. New users are
 * auto-enrolled at registration (local + Google) by server/auth.ts, so
 * running this once brings the membership current and keeps it current.
 *
 *   npx tsx scripts/create-general-community.ts
 *
 * The founder is the lowest-id platform admin (falls back to the lowest
 * user id on installs with no admin yet).
 */

import 'dotenv/config';
import { asc, eq, or, isNull } from 'drizzle-orm';
import { db } from '../server/db';
import { users } from '../shared/schema';
import { addMember, createCommunity, getGeneralCommunity } from '../server/utils/community-manager';

async function main() {
  let general = await getGeneralCommunity();

  if (!general) {
    const [admin] = await db.select().from(users)
      .where(eq(users.isAdmin, true)).orderBy(asc(users.id)).limit(1);
    const [firstUser] = await db.select().from(users).orderBy(asc(users.id)).limit(1);
    const founder = admin ?? firstUser;
    if (!founder) {
      console.error('No users exist yet — nothing to do.');
      process.exit(1);
    }
    general = await createCommunity(
      'Γενική Κοινότητα',
      'Η κοινότητα όλων. Κάθε μέλος της πλατφόρμας συμμετέχει αυτόματα — '
        + 'εδώ συζητάμε τη βελτίωση της ίδιας της πλατφόρμας, δοκιμάζουμε '
        + 'τις δημοσκοπήσεις και φιλοξενούμε ό,τι αφορά όλους.',
      'managed',
      founder.id,
      { isGeneral: true },
    );
    console.log(`Created General community #${general.id} (founder user #${founder.id})`);
  } else {
    console.log(`General community already exists: #${general.id} "${general.name}"`);
  }

  // Backfill active accounts only. accountStatus vocabulary is
  // 'active' | 'banned' | 'erased' (Art. 17 crypto-shred sets 'erased');
  // legacy rows may have NULL, which we treat as active.
  const allUsers = await db.select({ id: users.id }).from(users)
    .where(or(isNull(users.accountStatus), eq(users.accountStatus, 'active')))
    .orderBy(asc(users.id));
  for (const u of allUsers) {
    await addMember(general.id, u.id); // idempotent: select-before-insert
  }
  console.log(`Membership ensured for ${allUsers.length} active users.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('create-general-community failed:', err);
  process.exit(1);
});
