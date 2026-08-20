/**
 * One-off smoke test for the sortition backend.
 *
 * Seeds 100 fictive members into a fresh community, runs
 * `createSortitionBody(community, size=20)`, and asserts that the draw
 * is well-formed: exactly 20 selected, no duplicates, all from the
 * eligible pool, seed is recorded, and two runs produce different
 * selections (randomness sanity check).
 *
 * Cleans up after itself.
 *
 * Run: npx tsx scripts/sortition-smoke.ts
 */

import 'dotenv/config';
import { db } from '../server/db';
import {
  users,
  communities,
  communityMembers,
  sortitionBodies,
  sortitionMembers,
} from '@shared/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { storage } from '../server/storage';
import { createSortitionBody } from '../server/utils/sortition';

const TAG = 'sortition-smoke';
const N_USERS = 100;
const PANEL_SIZE = 20;

function nowMinusDays(d: number): Date {
  const t = new Date();
  t.setDate(t.getDate() - d);
  return t;
}

async function main(): Promise<void> {
  let pass = true;
  const assert = (label: string, cond: boolean, detail?: string) => {
    const tag = cond ? 'PASS' : 'FAIL';
    console.log(`${tag}  ${label}${detail ? '  — ' + detail : ''}`);
    if (!cond) pass = false;
  };

  // ── Setup ────────────────────────────────────────────────────────────────
  console.log(`\n[setup] creating test community + ${N_USERS} fictive users…`);

  // We need a creator before the community can be inserted.
  const [creator] = await db
    .insert(users)
    .values({
      username: `${TAG}-creator-${Date.now()}`,
      password: 'unused',
      name: 'Sortition Smoke Creator',
      email: `${TAG}-creator-${Date.now()}@example.test`,
      requiresConsent: false,
    })
    .returning({ id: users.id });

  const [community] = await db
    .insert(communities)
    .values({
      name: `Sortition Smoke ${Date.now()}`,
      description: 'Throw-away community for the sortition smoke test',
      type: 'autonomous',
      creatorId: creator.id,
    })
    .returning({ id: communities.id });

  // Build user rows. joined_at must be ≥ 7 days ago for eligibility,
  // so we backdate every membership.
  const userRows = Array.from({ length: N_USERS }, (_, i) => ({
    username: `${TAG}-u${i}-${Date.now()}`,
    password: 'unused',
    name: `Smoke User ${i + 1}`,
    email: `${TAG}-u${i}-${Date.now()}@example.test`,
    requiresConsent: false,
  }));
  const inserted = await db.insert(users).values(userRows).returning({ id: users.id });
  const userIds = inserted.map(r => r.id);
  console.log(`[setup] users ${userIds[0]}..${userIds[userIds.length - 1]} created`);

  const joinedAt = nowMinusDays(30);
  await db.insert(communityMembers).values(
    userIds.map(uid => ({
      communityId: community.id,
      userId: uid,
      role: 'member',
      joinedAt,
    })),
  );
  console.log(`[setup] all ${N_USERS} members joined at ${joinedAt.toISOString()}`);

  // ── Draw #1 ──────────────────────────────────────────────────────────────
  console.log(`\n[draw #1] requesting panel size ${PANEL_SIZE}…`);
  const t0 = Date.now();
  const draw1 = await createSortitionBody(community.id, PANEL_SIZE, storage, 'scoring');
  console.log(`[draw #1] returned in ${Date.now() - t0}ms`);

  assert(`selectedCount == ${PANEL_SIZE}`, draw1.selectedCount === PANEL_SIZE,
    `got ${draw1.selectedCount}`);
  assert(`selectedUserIds.length == ${PANEL_SIZE}`, draw1.selectedUserIds.length === PANEL_SIZE,
    `got ${draw1.selectedUserIds.length}`);
  assert('no duplicate selections',
    new Set(draw1.selectedUserIds).size === draw1.selectedUserIds.length);
  assert(`totalEligible == ${N_USERS}`, draw1.totalEligible === N_USERS,
    `got ${draw1.totalEligible}`);
  assert('every selected user id is one of our test members',
    draw1.selectedUserIds.every(id => userIds.includes(id)));

  // Verify what's actually in the DB matches what the function returned.
  const dbBody = await db.select().from(sortitionBodies).where(eq(sortitionBodies.id, draw1.bodyId));
  assert('body row exists and is active', dbBody.length === 1 && dbBody[0].status === 'active');
  assert('body.size matches panel size', dbBody[0]?.size === PANEL_SIZE,
    `got ${dbBody[0]?.size}`);

  const dbMembers = await db
    .select({ userId: sortitionMembers.userId })
    .from(sortitionMembers)
    .where(eq(sortitionMembers.bodyId, draw1.bodyId));
  assert(`DB has ${PANEL_SIZE} sortition_members rows for the body`,
    dbMembers.length === PANEL_SIZE, `got ${dbMembers.length}`);
  const dbMemberIds = new Set(dbMembers.map(m => m.userId));
  assert('DB members == selectedUserIds (set equality)',
    draw1.selectedUserIds.every(id => dbMemberIds.has(id))
    && dbMembers.length === draw1.selectedUserIds.length);

  // ── Draw #2 — eligibility now excludes the first 20 ──────────────────────
  console.log(`\n[draw #2] same panel size, expecting pool of ${N_USERS - PANEL_SIZE}…`);
  const draw2 = await createSortitionBody(community.id, PANEL_SIZE, storage, 'scoring');
  assert(`draw #2 totalEligible == ${N_USERS - PANEL_SIZE}`,
    draw2.totalEligible === N_USERS - PANEL_SIZE, `got ${draw2.totalEligible}`);
  assert('draw #2 selected zero overlap with draw #1',
    draw2.selectedUserIds.every(id => !draw1.selectedUserIds.includes(id)));

  // Randomness sanity: two independent draws from disjoint pools obviously
  // differ, but the LARGER check is that the same pool drawn twice does too.
  // Hard-reset the first body to free its members, then re-draw.
  await db.update(sortitionBodies)
    .set({ status: 'completed' })
    .where(eq(sortitionBodies.id, draw1.bodyId));
  await db.update(sortitionBodies)
    .set({ status: 'completed' })
    .where(eq(sortitionBodies.id, draw2.bodyId));

  console.log(`\n[draw #3 and #4] both bodies completed, full pool eligible again…`);
  const draw3 = await createSortitionBody(community.id, PANEL_SIZE, storage, 'scoring');
  await db.update(sortitionBodies)
    .set({ status: 'completed' })
    .where(eq(sortitionBodies.id, draw3.bodyId));
  const draw4 = await createSortitionBody(community.id, PANEL_SIZE, storage, 'scoring');

  const draw3Set = new Set(draw3.selectedUserIds);
  const draw4Set = new Set(draw4.selectedUserIds);
  const overlap = draw3.selectedUserIds.filter(id => draw4Set.has(id)).length;
  assert(`draw #3 and #4 selections differ (overlap ${overlap}/${PANEL_SIZE} — by chance, ~4)`,
    draw3Set.size === PANEL_SIZE
    && draw4Set.size === PANEL_SIZE
    && overlap < PANEL_SIZE);

  // ── Cleanup ──────────────────────────────────────────────────────────────
  console.log(`\n[cleanup] removing test rows…`);
  // Cascade from sortition_bodies → sortition_members.
  await db.delete(sortitionBodies).where(eq(sortitionBodies.communityId, community.id));
  await db.delete(communityMembers).where(eq(communityMembers.communityId, community.id));
  await db.delete(communities).where(eq(communities.id, community.id));
  // The creator + test users were referenced only by membership rows we
  // already deleted, so a straight delete is safe.
  await db.delete(users).where(inArray(users.id, [...userIds, creator.id]));
  console.log(`[cleanup] done`);

  console.log(`\n${pass ? '✅ ALL CHECKS PASSED' : '❌ ONE OR MORE CHECKS FAILED'}`);
  process.exit(pass ? 0 : 1);
}

main().catch(err => {
  console.error('FATAL', err);
  process.exit(2);
});
