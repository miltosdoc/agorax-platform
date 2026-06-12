/**
 * Surveys Router — open digital polling platform.
 *
 * Three route families:
 *   /api/panel/*          — anonymous panel lifecycle (blind-sig enrollment,
 *                           profile, annual refresh). Registration and all
 *                           token-authenticated routes are deliberately
 *                           UNauthenticated (X-Panel-Token bearer) so the
 *                           session can never be correlated with responses.
 *   /api/surveys/*        — two-tier polls: compile (LLM), field, take,
 *                           respond, results, methodology, points claim.
 *   /api/admin/surveys/*  — certified tier + question bank + tracker trends.
 *
 * GDPR: the identity side learns only "user X is a panelist" (enrollment
 * ledger) and "user X completed poll Y" (points claim — same disclosure
 * class as the blind-sig vote issuance ledger). Profiles and responses are
 * keyed by panelist id only.
 */
import type { Express, Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db, voteDb } from '../db';
import { requireAuth, requireAdmin } from '../auth';
import {
  surveyPolls, surveyItems, surveyResponses, surveyResults,
  panelEnrollments, questionBank, userConsents,
  type SurveyPoll,
} from '@shared/schema';
import {
  POLLING_CONSENT_VERSION, POLLING_CONSENT_TEXT,
  K_ANONYMITY_FLOOR, compiledSurveySchema,
} from '@shared/polling';
import { signBlinded } from '@shared/blind-sig';
import { ensureEnrollmentKey, loadEnrollmentPrivateKey } from '../utils/panel-vault';
import {
  registerPanelist, resolvePanelist, getProfile, updateProfile, hashClaimCode,
} from '../utils/panel';
import { compileSurvey, planAttentionCheck, CompilerRefusedError } from '../utils/poll-compiler';
import { materializeModuleItems } from '../utils/survey-module';
import { buildInstrument, submitResponse, completionStats, loadPoll } from '../utils/survey-engine';
import { computeAndStoreResults, buildMethodology, computeResults } from '../utils/survey-results';
import { awardPoints } from '../economy/points';

/** Host items start at this position; module items occupy 0..k-1 in front. */
const HOST_POSITION_BASE = 100;

async function panelistFromRequest(req: Request) {
  return resolvePanelist(req.header('x-panel-token') ?? undefined);
}

function pollVisible(poll: SurveyPoll, userId: number | null, isAdmin: boolean): boolean {
  if (poll.status === 'live' || poll.status === 'closed') return true;
  if (isAdmin) return true;
  return userId !== null && poll.creatorId === userId;
}

