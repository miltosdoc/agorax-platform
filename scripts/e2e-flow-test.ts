/**
 * End-to-end lifecycle test.
 *
 * Walks one proposal from creation to a tallied vote with 10 citizens,
 * driving each transition directly through the underlying functions (no
 * HTTP, so we don't have to manage 10 sessions). Goal is not to assert
 * correctness — it's to surface where the flow gets stuck so we can fix
 * each blocker.
 *
 *   npx tsx scripts/e2e-flow-test.ts
 *
 * Side effects: creates 10 users `e2e_citizen_{1..10}` if they don't exist,
 * a community "E2E Test Polis", one proposal, one sortition body, and up
 * to 10 ballots. Idempotent: re-running reuses everything.
 */

import 'dotenv/config';
import { db } from '../server/db';
import {
  users,
  communities,
  communityMembers,
  proposals,
  sortitionBodies,
  sortitionMembers,
} from '../shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { proposalRepo, communityRepo, storage } from '../server/storage';
import {
  transitionProposal,
  triggerSideEffects,
  handleSortitionCompletion,
} from '../server/utils/proposal-state-machine';
import { ElectionGuardBackend } from '../server/voting/electionguard-backend';
import type { VoteChoice } from '../server/voting/types';

// ─── Pretty logging ─────────────────────────────────────────────────────────
const log = {
  step: (n: number, s: string) => console.log(`\n━━━ Step ${n}: ${s} ━━━`),
  ok: (s: string) => console.log(`  ✓ ${s}`),
  info: (s: string) => console.log(`  · ${s}`),
  warn: (s: string) => console.log(`  ⚠ ${s}`),
  fail: (s: string) => console.log(`  ✗ ${s}`),
};
const blockers: string[] = [];
const blocker = (s: string) => { blockers.push(s); log.fail(s); };

const COMMUNITY_NAME = 'E2E Test Polis';
const USER_PREFIX = 'e2e_citizen_';
const NUM_USERS = 10;

async function step1_setupUsersAndCommunity(): Promise<{ communityId: number; userIds: number[] }> {
  log.step(1, 'Set up community + 10 users');

  // Ensure 10 users first (community needs creator_id).
  const userIds: number[] = [];
  for (let i = 1; i <= NUM_USERS; i++) {
    const username = `${USER_PREFIX}${i}`;
    const email = `${username}@e2e.test`;
    const [existing] = await db.select().from(users).where(eq(users.username, username));
    let uid: number;
    if (existing) {
      uid = existing.id;
    } else {
      try {
        const [u] = await db
          .insert(users)
          .values({
            username,
            password: 'e2e-test-no-login',
            email,
            name: `E2E Citizen ${i}`,
          } as any)
          .returning();
        uid = u.id;
      } catch (err: any) {
        blocker(`createUser ${username}: ${err?.message}`);
        continue;
      }
    }
    userIds.push(uid);
  }
  log.ok(`Ensured ${userIds.length} users`);

  // Find or create the community with creator = user 1.
  const existingCommunities = await db
    .select()
    .from(communities)
    .where(eq(communities.name, COMMUNITY_NAME))
    .limit(1);
  let communityId: number;
  if (existingCommunities.length > 0) {
    communityId = existingCommunities[0].id;
    log.ok(`Reusing community #${communityId}`);
  } else {
    const [c] = await db
      .insert(communities)
      .values({
        name: COMMUNITY_NAME,
        description: 'Automatic E2E flow test community',
        category: 'demos',
        privacy: 'public',
        creatorId: userIds[0],
      } as any)
      .returning();
    communityId = c.id;
    log.ok(`Created community #${communityId} with creator user #${userIds[0]}`);
  }

  // Add each user to the community (idempotent). Backdate joinedAt to 30 days
  // ago — the sortition eligibility rule (server/utils/sortition.ts:101) hides
  // members who joined less than 7 days ago, which otherwise makes every new
  // community unable to ever run sortition until a week has passed.
  const longAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  for (const uid of userIds) {
    const [member] = await db
      .select()
      .from(communityMembers)
      .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, uid)));
    if (!member) {
      await db.insert(communityMembers).values({
        communityId,
        userId: uid,
        role: uid === userIds[0] ? 'admin' : 'member',
        joinedAt: longAgo,
      } as any);
    } else {
      await db
        .update(communityMembers)
        .set({ joinedAt: longAgo })
        .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, uid)));
    }
  }
  log.ok(`All ${userIds.length} users are members of community #${communityId} (joinedAt backdated 30d)`);

  // Reset stale sortition bodies from prior test runs — otherwise the
  // eligibility filter (which excludes members already in an 'active' or
  // 'selecting' body) leaves us with no eligible pool.
  const cleanup = await db
    .update(sortitionBodies)
    .set({ status: 'completed', completedAt: new Date() } as any)
    .where(and(
      eq(sortitionBodies.communityId, communityId),
      sql`${sortitionBodies.status} IN ('selecting', 'active')`,
    ))
    .returning({ id: sortitionBodies.id });
  if (cleanup.length > 0) {
    log.info(`Reset ${cleanup.length} stale sortition body(ies) leftover from prior runs`);
  }

  return { communityId, userIds };
}

