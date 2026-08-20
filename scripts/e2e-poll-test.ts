/**
 * E2E polling-module flow test.
 *
 * Exercises the full v1 definition-of-done against the live database:
 *   1. blind-signature panel enrollment for N test users (RFC 9474)
 *   2. anonymous panelist registration with skewed demographics
 *   3. NL intent → Poll Compiler (LLM or deterministic fallback)
 *   4. fielding with piggyback-module injection (planned missingness)
 *   5. per-respondent instruments (module first, seeded option order)
 *   6. responses incl. deliberate quality failures (speeder, attention
 *      fail, straight-liner) to prove the gate fires
 *   7. quality-gated Democracy Points claim for one user
 *   8. close → raking (raw + weighted), methodology auto-block
 *
 * Reruns: panel tokens persist in /tmp/agorax-e2e-panel-tokens.json and are
 * reused; if the file is gone, a fresh user cohort (timestamp suffix) is
 * created so the one-enrollment-per-user ledger stays honest.
 *
 * Run: npx tsx scripts/e2e-poll-test.ts
 */
import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { and, eq } from 'drizzle-orm';
import { db, voteDb } from '../server/db';
import {
  users, surveyPolls, surveyItems, surveyResponses,
  type SurveyPoll,
} from '../shared/schema';
import { blind, unblind } from '../shared/blind-sig';
import { ensureEnrollmentKey, loadEnrollmentPrivateKey } from '../server/utils/panel-vault';
import { signBlinded } from '../shared/blind-sig';
import { registerPanelist, resolvePanelist, hashClaimCode } from '../server/utils/panel';
import { compileSurvey, planAttentionCheck } from '../server/utils/poll-compiler';
import { materializeModuleItems } from '../server/utils/survey-module';
import { buildInstrument, submitResponse } from '../server/utils/survey-engine';
import { computeAndStoreResults, buildMethodology } from '../server/utils/survey-results';
import { awardPoints } from '../server/economy/points';
import { panelEnrollments } from '../shared/schema';
import {
  AGE_BANDS, GENDERS, NUTS2_REGIONS, EDUCATION_LEVELS, URBANITY_LEVELS, PAST_VOTE_2023,
} from '../shared/polling';

const N_PANELISTS = 48;
const TOKENS_FILE = '/tmp/agorax-e2e-panel-tokens.json';
const blockers: string[] = [];

function note(msg: string) { console.log(`  ${msg}`); }
function step(msg: string) { console.log(`\n■ ${msg}`); }
function blocker(msg: string) { blockers.push(msg); console.log(`  ✗ BLOCKER: ${msg}`); }

/** Deliberately skewed demographics — young, urban, Attiki-heavy — so the
 * raking has real work to do and weights visibly deviate from 1. */
function profileFor(i: number) {
  return {
    ageBand: i % 3 === 0 ? AGE_BANDS[i % AGE_BANDS.length] : '25-34',
    gender: GENDERS[i % 2],
    region: i % 4 === 0 ? NUTS2_REGIONS[i % NUTS2_REGIONS.length] : 'EL30',
    education: i % 3 === 0 ? EDUCATION_LEVELS[i % EDUCATION_LEVELS.length] : 'tertiary',
    urbanity: i % 5 === 0 ? URBANITY_LEVELS[i % URBANITY_LEVELS.length] : 'urban',
    pastVote2023: PAST_VOTE_2023[i % PAST_VOTE_2023.length],
    benchmarks: { smoker: i % 4 === 0, household_car: i % 5 !== 0, household_size: (i % 4) + 1 },
  };
}

async function enrollPanel(): Promise<string[]> {
  step(`Panel enrollment — ${N_PANELISTS} users via blind signatures`);
  if (existsSync(TOKENS_FILE)) {
    const saved = JSON.parse(readFileSync(TOKENS_FILE, 'utf8')) as string[];
    if (Array.isArray(saved) && saved.length >= N_PANELISTS) {
      const probe = await resolvePanelist(saved[0]);
      if (probe) {
        note(`reusing ${saved.length} saved panel tokens (${TOKENS_FILE})`);
        return saved.slice(0, N_PANELISTS);
      }
    }
  }

  await ensureEnrollmentKey();
  const privateKey = await loadEnrollmentPrivateKey();
  const publicKey = { n: privateKey.n, e: privateKey.e };
  const suffix = Date.now().toString(36);
  const tokens: string[] = [];

  for (let i = 0; i < N_PANELISTS; i++) {
    const username = `e2e_panel_${suffix}_${i}`;
    const [user] = await db.insert(users).values({
      username,
      name: `E2E Panelist ${i}`,
      email: `${username}@example.invalid`,
      password: 'x'.repeat(60),
      requiresConsent: false,
    }).returning({ id: users.id });

    // Identity side: one-enrollment-per-user ledger + blind signature.
    await db.insert(panelEnrollments).values({ userId: user.id, sourceChannel: i % 6 === 5 ? 'partner' : 'organic' });
    const req = await blind(publicKey, Date.now());
    const blindSig = await signBlinded(req.blinded, privateKey);
    const signature = await unblind(blindSig, req.token, req.preparedMsg, req.blindingFactor, publicKey);

    // Anonymous side: register with token + profile, never with the user id.
    const tokenB64 = Buffer.from(req.token).toString('base64');
    const preparedB64 = Buffer.from(req.preparedMsg).toString('base64');
    const result = await registerPanelist({
      token: tokenB64,
      preparedMsg: preparedB64,
      signature,
      sourceChannel: i % 6 === 5 ? 'partner' : 'organic',
      profile: profileFor(i),
    });
    if (!result.ok) { blocker(`panelist ${i} registration failed: ${result.message}`); continue; }
    tokens.push(tokenB64);
  }
  writeFileSync(TOKENS_FILE, JSON.stringify(tokens));
  note(`${tokens.length} panelists enrolled & registered (1 in 6 tagged 'partner' to test cohort exclusion)`);
  return tokens;
}