export function registerSurveysRoutes(app: Express): void {
  // ════ Panel enrollment (identity side) ════

  // Consent text + enrollment public key + "already enrolled?" in one call.
  app.get('/api/panel/enroll/key', requireAuth, async (req: any, res) => {
    try {
      const publicKey = await ensureEnrollmentKey();
      const [existing] = await db.select().from(panelEnrollments)
        .where(eq(panelEnrollments.userId, req.user.id)).limit(1);
      res.json({
        publicKey,
        alreadyEnrolled: !!existing,
        consentVersion: POLLING_CONSENT_VERSION,
        consentText: POLLING_CONSENT_TEXT,
      });
    } catch (err: any) {
      res.status(500).json({ message: err?.message ?? 'Enrollment key unavailable' });
    }
  });

  // Blind-sign an enrollment token. One per user, ever. Records the
  // polling-purpose consent (separate GDPR purpose) in the consent log.
  app.post('/api/panel/enroll/sign', requireAuth, async (req: any, res) => {
    try {
      const blindedToken = req.body?.blindedToken;
      const locale = req.body?.consentLocale === 'en' ? 'en' : 'el';
      if (typeof blindedToken !== 'string' || blindedToken.length > 4096) {
        return res.status(400).json({ message: 'blindedToken required' });
      }
      if (req.body?.consentVersion !== POLLING_CONSENT_VERSION) {
        return res.status(400).json({ message: 'Polling consent required (stale or missing version)' });
      }

      const inserted = await db.insert(panelEnrollments)
        .values({ userId: req.user.id, sourceChannel: 'organic' })
        .onConflictDoNothing({ target: [panelEnrollments.userId] })
        .returning({ id: panelEnrollments.id });
      if (inserted.length === 0) {
        return res.status(409).json({ message: 'Already enrolled in the panel' });
      }

      await db.insert(userConsents).values({
        userId: req.user.id,
        consentVersion: `polling-${POLLING_CONSENT_VERSION}`,
        consentTextHash: createHash('sha256').update(POLLING_CONSENT_TEXT[locale]).digest('hex'),
        locale,
      });

      const privateKey = await loadEnrollmentPrivateKey();
      const signature = await signBlinded(blindedToken, privateKey);
      res.json({
        signature,
        publicKey: { n: privateKey.n, e: privateKey.e },
        sourceChannel: 'organic',
      });
    } catch (err: any) {
      res.status(500).json({ message: err?.message ?? 'Enrollment signing failed' });
    }
  });

  // Anonymous registration — NO auth, NO CSRF coupling to a session. The
  // client must send this with credentials omitted (see panel-client.ts).
  app.post('/api/panel/register', async (req, res) => {
    const { token, preparedMsg, signature, profile, sourceChannel } = req.body ?? {};
    if (typeof token !== 'string' || typeof preparedMsg !== 'string' || typeof signature !== 'string') {
      return res.status(400).json({ message: 'token, preparedMsg, signature required' });
    }
    const result = await registerPanelist({ token, preparedMsg, signature, profile, sourceChannel });
    if (!result.ok) return res.status(result.status).json({ message: result.message });
    res.status(201).json({ panelistId: result.panelistId });
  });

  // ════ Panel self-service (token-authenticated, anonymous side) ════

  app.get('/api/panel/me', async (req, res) => {
    const panelist = await panelistFromRequest(req);
    if (!panelist) return res.status(401).json({ message: 'Invalid panel token' });
    const profile = await getProfile(panelist.id);
    res.json({
      panelistId: panelist.id,
      sourceChannel: panelist.sourceChannel,
      enrolledAt: panelist.enrolledAt,
      profile,
      profileRefreshDue: profile?.refreshDueAt ? new Date(profile.refreshDueAt) <= new Date() : false,
    });
  });

  app.put('/api/panel/profile', async (req, res) => {
    const panelist = await panelistFromRequest(req);
    if (!panelist) return res.status(401).json({ message: 'Invalid panel token' });
    const result = await updateProfile(panelist.id, req.body?.profile);
    if (!result.ok) return res.status(400).json({ message: result.message });
    res.json({ ok: true });
  });

  // ════ Poll creation & lifecycle ════

  // Compile a natural-language intent into a draft community poll.
  app.post('/api/surveys', requireAuth, async (req: any, res) => {
    const intent = typeof req.body?.intent === 'string' ? req.body.intent.trim() : '';
    if (intent.length < 10 || intent.length > 2000) {
      return res.status(400).json({ message: 'intent must be 10–2000 characters' });
    }
    const communityId = Number.isInteger(req.body?.communityId) ? req.body.communityId : null;

    let compiled;
    try {
      compiled = await compileSurvey(intent);
    } catch (err) {
      if (err instanceof CompilerRefusedError) {
        // Keep an audit row for refused push-poll attempts.
        await db.insert(surveyPolls).values({
          tier: 'community',
          title: intent.slice(0, 180),
          topicTag: 'απορρίφθηκε',
          intent,
          status: 'gatekeeper_flagged',
          creatorId: req.user.id,
          communityId,
          gatekeeperVerdict: { approved: false, reason: err.reason },
        });
        return res.status(422).json({ message: `Η δημοσκόπηση απορρίφθηκε από τον έλεγχο μεθοδολογίας: ${err.reason}` });
      }
      return res.status(500).json({ message: 'Compilation failed' });
    }

    const [poll] = await db.insert(surveyPolls).values({
      tier: 'community',
      title: compiled.survey.title,
      topicTag: compiled.survey.topicTag,
      intent,
      status: 'draft',
      creatorId: req.user.id,
      communityId,
      language: compiled.survey.language,
      targetN: Number.isInteger(req.body?.targetN) ? req.body.targetN : null,
      compilerMeta: compiled.meta,
      gatekeeperVerdict: compiled.verdict,
    }).returning();

    // Host items + the mechanically inserted attention check.
    const check = planAttentionCheck(compiled.survey.items.length);
    const rows = compiled.survey.items.map((item, i) => ({
      pollId: poll.id,
      position: HOST_POSITION_BASE + i + (i >= check.insertAt ? 1 : 0),
      text: item.text,
      itemType: item.itemType,
      options: item.options ?? null,
      randomizeOptions: item.randomizeOptions,
      required: item.required,
    }));
    rows.push({
      pollId: poll.id,
      position: HOST_POSITION_BASE + check.insertAt,
      text: check.text,
      itemType: 'single_choice',
      options: check.options,
      randomizeOptions: false,
      required: true,
      isAttentionCheck: true,
      attentionExpected: check.expected,
    } as any);
    await db.insert(surveyItems).values(rows);

    const items = await db.select().from(surveyItems)
      .where(eq(surveyItems.pollId, poll.id)).orderBy(asc(surveyItems.position));
    res.status(201).json({ poll, items, verdict: compiled.verdict });
  });

  // List polls: live ones for everyone; `mine=1` adds the caller's drafts.
  app.get('/api/surveys', async (req: any, res) => {
    const userId: number | null = req.user?.id ?? null;
    const mine = req.query?.mine === '1' && userId !== null;
    const polls = await db.select().from(surveyPolls).orderBy(desc(surveyPolls.id)).limit(200);
    const visible = polls.filter((p) =>
      mine ? p.creatorId === userId
        : p.status === 'live' || p.status === 'closed',
    );
    // Attach completion counts (cheap at this scale; revisit with volume).
    const withCounts = await Promise.all(visible.map(async (p) => ({
      ...p,
      completion: p.status === 'live' || p.status === 'closed' ? await completionStats(p.id) : null,
    })));
    res.json(withCounts);
  });

  app.get('/api/surveys/:id', async (req: any, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'bad id' });
    const poll = await loadPoll(id);
    if (!poll || !pollVisible(poll, req.user?.id ?? null, !!req.user?.isAdmin)) {
      return res.status(404).json({ message: 'Not found' });
    }
    const items = await db.select().from(surveyItems)
      .where(eq(surveyItems.pollId, id)).orderBy(asc(surveyItems.position));
    res.json({ poll, items, completion: await completionStats(id) });
  });

  // Edit a draft: title/topic + item wording/options. The creator owns the
  // draft — the compiler is a starting point, not an authority. Module
  // items and the attention check are excluded (canonical wording).
  // Edits are recorded in compilerMeta for the methodology page.
  app.patch('/api/surveys/:id', requireAuth, async (req: any, res) => {
    const id = parseInt(req.params.id, 10);
    const poll = await loadPoll(id);
    if (!poll) return res.status(404).json({ message: 'Not found' });
    if (poll.creatorId !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ message: 'Only the creator can edit this poll' });
    }
    if (poll.status !== 'draft') return res.status(409).json({ message: 'Only drafts are editable' });

    const { title, topicTag, items: itemEdits, deleteItemIds } = req.body ?? {};
    const existing = await db.select().from(surveyItems).where(eq(surveyItems.pollId, id));
    const byId = new Map(existing.map((i) => [i.id, i]));

    const editable = (itemId: number) => {
      const item = byId.get(itemId);
      if (!item) return null;
      if (item.isModuleItem || item.isAttentionCheck) return null;
      return item;
    };

    // Validate everything before writing anything.
    const updates: Array<{ id: number; text: string; options: string[] | null }> = [];
    if (Array.isArray(itemEdits)) {
      for (const edit of itemEdits) {
        const item = editable(Number(edit?.id));
        if (!item) return res.status(400).json({ message: `Item ${edit?.id} is not editable` });
        const text = typeof edit.text === 'string' ? edit.text.trim() : '';
        if (text.length < 5 || text.length > 500) {
          return res.status(400).json({ message: `Item ${item.id}: text must be 5–500 characters` });
        }
        let options: string[] | null = null;
        if (item.itemType !== 'open_text') {
          const opts: string[] = Array.isArray(edit.options)
            ? edit.options.map((o: unknown) => String(o).trim()).filter((o: string) => o.length > 0)
            : [];
          if (opts.length < 2 || opts.length > 12) {
            return res.status(400).json({ message: `Item ${item.id}: 2–12 options required` });
          }
          options = opts;
        }
        updates.push({ id: item.id, text, options });
      }
    }
    const deletions: number[] = [];
    if (Array.isArray(deleteItemIds)) {
      for (const rawId of deleteItemIds) {
        const item = editable(Number(rawId));
        if (!item) return res.status(400).json({ message: `Item ${rawId} cannot be deleted` });
        deletions.push(item.id);
      }
      const remainingHost = existing.filter((i) =>
        !i.isModuleItem && !i.isAttentionCheck && !deletions.includes(i.id),
      ).length;
      if (remainingHost < 1) {
        return res.status(400).json({ message: 'A poll needs at least one question besides the attention check' });
      }
    }

    for (const u of updates) {
      await db.update(surveyItems).set({ text: u.text, options: u.options }).where(eq(surveyItems.id, u.id));
    }
    if (deletions.length > 0) {
      await db.delete(surveyItems).where(inArray(surveyItems.id, deletions));
    }
    const pollPatch: Record<string, unknown> = {
      compilerMeta: { ...(poll.compilerMeta as object ?? {}), creatorEdited: true },
    };
    if (typeof title === 'string' && title.trim().length >= 5 && title.trim().length <= 200) {
      pollPatch.title = title.trim();
    }
    if (typeof topicTag === 'string' && topicTag.trim().length >= 2 && topicTag.trim().length <= 60) {
      pollPatch.topicTag = topicTag.trim();
    }
    const [updated] = await db.update(surveyPolls).set(pollPatch).where(eq(surveyPolls.id, id)).returning();

    const items = await db.select().from(surveyItems)
      .where(eq(surveyItems.pollId, id)).orderBy(asc(surveyItems.position));
    res.json({ poll: updated, items });
  });

  // Field a draft: inject the piggyback module, open the poll.
  app.post('/api/surveys/:id/field', requireAuth, async (req: any, res) => {
    const id = parseInt(req.params.id, 10);
    const poll = await loadPoll(id);
    if (!poll) return res.status(404).json({ message: 'Not found' });
    if (poll.creatorId !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ message: 'Only the creator can field this poll' });
    }
    if (poll.status !== 'draft') return res.status(409).json({ message: `Cannot field a ${poll.status} poll` });

    await materializeModuleItems(poll.id);
    const closesAt = req.body?.closesAt ? new Date(req.body.closesAt) : null;
    const [updated] = await db.update(surveyPolls).set({
      status: 'live',
      opensAt: new Date(),
      closesAt: closesAt && !isNaN(closesAt.getTime()) ? closesAt : null,
    }).where(eq(surveyPolls.id, poll.id)).returning();
    res.json({ poll: updated });
  });

  // Close: compute + store both cohorts, freeze the methodology block.
  app.post('/api/surveys/:id/close', requireAuth, async (req: any, res) => {
    const id = parseInt(req.params.id, 10);
    const poll = await loadPoll(id);
    if (!poll) return res.status(404).json({ message: 'Not found' });
    if (poll.creatorId !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ message: 'Only the creator can close this poll' });
    }
    if (poll.status !== 'live') return res.status(409).json({ message: `Cannot close a ${poll.status} poll` });

    const published = await computeAndStoreResults(poll, 'published');
    await computeAndStoreResults(poll, 'all');
    const methodology = buildMethodology(poll, published);
    const [updated] = await db.update(surveyPolls).set({
      status: 'closed',
      closedAt: new Date(),
      methodology,
    }).where(eq(surveyPolls.id, poll.id)).returning();
    res.json({ poll: updated, results: published });
  });

  // ════ Taking a poll (panel token) ════

  app.get('/api/surveys/:id/instrument', async (req, res) => {
    const panelist = await panelistFromRequest(req);
    if (!panelist) return res.status(401).json({ message: 'Panel enrollment required' });
    const id = parseInt(req.params.id, 10);
    const poll = await loadPoll(id);
    if (!poll || poll.status !== 'live') return res.status(404).json({ message: 'Poll is not live' });
    res.json(await buildInstrument(poll, panelist.id));
  });

  app.post('/api/surveys/:id/respond', async (req, res) => {
    const panelist = await panelistFromRequest(req);
    if (!panelist) return res.status(401).json({ message: 'Panel enrollment required' });
    const id = parseInt(req.params.id, 10);
    const poll = await loadPoll(id);
    if (!poll || poll.status !== 'live') return res.status(404).json({ message: 'Poll is not live' });
    const answers = Array.isArray(req.body?.answers) ? req.body.answers : null;
    if (!answers) return res.status(400).json({ message: 'answers[] required' });
    const result = await submitResponse(poll, panelist.id, answers);
    if (!result.ok) return res.status(result.status).json({ message: result.message });
    res.status(201).json({ qualityPassed: result.qualityPassed, claimCode: result.claimCode });
  });

  // Quality-gated Democracy Points claim. Authenticated (points need a
  // user), burns the one-time code. The identity side learns "user X
  // completed poll Y" — same class as the blind-sig issuance ledger.
  app.post('/api/surveys/:id/claim', requireAuth, async (req: any, res) => {
    const id = parseInt(req.params.id, 10);
    const code = req.body?.claimCode;
    if (typeof code !== 'string' || code.length > 100) {
      return res.status(400).json({ message: 'claimCode required' });
    }
    const codeHash = hashClaimCode(code);
    const [response] = await voteDb.select().from(surveyResponses)
      .where(and(eq(surveyResponses.pollId, id), eq(surveyResponses.claimCodeHash, codeHash)))
      .limit(1);
    if (!response || response.claimedAt) {
      return res.status(404).json({ message: 'Invalid or already-used claim code' });
    }
    await voteDb.update(surveyResponses).set({ claimedAt: new Date() })
      .where(eq(surveyResponses.id, response.id));
    const award = await awardPoints({
      userId: req.user.id,
      actionKey: 'survey_complete',
      refType: 'survey_poll',
      refId: id,
    });
    res.json({ award });
  });

  // ════ Results & methodology ════

  app.get('/api/surveys/:id/results', async (req: any, res) => {
    const id = parseInt(req.params.id, 10);
    const poll = await loadPoll(id);
    if (!poll) return res.status(404).json({ message: 'Not found' });
    const isCreator = req.user?.id != null && poll.creatorId === req.user.id;
    const isAdmin = !!req.user?.isAdmin;
    // Live results: creator/admin only (no mid-field public horse-race).
    if (poll.status === 'live' && !isCreator && !isAdmin) {
      return res.status(403).json({ message: 'Results are published when the poll closes' });
    }
    if (poll.status !== 'live' && poll.status !== 'closed') {
      return res.status(404).json({ message: 'No results' });
    }

    const results = poll.status === 'closed'
      ? await loadStoredResults(id)
      : await computeResults(poll, 'published');
    if (!results) return res.status(404).json({ message: 'No results' });

    // K-anonymity floor: below it, marginals are suppressed entirely.
    if (results.completes < K_ANONYMITY_FLOOR) {
      return res.json({
        poll: publicPoll(poll),
        suppressed: true,
        completes: results.completes,
        message: `Τα αποτελέσματα εμφανίζονται από ${K_ANONYMITY_FLOOR} συμμετοχές και πάνω.`,
      });
    }
    res.json({ poll: publicPoll(poll), suppressed: false, ...results });
  });

  app.get('/api/surveys/:id/methodology', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const poll = await loadPoll(id);
    if (!poll || poll.status !== 'closed' || !poll.methodology) {
      return res.status(404).json({ message: 'Methodology is published when the poll closes' });
    }
    res.json({ poll: publicPoll(poll), methodology: poll.methodology });
  });

  // ════ Certified tier + question bank (admin) ════

  // Create a certified poll from explicit items and/or question-bank codes.
  app.post('/api/admin/surveys', requireAdmin, async (req: any, res) => {
    const { title, topicTag, items: rawItems, bankCodes, targetN } = req.body ?? {};
    if (typeof title !== 'string' || title.length < 5 || typeof topicTag !== 'string') {
      return res.status(400).json({ message: 'title and topicTag required' });
    }

    const [poll] = await db.insert(surveyPolls).values({
      tier: 'certified',
      title,
      topicTag,
      status: 'draft',
      creatorId: req.user.id,
      targetN: Number.isInteger(targetN) ? targetN : null,
      compilerMeta: { generator: 'methodologist', reviewer: 'methodologist', model: null, generatorRounds: 0 },
    }).returning();

    let position = HOST_POSITION_BASE;
    // Bank-backed items: canonical wording, character-identical across waves.
    if (Array.isArray(bankCodes) && bankCodes.length > 0) {
      for (const code of bankCodes) {
        const [bank] = await db.select().from(questionBank)
          .where(and(eq(questionBank.code, String(code)), eq(questionBank.active, true)))
          .orderBy(desc(questionBank.version)).limit(1);
        if (!bank) return res.status(400).json({ message: `Unknown question bank code: ${code}` });
        await db.insert(surveyItems).values({
          pollId: poll.id,
          questionBankId: bank.id,
          position: position++,
          text: bank.text,
          itemType: bank.itemType,
          options: bank.options,
          randomizeOptions: bank.randomizeOptions,
          required: true,
        });
      }
    }
    if (Array.isArray(rawItems) && rawItems.length > 0) {
      const parsed = compiledSurveySchema.shape.items.safeParse(rawItems);
      if (!parsed.success) return res.status(400).json({ message: 'Invalid items: ' + parsed.error.issues.map(i => i.message).join('; ') });
      for (const item of parsed.data) {
        await db.insert(surveyItems).values({
          pollId: poll.id,
          position: position++,
          text: item.text,
          itemType: item.itemType,
          options: item.options ?? null,
          randomizeOptions: item.randomizeOptions,
          required: item.required,
        });
      }
    }

    const items = await db.select().from(surveyItems)
      .where(eq(surveyItems.pollId, poll.id)).orderBy(asc(surveyItems.position));
    if (items.length === 0) return res.status(400).json({ message: 'A poll needs at least one item (bankCodes or items)' });
    res.status(201).json({ poll, items });
  });

  // Question bank: list (admin) + add new item / new version of a code.
  app.get('/api/admin/question-bank', requireAdmin, async (_req, res) => {
    res.json(await db.select().from(questionBank).orderBy(asc(questionBank.code), desc(questionBank.version)));
  });

  app.post('/api/admin/question-bank', requireAdmin, async (req: any, res) => {
    const { code, text, itemType, options, randomizeOptions, category, benchmarkKey, populationValue } = req.body ?? {};
    if (typeof code !== 'string' || !/^[a-z0-9_]{2,60}$/.test(code) || typeof text !== 'string' || text.length < 5) {
      return res.status(400).json({ message: 'code (snake_case) and text required' });
    }
    // Wording changes are NEW VERSIONS, never edits — version = max+1.
    const existing = await db.select().from(questionBank)
      .where(eq(questionBank.code, code)).orderBy(desc(questionBank.version)).limit(1);
    const version = existing.length > 0 ? existing[0].version + 1 : 1;
    const [row] = await db.insert(questionBank).values({
      code, version, text,
      itemType: typeof itemType === 'string' ? itemType : 'single_choice',
      options: Array.isArray(options) ? options : null,
      randomizeOptions: !!randomizeOptions,
      category: typeof category === 'string' ? category : 'one_off',
      benchmarkKey: typeof benchmarkKey === 'string' ? benchmarkKey : null,
      populationValue: populationValue ?? null,
    }).returning();
    res.status(201).json(row);
  });

  // Tracker trend: every closed poll carrying any version of a bank code,
  // with the per-wave (raw + weighted) shares. Drift in WORDING is
  // impossible by construction; drift across versions is visible because
  // each wave reports its questionBank version.
  app.get('/api/admin/surveys/trends', requireAdmin, async (req: any, res) => {
    const code = String(req.query?.code ?? '');
    if (!code) return res.status(400).json({ message: 'code required' });
    const bankRows = await db.select().from(questionBank).where(eq(questionBank.code, code));
    if (bankRows.length === 0) return res.status(404).json({ message: 'Unknown code' });
    const bankIds = bankRows.map((b) => b.id);
    const versionById = new Map(bankRows.map((b) => [b.id, b.version]));

    const itemRows = await db.select().from(surveyItems).where(inArray(surveyItems.questionBankId, bankIds));
    const pollIds = [...new Set(itemRows.map((i) => i.pollId))];
    if (pollIds.length === 0) return res.json({ code, waves: [] });

    const polls = await db.select().from(surveyPolls)
      .where(and(inArray(surveyPolls.id, pollIds), eq(surveyPolls.status, 'closed')));
    const stored = await db.select().from(surveyResults)
      .where(and(inArray(surveyResults.pollId, polls.map((p) => p.id)), eq(surveyResults.cohort, 'published')));
    const resultByPoll = new Map(stored.map((r) => [r.pollId, r]));

    const waves = polls
      .map((p) => {
        const item = itemRows.find((i) => i.pollId === p.id)!;
        const result = resultByPoll.get(p.id);
        const marginal = (result?.raw as any[] | undefined)?.find((m) => m.itemId === item.id);
        return {
          pollId: p.id,
          tier: p.tier,
          fieldStart: p.opensAt,
          fieldEnd: p.closedAt,
          bankVersion: versionById.get(item.questionBankId!),
          completes: result?.completes ?? 0,
          options: marginal?.options ?? null,
          shares: marginal?.shares ?? null,
          weightedShares: marginal?.weightedShares ?? null,
          effectiveN: result?.effectiveN ?? null,
        };
      })
      .filter((w) => w.completes >= K_ANONYMITY_FLOOR)
      .sort((a, b) => new Date(a.fieldEnd ?? 0).getTime() - new Date(b.fieldEnd ?? 0).getTime());
    res.json({ code, waves });
  });
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function publicPoll(poll: SurveyPoll) {
  const { compilerMeta, gatekeeperVerdict, ...rest } = poll;
  return { ...rest, compilerMeta, gatekeeperVerdict }; // full transparency — nothing stripped today
}

async function loadStoredResults(pollId: number) {
  const [row] = await db.select().from(surveyResults)
    .where(and(eq(surveyResults.pollId, pollId), eq(surveyResults.cohort, 'published')))
    .limit(1);
  if (!row) return null;
  return {
    pollId,
    cohort: 'published' as const,
    completes: row.completes,
    qualityExcluded: (row.weightSummary as any)?.qualityExcluded ?? 0,
    marginals: row.raw as any[],
    weighting: {
      applied: row.weighted !== null,
      effectiveN: row.effectiveN ? Number(row.effectiveN) : null,
      designEffect: row.designEffect ? Number(row.designEffect) : null,
      variablesUsed: (row.weightingVars as string[] | null) ?? [],
      variablesDropped: [],
      trimmedCount: (row.weightSummary as any)?.trimmedCount ?? 0,
      engine: (row.weightSummary as any)?.engine ?? null,
    },
  };
}