async function step2_createProposal(communityId: number, authorId: number): Promise<number> {
  log.step(2, 'Author creates a proposal');
  const proposal = await proposalRepo.createProposal({
    communityId,
    authorId,
    question: 'E2E test: should we adopt automatic flow tests?',
    solution: 'Run the e2e-flow-test.ts script on every release to catch lifecycle regressions early.',
    category: 'governance',
    status: 'draft',
  } as any);
  log.ok(`Proposal #${proposal.id} created in 'draft'`);
  return proposal.id;
}

async function transitionAndFireSideEffects(proposalId: number, target: string): Promise<string> {
  const p = await proposalRepo.getProposal(proposalId);
  if (!p) throw new Error('proposal vanished');
  const from = p.status as any;
  try {
    await transitionProposal(p as any, target as any, storage);
    await triggerSideEffects(from, target as any, { ...p, status: target } as any);
    log.ok(`Transition ${from} → ${target}`);
  } catch (e: any) {
    blocker(`transition ${from} → ${target}: ${e?.message}`);
  }
  const after = await proposalRepo.getProposal(proposalId);
  return after?.status ?? 'gone';
}

async function step3_submit(proposalId: number): Promise<void> {
  log.step(3, 'Submit proposal (draft → review, queues LLM scoring)');
  await transitionAndFireSideEffects(proposalId, 'review');
  // Real submit also enqueues an llm job. Wait briefly to see if it auto-advances.
  log.info('Waiting 18s for the LLM scoring job to score and advance (real LLM call is ~12s)…');
  await new Promise((r) => setTimeout(r, 18000));
  const p = await proposalRepo.getProposal(proposalId);
  log.info(`Status after wait: ${p?.status}`);
  if (p?.status === 'review') {
    log.warn('LLM scoring did not advance the proposal — likely no LLM_API_URL or the job worker is not running. Forcing review → author_review.');
    await transitionAndFireSideEffects(proposalId, 'author_review');
  }
}

async function step4_authorReview(proposalId: number): Promise<void> {
  log.step(4, 'Author moves to community_signal');
  const p = await proposalRepo.getProposal(proposalId);
  if (p?.status === 'voting') {
    log.ok('Already in voting (skip-route from review).');
    return;
  }
  if (p?.status !== 'author_review') {
    blocker(`expected author_review, got ${p?.status}`);
    return;
  }
  await transitionAndFireSideEffects(proposalId, 'community_signal');
}

async function step5_communitySignal(proposalId: number): Promise<void> {
  log.step(5, 'Open sortition synthesis (community_signal → sortition_synthesis)');
  const p = await proposalRepo.getProposal(proposalId);
  if (p?.status !== 'community_signal') {
    blocker(`expected community_signal, got ${p?.status}`);
    return;
  }
  await transitionAndFireSideEffects(proposalId, 'sortition_synthesis');
}

async function step6_runSortition(proposalId: number, communityId: number): Promise<void> {
  log.step(6, 'Sortition body — wait then force-complete');
  // The transition enqueues create_sortition; the job worker actually runs
  // createSortitionBody. Give it a moment.
  log.info('Waiting 5s for the create_sortition job to land…');
  await new Promise((r) => setTimeout(r, 5000));

  const [body] = await db
    .select()
    .from(sortitionBodies)
    .where(eq(sortitionBodies.proposalId, proposalId))
    .orderBy(desc(sortitionBodies.id))
    .limit(1);
  if (!body) {
    blocker('No sortition body was created by the worker. Calling createSortitionBody directly as fallback…');
    const { createSortitionBody } = await import('../server/utils/sortition');
    try {
      const result = await createSortitionBody(communityId, 5, storage, 'text_synthesis', proposalId);
      log.ok(`Created body #${result.bodyId} via direct call (selected ${result.selectedCount}/${result.totalEligible})`);
    } catch (e: any) {
      blocker(`direct createSortitionBody failed: ${e?.message}`);
      return;
    }
  } else {
    log.ok(`Sortition body #${body.id} exists with size=${body.size}`);
  }

  // Refresh the body row.
  const [b2] = await db
    .select()
    .from(sortitionBodies)
    .where(eq(sortitionBodies.proposalId, proposalId))
    .orderBy(desc(sortitionBodies.id))
    .limit(1);
  if (!b2) { blocker('No body after fallback'); return; }

  // Simulate sortition members submitting scores so handleSortitionCompletion
  // doesn't route to 'archived'. Without scores the proposal is archived as
  // "no jury feedback" — a realistic terminal but not what we want to exercise.
  const members = await db
    .select()
    .from(sortitionMembers)
    .where(eq(sortitionMembers.bodyId, b2.id));
  log.info(`Simulating ${members.length} sortition members responding with score=80…`);
  for (const m of members) {
    try {
      await db
        .update(sortitionMembers)
        .set({ score: 80, responded: true, respondedAt: new Date() } as any)
        .where(eq(sortitionMembers.id, m.id));
    } catch (e: any) {
      blocker(`set score for sortition member ${m.id}: ${e?.message}`);
    }
  }

  // Now force-complete via handleSortitionCompletion. Short-circuits the 72h timer.
  log.info(`Force-completing body #${b2.id}…`);
  try {
    await handleSortitionCompletion(b2.id, proposalId);
    log.ok('handleSortitionCompletion ran');
  } catch (e: any) {
    blocker(`handleSortitionCompletion: ${e?.message}`);
  }
  const after = await proposalRepo.getProposal(proposalId);
  log.info(`Status after sortition completion: ${after?.status}`);
  if (after?.status !== 'voting') {
    log.warn(`Sortition completion routed to ${after?.status}. Forcing → voting for the test.`);
    if (after?.status === 'sortition_synthesis') {
      await transitionAndFireSideEffects(proposalId, 'voting');
    } else if (after?.status === 'archived') {
      blocker('Sortition completion archived the proposal even though members had scores; investigate handleSortitionCompletion scoring math.');
    }
  }
}