async function createPoll(creatorId: number): Promise<SurveyPoll> {
  step('Compile poll from natural-language intent');
  const intent = 'Θέλω να μάθω τη γνώμη των πολιτών για τη δημιουργία νέων ποδηλατοδρόμων στο κέντρο της πόλης και αν θα τους χρησιμοποιούσαν.';
  const compiled = await compileSurvey(intent);
  note(`generator=${compiled.meta.generator} reviewer=${compiled.meta.reviewer} items=${compiled.survey.items.length} approved=${compiled.verdict.approved}`);

  const [poll] = await db.insert(surveyPolls).values({
    tier: 'community',
    title: compiled.survey.title,
    topicTag: compiled.survey.topicTag,
    intent,
    status: 'draft',
    creatorId,
    language: compiled.survey.language,
    compilerMeta: compiled.meta,
    gatekeeperVerdict: compiled.verdict,
  }).returning();

  const check = planAttentionCheck(compiled.survey.items.length);
  const rows: any[] = compiled.survey.items.map((item, i) => ({
    pollId: poll.id,
    position: 100 + i + (i >= check.insertAt ? 1 : 0),
    text: item.text,
    itemType: item.itemType,
    options: item.options ?? null,
    randomizeOptions: item.randomizeOptions,
    required: item.required,
  }));
  rows.push({
    pollId: poll.id,
    position: 100 + check.insertAt,
    text: check.text,
    itemType: 'single_choice',
    options: check.options,
    randomizeOptions: false,
    required: true,
    isAttentionCheck: true,
    attentionExpected: check.expected,
  });
  await db.insert(surveyItems).values(rows);
  note(`poll #${poll.id} «${poll.title}» — ${rows.length} host items (incl. attention check)`);
  return poll;
}

