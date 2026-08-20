/**
 * One-off smoke for the hide/unhide visibility bug.
 *
 * Scenario:
 *   1. User A (author) creates a proposal.
 *   2. User B (member) uploads a podcast to A's proposal.
 *   3. User B hides their own upload.
 *   4. Expectation after the fix:
 *        • User B's GET /media list still includes the hidden row (so the
 *          UI can show an "unhide" button).
 *        • User A's GET /media list also includes it (author sees all).
 *        • A third party (User C) does NOT see it.
 *        • A logged-out viewer does NOT see it.
 *
 * Cleans up after itself.
 */

import 'dotenv/config';
import { db } from '../server/db';
import {
  users,
  communities,
  communityMembers,
  proposals,
  proposalMedia,
} from '@shared/schema';
import { eq, inArray } from 'drizzle-orm';
import { mediaRepo } from '../server/storage';

const TAG = `media-hide-${Date.now()}`;

async function main(): Promise<void> {
  let pass = true;
  const assert = (label: string, cond: boolean, detail?: string) => {
    const tag = cond ? 'PASS' : 'FAIL';
    console.log(`${tag}  ${label}${detail ? '  — ' + detail : ''}`);
    if (!cond) pass = false;
  };

  // ── Setup ────────────────────────────────────────────────────────────────
  const [creator] = await db.insert(users).values({
    username: `${TAG}-creator`,
    password: 'unused',
    name: 'Creator',
    email: `${TAG}-creator@example.test`,
    requiresConsent: false,
  }).returning({ id: users.id });

  const [community] = await db.insert(communities).values({
    name: `${TAG} community`,
    type: 'autonomous',
    creatorId: creator.id,
  }).returning({ id: communities.id });

  const newUsers = await db.insert(users).values([
    { username: `${TAG}-A`, password: 'x', name: 'A author',   email: `${TAG}-a@x.test`, requiresConsent: false },
    { username: `${TAG}-B`, password: 'x', name: 'B uploader', email: `${TAG}-b@x.test`, requiresConsent: false },
    { username: `${TAG}-C`, password: 'x', name: 'C other',    email: `${TAG}-c@x.test`, requiresConsent: false },
  ]).returning({ id: users.id });
  const [uA, uB, uC] = newUsers;

  await db.insert(communityMembers).values([
    { communityId: community.id, userId: uA.id, role: 'member' },
    { communityId: community.id, userId: uB.id, role: 'member' },
    { communityId: community.id, userId: uC.id, role: 'member' },
  ]);

  const [proposal] = await db.insert(proposals).values({
    communityId: community.id,
    authorId: uA.id,
    question: 'Hide/unhide smoke proposal',
    solution: 'A fictive proposal so we can test media hide visibility.',
    status: 'voting',
  }).returning({ id: proposals.id });

  // User B uploads a podcast to A's proposal.
  const [media] = await db.insert(proposalMedia).values({
    proposalId: proposal.id,
    uploaderId: uB.id,
    kind: 'podcast',
    filePath: `${proposal.id}/fake.mp3`,
    thumbPath: null,
    mimeType: 'audio/mpeg',
    sizeBytes: 1024,
    durationS: null,
    status: 'published',
    isFeatured: false,
  }).returning({ id: proposalMedia.id });

  // ── Baseline: everyone sees it while published ───────────────────────────
  let listAnon  = await mediaRepo.listForProposal(proposal.id, {});
  let listAsA   = await mediaRepo.listForProposal(proposal.id, { includeHidden: true,  userId: uA.id });
  let listAsB   = await mediaRepo.listForProposal(proposal.id, { includeHidden: false, userId: uB.id });
  let listAsC   = await mediaRepo.listForProposal(proposal.id, { includeHidden: false, userId: uC.id });
  assert('published row visible to anonymous viewer',           listAnon.some(m => m.id === media.id));
  assert('published row visible to author (A)',                 listAsA.some(m => m.id === media.id));
  assert('published row visible to uploader (B)',               listAsB.some(m => m.id === media.id));
  assert('published row visible to other community member (C)', listAsC.some(m => m.id === media.id));

  // ── User B hides their own upload ────────────────────────────────────────
  await mediaRepo.setStatus(media.id, 'hidden');

  // ── The fix's payoff ─────────────────────────────────────────────────────
  listAnon = await mediaRepo.listForProposal(proposal.id, {});
  listAsA  = await mediaRepo.listForProposal(proposal.id, { includeHidden: true,  userId: uA.id });
  listAsB  = await mediaRepo.listForProposal(proposal.id, { includeHidden: false, userId: uB.id });
  listAsC  = await mediaRepo.listForProposal(proposal.id, { includeHidden: false, userId: uC.id });

  assert('hidden row NOT visible to anonymous viewer',          !listAnon.some(m => m.id === media.id));
  assert('hidden row STILL visible to author (A, includeHidden=true)',
                                                                listAsA.some(m => m.id === media.id));
  assert('hidden row STILL visible to uploader (B) — the fix',
                                                                listAsB.some(m => m.id === media.id),
    'this was the bug: uploader could not find their own hidden upload');
  assert('hidden row NOT visible to other community member (C)',!listAsC.some(m => m.id === media.id));

  // ── User B unhides via setStatus('published') ────────────────────────────
  await mediaRepo.setStatus(media.id, 'published');
  const after = await mediaRepo.listForProposal(proposal.id, {});
  assert('unhide flow works: row republished and public again',
    after.some(m => m.id === media.id && m.status === 'published'));

  // ── Cleanup ──────────────────────────────────────────────────────────────
  await db.delete(proposalMedia).where(eq(proposalMedia.proposalId, proposal.id));
  await db.delete(proposals).where(eq(proposals.id, proposal.id));
  await db.delete(communityMembers).where(eq(communityMembers.communityId, community.id));
  await db.delete(communities).where(eq(communities.id, community.id));
  await db.delete(users).where(inArray(users.id, [creator.id, uA.id, uB.id, uC.id]));

  console.log(`\n${pass ? '✅ ALL CHECKS PASSED' : '❌ ONE OR MORE CHECKS FAILED'}`);
  process.exit(pass ? 0 : 1);
}

main().catch(err => {
  console.error('FATAL', err);
  process.exit(2);
});