async function step7_castVotes(proposalId: number, userIds: number[]): Promise<void> {
  log.step(7, 'Cast 10 ballots via ElectionGuardBackend');
  const backend = new ElectionGuardBackend();
  try {
    await backend.startElection({ proposalId });
    log.ok('startElection ok (key ceremony ran or election already open)');
  } catch (e: any) {
    blocker(`startElection: ${e?.message}`);
    return;
  }

  const choices: VoteChoice[] = ['yes', 'yes', 'yes', 'yes', 'yes', 'yes', 'no', 'no', 'abstain', 'yes'];
  let castCount = 0;
  for (let i = 0; i < userIds.length; i++) {
    const userId = userIds[i];
    const choice = choices[i] ?? 'yes';
    try {
      const receipt = await backend.castSignedBallot({ proposalId, userId, choice });
      castCount++;
      log.info(`  vote ${i + 1}/10 (user ${userId}, ${choice}) → receipt voteId=${receipt.voteId}`);
    } catch (e: any) {
      blocker(`castSignedBallot user ${userId}: ${e?.message}`);
    }
  }
  log.ok(`${castCount}/${userIds.length} ballots cast`);
}

async function step8_finalize(proposalId: number): Promise<void> {
  log.step(8, 'Finalize: closeAndTally + transition to decided');
  // Make sure we're in voting before closing — otherwise the transition rules
  // refuse the final step. (Sortition can land in sortition_synthesis or
  // even archived; we route through voting for the test.)
  const before = await proposalRepo.getProposal(proposalId);
  if (before?.status !== 'voting') {
    log.warn(`Not in voting (status=${before?.status}); routing → voting first`);
    if (before?.status === 'sortition_synthesis') {
      await transitionAndFireSideEffects(proposalId, 'voting');
    } else if (before?.status === 'archived' || before?.status === 'decided') {
      blocker(`Already terminal at ${before.status}; cannot finalize`);
      return;
    }
  }
  const backend = new ElectionGuardBackend();
  try {
    const result = await backend.closeAndTally({ proposalId });
    log.ok(`Tally: yes=${result.yes} no=${result.no} abstain=${result.abstain} total=${result.total}`);
  } catch (e: any) {
    blocker(`closeAndTally: ${e?.message}`);
    return;
  }
  await transitionAndFireSideEffects(proposalId, 'decided');
}

async function main(): Promise<void> {
  console.log('━━━ AgoraX E2E flow test ━━━');
  const { communityId, userIds } = await step1_setupUsersAndCommunity();
  const proposalId = await step2_createProposal(communityId, userIds[0]);
  await step3_submit(proposalId);
  await step4_authorReview(proposalId);
  await step5_communitySignal(proposalId);
  await step6_runSortition(proposalId, communityId);
  await step7_castVotes(proposalId, userIds);
  await step8_finalize(proposalId);

  const finalP = await proposalRepo.getProposal(proposalId);
  console.log(`\n━━━ Final state: ${finalP?.status} ━━━`);

  if (blockers.length === 0) {
    console.log('✓ Flow completed end-to-end with no blockers');
    process.exit(0);
  } else {
    console.log(`✗ ${blockers.length} blocker(s):`);
    blockers.forEach((b, i) => console.log(`  ${i + 1}. ${b}`));
    process.exit(1);
  }
}

void main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(2);
});