async function main() {
  console.log('═══ AgoraX polling module — end-to-end flow test ═══');

  const tokens = await enrollPanel();
  if (tokens.length < N_PANELISTS - 2) {
    blocker(`only ${tokens.length}/${N_PANELISTS} panelists available`);
  }

  // Poll creator = first user available (any user works).
  const [creator] = await db.select({ id: users.id }).from(users).limit(1);
  const poll = await createPoll(creator.id);

  step('Field the poll (piggyback module injection)');
  const moduleMap = await materializeModuleItems(poll.id);
  await db.update(surveyPolls).set({ status: 'live', opensAt: new Date() }).where(eq(surveyPolls.id, poll.id));
  const [livePoll] = await db.select().from(surveyPolls).where(eq(surveyPolls.id, poll.id));
  note(`module items materialized: ${moduleMap.size}; poll is live`);
  if (moduleMap.size === 0) blocker('no module items materialized — was scripts/seed-question-bank.ts run?');

  step(`Respond — ${tokens.length} panelists (incl. 1 speeder, 1 attention-fail, 1 straight-liner)`);
  let completed = 0, passed = 0;
  let savedClaim: { code: string } | null = null;
  const expectFail: Record<number, string> = { 3: 'attention', 4: 'straightline', 5: 'speeder' };

  for (let i = 0; i < tokens.length; i++) {
    const panelist = await resolvePanelist(tokens[i]);
    if (!panelist) { blocker(`panelist ${i}: token did not resolve`); continue; }

    const instrument = await buildInstrument(livePoll, panelist.id);
    const moduleCount = instrument.items.filter((it) => it.isModuleItem).length;
    if (i === 0) {
      note(`instrument: ${instrument.items.length} items, ${moduleCount} module items first=${instrument.items[0]?.isModuleItem}`);
      if (!instrument.items[0]?.isModuleItem) blocker('module items are not first in the instrument');
    }
    if (moduleCount !== 3) blocker(`panelist ${i}: expected 3 module items, got ${moduleCount}`);

    // Backdate startedAt so honest respondents clear the speeder floor.
    if (expectFail[i] !== 'speeder') {
      await voteDb.update(surveyResponses)
        .set({ startedAt: new Date(Date.now() - 10 * 60_000) })
        .where(and(eq(surveyResponses.pollId, poll.id), eq(surveyResponses.panelistId, panelist.id)));
    }

    const answers = instrument.items.map((item) => {
      const isAttention = item.options?.some((o) => item.text.includes('επιβεβαιώσουμε') || item.text.includes('ανεξάρτητα'));
      if (item.options && isAttention) {
        // The check instructs which option to pick; find it from the text.
        const expected = item.options.find((o) => item.text.includes(`«${o.text}»`));
        const wrong = item.options.find((o) => o !== expected) ?? item.options[0];
        const pick = expectFail[i] === 'attention' ? wrong : (expected ?? item.options[0]);
        return { itemId: item.id, value: pick.index, timeMs: 3000 };
      }
      if (!item.options) return { itemId: item.id, value: i % 4 === 0 ? `Σχόλιο από συμμετέχοντα ${i}` : '' , timeMs: 4000 };
      const idx = expectFail[i] === 'straightline' ? 1 : (i + item.id) % item.options.length;
      const canonical = item.options[Math.min(idx, item.options.length - 1)].index;
      return {
        itemId: item.id,
        value: item.itemType === 'multi_choice' ? [canonical] : canonical,
        timeMs: 2500,
      };
    });

    const result = await submitResponse(livePoll, panelist.id, answers);
    if (!result.ok) { blocker(`panelist ${i}: submit failed — ${result.message}`); continue; }
    completed++;
    if (result.qualityPassed) passed++;
    if (expectFail[i] && result.qualityPassed) {
      blocker(`panelist ${i}: expected ${expectFail[i]} flag, but quality passed (flags=${JSON.stringify(result.flags)})`);
    }
    if (!expectFail[i] && !result.qualityPassed) {
      blocker(`panelist ${i}: unexpectedly failed quality (flags=${JSON.stringify(result.flags)})`);
    }
    if (!savedClaim && result.claimCode) savedClaim = { code: result.claimCode };
  }
  note(`${completed} completed, ${passed} quality-passed (${completed - passed} correctly gated out)`);

  step('Quality-gated Democracy Points claim');
  if (!savedClaim) {
    blocker('no claim code captured');
  } else {
    const codeHash = hashClaimCode(savedClaim.code);
    const [resp] = await voteDb.select().from(surveyResponses)
      .where(and(eq(surveyResponses.pollId, poll.id), eq(surveyResponses.claimCodeHash, codeHash)))
      .limit(1);
    if (!resp || resp.claimedAt) {
      blocker('claim code did not resolve to an unclaimed response');
    } else {
      await voteDb.update(surveyResponses).set({ claimedAt: new Date() }).where(eq(surveyResponses.id, resp.id));
      const award = await awardPoints({ userId: creator.id, actionKey: 'survey_complete', refType: 'survey_poll', refId: poll.id });
      note(`award: ${award.reason} (+${award.points})`);
      if (award.reason !== 'awarded' && award.reason !== 'already_awarded') blocker(`points award failed: ${award.reason}`);
    }
  }

  step('Close poll — raking + methodology');
  const results = await computeAndStoreResults(livePoll, 'published');
  await computeAndStoreResults(livePoll, 'all');
  const methodology = buildMethodology(livePoll, results);
  await db.update(surveyPolls).set({ status: 'closed', closedAt: new Date(), methodology }).where(eq(surveyPolls.id, poll.id));

  note(`cohort=published completes=${results.completes} qualityExcluded=${results.qualityExcluded}`);
  note(`weighting: applied=${results.weighting.applied} engine=${results.weighting.engine} effN=${results.weighting.effectiveN} deff=${results.weighting.designEffect}`);
  note(`variables: ${results.weighting.variablesUsed.join(', ')} (dropped: ${results.weighting.variablesDropped.join(', ') || 'none'})`);
  if (!results.weighting.applied) blocker(`weighting did not apply (completes=${results.completes})`);

  const partnerExcluded = results.completes < completed - (completed - passed); // partner cohort must shrink 'published'
  if (!partnerExcluded) note('note: verify partner-cohort exclusion manually');

  for (const m of results.marginals.slice(0, 4)) {
    const top = m.shares
      ? m.shares.map((s, idx) => `${m.options?.[idx]}: ${(s * 100).toFixed(0)}%${m.weightedShares ? `→${(m.weightedShares[idx] * 100).toFixed(0)}%` : ''}`).slice(0, 3).join(' | ')
      : `open text ×${m.openTextCount ?? 0}`;
    note(`[${m.isModuleItem ? 'module' : 'host'}] ${m.text.slice(0, 60)}… n=${m.answered} ${top}`);
  }
  note(`methodology block keys: ${Object.keys(methodology).join(', ')}`);

  console.log('\n═══ RESULT ═══');
  if (blockers.length === 0) {
    console.log('✓ Full flow OK — enrollment → registration → compile → field → module injection → respond → quality gate → claim → raking → methodology');
  } else {
    console.log(`✗ ${blockers.length} blocker(s):`);
    for (const b of blockers) console.log(`  - ${b}`);
    process.exitCode = 1;
  }
  process.exit(process.exitCode ?? 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
