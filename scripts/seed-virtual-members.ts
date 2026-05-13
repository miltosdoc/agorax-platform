/**
 * Seed 20 virtual members into the General community with old enough
 * `joinedAt` to satisfy the sortition 7-day membership requirement.
 *
 * Idempotent: re-running won't create duplicates.
 *
 * Run with: npx tsx scripts/seed-virtual-members.ts
 */

import { db } from '../server/db';
import { users, communities, communityMembers } from '../shared/schema';
import { and, eq } from 'drizzle-orm';

const FIRST_NAMES = [
  'Ελένη', 'Νίκος', 'Σοφία', 'Δημήτρης', 'Άννα',
  'Γιάννης', 'Κατερίνα', 'Πέτρος', 'Αλεξάνδρα', 'Κώστας',
  'Χριστίνα', 'Παναγιώτης', 'Βασιλική', 'Στέφανος', 'Δέσποινα',
  'Αντώνης', 'Ειρήνη', 'Μιχάλης', 'Όλγα', 'Θανάσης',
];
const LAST_NAMES = [
  'Παπαδάκης', 'Νικολάου', 'Αντωνίου', 'Δημητρίου', 'Γεωργίου',
  'Ιωαννίδου', 'Παππάς', 'Μακρή', 'Σταυρίδης', 'Καραγιάννη',
  'Λάμπρου', 'Βλάχος', 'Καρράς', 'Μανίκα', 'Φραγκιά',
  'Σπυρίδων', 'Τσαούσης', 'Κουτρουμάνου', 'Ρούσσος', 'Χατζή',
];

async function seedVirtualMembers() {
  const [general] = await db
    .select()
    .from(communities)
    .where(eq(communities.isGeneral, true));

  if (!general) {
    console.error('No General community found. Run the main seed first.');
    process.exit(1);
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  let created = 0;
  let alreadyMember = 0;

  for (let i = 0; i < 20; i++) {
    const first = FIRST_NAMES[i];
    const last = LAST_NAMES[i];
    const username = `virtual_${first.toLowerCase().replace(/[^a-z]/g, '')}_${i + 1}`;
    const email = `${username}@demo.local`;
    const name = `${first} ${last}`;

    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username));

    if (!user) {
      [user] = await db
        .insert(users)
        .values({
          username,
          name,
          email,
          password: '$2b$10$dummyhash',
        })
        .returning();
    }

    const [existingMember] = await db
      .select()
      .from(communityMembers)
      .where(and(
        eq(communityMembers.userId, user.id),
        eq(communityMembers.communityId, general.id),
      ));

    if (existingMember) {
      alreadyMember += 1;
      continue;
    }

    await db.insert(communityMembers).values({
      userId: user.id,
      communityId: general.id,
      role: 'member',
      joinedAt: thirtyDaysAgo,
    });
    created += 1;
  }

  console.log(`✅ Virtual members added to "${general.name}": ${created} new, ${alreadyMember} already members.`);
  console.log(`   All joined 30 days ago — eligible for sortition (>= 7-day rule).`);
  process.exit(0);
}

seedVirtualMembers().catch((err) => {
  console.error(err);
  process.exit(1);
});
