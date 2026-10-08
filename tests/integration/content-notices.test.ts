import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Express } from 'express';
import { contentNoticeSubmissionSchema, normalizeContentNoticeUrl } from '../../shared/content-notices';

const mocks = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn(), audit: vi.fn(), mail: vi.fn() }));
vi.mock('../../server/db', () => ({ pool: { query: mocks.query,
  connect: async () => ({ query: mocks.query, release: mocks.release }) }, db: {} }));
vi.mock('../../server/auth', () => ({ requireAdmin: (req: any, res: any, next: any) => {
  if (req.isAuthenticated() && req.user?.isAdmin) return next();
  return res.status(403).json({ message: 'Admin access required' });
} }));
vi.mock('../../server/utils/email-service', () => ({ sendContentNoticeEmail: mocks.mail }));
vi.mock('../../server/utils/admin-audit', () => ({ logAdminAction: mocks.audit }));
vi.mock('../../server/utils/logger', () => ({ logger: { error: vi.fn() } }));

import { registerContentNoticeRoutes } from '../../server/routers/content-notices';
import { ContentNoticeRepository, hashContentNoticeToken } from '../../server/storage/content-notices';
import { csrfMiddleware } from '../../server/utils/csrf';

const createdAt = new Date('2026-10-08T08:00:00Z');
const validBody = { contentUrl: '/communities/3/forum/7', name: 'Reporter', email: 'reporter@example.org',
  explanation: 'This notice explains the alleged illegal material precisely.', goodFaith: true, locale: 'en' };
let notices: Map<string, any>;
let events: any[];
let emails: any[];
let routes: Array<{ method: string; path: string; handlers: any[] }>;
let noStoreMiddleware: any;

// A small parameter-aware PostgreSQL double exercises the actual repository
// and route together, including writes/audit/locking, without a live database
// or SMTP connection. It does not replace the repository under test.
beforeEach(() => {
  notices = new Map(); events = []; emails = []; routes = [];
  mocks.query.mockReset(); mocks.audit.mockReset(); mocks.mail.mockReset();
  mocks.mail.mockResolvedValue('unavailable');
  mocks.query.mockImplementation(async (sql: string, params: any[] = []) => {
    const q = sql.replace(/\s+/g, ' ').trim();
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(q)) return { rows: [] };
    if (q.startsWith('INSERT INTO content_notices')) {
      const [reference, trackingTokenHash, contentUrl, name, email, explanation, category, locale, goodFaith, relatedReference] = params;
      const row = { reference, trackingTokenHash, contentUrl, name, email, explanation, category, locale, goodFaith,
        relatedReference, status: 'received', outcome: null, reason: null, basis: null, measure: null, affectedUserId: null,
        reviewedBy: null, decidedAt: null, emailStatus: 'unavailable', createdAt, updatedAt: createdAt };
      notices.set(reference, row); return { rows: [{ ...row }] };
    }
    if (q.startsWith('INSERT INTO content_notice_events')) {
      events.push({ id: events.length + 1, noticeReference: params[0], event: params[1], actorUserId: params[2], details: JSON.parse(params[3]), createdAt });
      return { rows: [] };
    }
    if (q.startsWith('INSERT INTO content_notice_emails')) {
      const row = { id: emails.length + 1, noticeReference: params[0], kind: params[1], recipientUserId: params[2],
        payload: JSON.parse(params[3]), status: 'pending', createdAt: new Date(), finishedAt: null };
      emails.push(row); return { rows: [{ ...row }] };
    }
    if (q.startsWith('UPDATE content_notices')) {
      const row = notices.get(params[0]);
      if (q.includes("email_status='failed'")) row.emailStatus = 'failed';
      else if (q.includes('email_status=$2')) row.emailStatus = params[1];
      else if (q.includes("status='decided'")) Object.assign(row, { status: 'decided', outcome: params[1], reason: params[2], basis: params[3],
        measure: params[4], affectedUserId: params[5], reviewedBy: params[6], decidedAt: createdAt, updatedAt: new Date() });
      else Object.assign(row, { status: 'under_review', updatedAt: new Date(), ...(params[1] ? { reviewedBy: params[1] } : {}) });
      return { rows: [{ ...row }] };
    }
    if (q.startsWith('UPDATE content_notice_emails')) {
      Object.assign(emails.find(row => row.id === params[0]), { status: params[1], finishedAt: new Date() });
      return { rows: [] };
    }
    if (q.includes('COUNT(*)')) return { rows: [{ total: notices.size, pending: [...notices.values()].filter(row => row.status !== 'decided').length }] };
    if (q.includes('FROM content_notice_events')) return { rows: events.filter(row => row.noticeReference === params[0]).map(row => ({ ...row })) };
    if (q.includes('FROM content_notice_emails')) {
      let rows = emails.filter(row => row.noticeReference === params[0]);
      if (q.includes("status<>'sent'")) {
        rows = rows.filter(row => row.status !== 'sent' && !emails.some(later => later.noticeReference === row.noticeReference && later.kind === row.kind && later.id > row.id));
        rows = rows.sort((a, b) => b.id - a.id).slice(0, 1);
      }
      return { rows: rows.map(row => ({ ...row })) };
    }
    if (q.includes('FROM content_notices')) {
      const rows = q.includes('WHERE reference=$1') ? (notices.has(params[0]) ? [notices.get(params[0])] : [])
        : [...notices.values()].slice(params[1] ?? 0, (params[1] ?? 0) + params[0]);
      return { rows: rows.map(row => ({ ...row })) };
    }
    if (q === 'SELECT id FROM users WHERE id=$1') return { rows: params[0] === 5 ? [{ id: 5 }] : [] };
    throw new Error(`Unhandled SQL in test: ${q}`);
  });
  const app = Object.fromEntries(['post', 'get', 'patch'].map(method => [method, (path: string, ...handlers: any[]) => {
    routes.push({ method, path, handlers });
  }])) as unknown as Express;
  app.use = ((_paths: unknown, handler: any) => { noStoreMiddleware = handler; }) as any;
  registerContentNoticeRoutes(app, { repository: new ContentNoticeRepository(), sendEmail: mocks.mail });
});

async function invoke(method: string, path: string, body?: unknown, user?: { id: number; isAdmin: boolean }, reference?: string, query = {}) {
  const route = routes.find(item => item.method === method && item.path === path)!;
  const req = { body, params: { reference }, query, user, isAuthenticated: () => !!user };
  const response: any = { statusCode: 200, body: undefined, headers: {}, status(code: number) { this.statusCode = code; return this; },
    json(value: unknown) { this.body = value; return this; }, setHeader(key: string, value: string) { this.headers[key] = value; } };
  noStoreMiddleware(req, response, () => {});
  // Rate middleware has its own library implementation. Invoke the route's
  // real authorization gate before the business handler on protected paths.
  if (path.startsWith('/api/admin/')) {
    let allowed = false; route.handlers[0](req, response, () => { allowed = true; });
    if (!allowed) return response;
  }
  await route.handlers.at(-1)(req, response);
  return response;
}
const submit = (body: unknown = validBody) => invoke('post', '/api/content-notices', body);

describe('public notice receipt and validation', () => {
  it('accepts a signed-out notice, commits its receipt and stores only a tracking hash', async () => {
    const response = await submit();
    expect(response.statusCode).toBe(201);
    expect(response.headers['Cache-Control']).toBe('no-store');
    expect(response.body.emailStatus).toBe('unavailable');
    expect(response.body.trackingToken).toMatch(/^[\w-]{43}$/);
    const saved = notices.get(response.body.reference);
    expect(saved.trackingTokenHash).toBe(hashContentNoticeToken(response.body.trackingToken));
    expect(JSON.stringify([...notices.values(), ...events, ...emails])).not.toContain(response.body.trackingToken);
    expect(events.map(event => event.event)).toEqual(['received', 'email_result']);
    expect(mocks.query.mock.calls.findIndex(([q]) => q === 'COMMIT')).toBeLessThan(mocks.query.mock.calls.findIndex(([q]) => String(q).startsWith('UPDATE content_notice_emails')));
  });
  it.each([{ ...validBody, goodFaith: false }, { ...validBody, email: '' }, { ...validBody, name: '' },
    { ...validBody, explanation: 'too short' }, { ...validBody, contentUrl: 'https://attacker.example/p' }])('rejects invalid notice %j before any write', async body => {
    expect((await submit(body)).statusCode).toBe(400); expect(notices.size).toBe(0); expect(mocks.mail).not.toHaveBeenCalled();
  });
  it('allows identity omission only for the child-sexual-abuse exception', async () => {
    const { email, name, ...body } = validBody;
    expect((await submit({ ...body, category: 'child_safety' })).statusCode).toBe(201);
    expect([...notices.values()][0].email).toBeNull();
    expect((await submit(body)).statusCode).toBe(400);
  });
  it('keeps the durable receipt usable when mail throws', async () => {
    mocks.mail.mockRejectedValue(new Error('mock SMTP failure'));
    const response = await submit();
    expect(response.statusCode).toBe(201); expect(response.body.emailStatus).toBe('failed');
    expect(notices.get(response.body.reference).emailStatus).toBe('failed');
    expect(emails[0].status).toBe('failed');
  });
  it('returns the saved reference/secret even if the email-outcome write fails', async () => {
    const query = mocks.query.getMockImplementation()!;
    mocks.query.mockImplementation((sql, params) => String(sql).startsWith('UPDATE content_notice_emails') ? Promise.reject(new Error('DB outcome failure')) : query(sql, params));
    const response = await submit();
    expect(response.statusCode).toBe(201); expect(response.body.emailStatus).toBe('failed');
    expect(notices.has(response.body.reference)).toBe(true); expect(emails[0].status).toBe('pending');
  });
  it('accepts a related reference without looking up or disclosing the original case', async () => {
    const response = await submit({ ...validBody, relatedReference: '53b45e00-81d7-408c-a62f-042c6ac338fa' });
    expect(response.statusCode).toBe(201);
    expect(mocks.query.mock.calls.some(([q]) => String(q).includes('WHERE reference=$1 FOR UPDATE'))).toBe(false);
  });
});

describe('private status and human review', () => {
  it('requires the separate secret and returns only the public allowlist', async () => {
    const receipt = (await submit()).body;
    const ok = await invoke('post', '/api/content-notices/status', receiptLookup(receipt));
    expect(Object.keys(ok.body).sort()).toEqual(['createdAt', 'emailStatus', 'reference', 'status', 'updatedAt']);
    expect(ok.headers['Cache-Control']).toBe('no-store');
    const wrong = await invoke('post', '/api/content-notices/status', { reference: receipt.reference, trackingToken: 'a'.repeat(43) });
    const unknown = await invoke('post', '/api/content-notices/status', { reference: '53b45e00-81d7-408c-a62f-042c6ac338fa', trackingToken: 'a'.repeat(43) });
    expect(wrong.statusCode).toBe(404); expect(wrong.body).toEqual(unknown.body);
  });
  it('rejects a review before decision, then reopens and appends its explanation without changing hosted content', async () => {
    const receipt = (await submit()).body;
    const review = { ...receiptLookup(receipt), explanation: 'Additional evidence asks the human reviewer to reconsider.' };
    expect((await invoke('post', '/api/content-notices/review', review)).statusCode).toBe(409);
    expect((await decide(receipt.reference)).statusCode).toBe(200);
    const reopened = await invoke('post', '/api/content-notices/review', review);
    expect(reopened.body.status).toBe('under_review'); expect(reopened.body.decision).toBeUndefined();
    expect(events.at(-1)).toMatchObject({ event: 'review_requested', actorUserId: null, details: { explanation: review.explanation } });
    expect(mocks.query.mock.calls.filter(([q]) => String(q).includes('FOR UPDATE')).length).toBeGreaterThan(1);
    expect(mocks.query.mock.calls.filter(([q]) => /UPDATE (community_posts|proposals|users)/.test(String(q)))).toHaveLength(0);
  });
});
const receiptLookup = (receipt: any) => ({ reference: receipt.reference, trackingToken: receipt.trackingToken });
const decision = { status: 'decided', outcome: 'no_action', reason: 'The available material does not establish an infringement.', basis: 'Terms of use section 8' };
const decide = (reference: string, body: unknown = decision) => invoke('patch', '/api/admin/content-notices/:reference', body, { id: 1, isAdmin: true }, reference);

describe('admin review and retries', () => {
  it.each([undefined, { id: 5, isAdmin: false }])('protects list, review and mail retry from non-admins', async user => {
    for (const [method, path] of [['get', '/api/admin/content-notices'], ['patch', '/api/admin/content-notices/:reference'], ['post', '/api/admin/content-notices/:reference/retry-email']]) {
      expect((await invoke(method, path, {}, user)).statusCode).toBe(403);
    }
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it('requires a completed measure and a reason/basis for action_taken', async () => {
    const receipt = (await submit()).body;
    expect((await decide(receipt.reference, { ...decision, outcome: 'action_taken' })).statusCode).toBe(400);
    expect(notices.get(receipt.reference).status).toBe('received');
    const result = await decide(receipt.reference, { ...decision, outcome: 'action_taken', measure: 'Hidden forum topic 7 using its existing moderation control.', affectedUserId: 5 });
    expect(result.body.decision.outcome).toBe('action_taken');
    expect(events.find(event => event.event === 'decided')).toMatchObject({ actorUserId: 1, details: { measure: expect.stringContaining('Hidden forum topic') } });
    const affectedMail = mocks.mail.mock.calls.find(([args]) => args.kind === 'affected_user')?.[0];
    expect(affectedMail).toMatchObject({ recipientUserId: 5, reason: decision.reason, basis: decision.basis });
    expect(affectedMail.email).toBeUndefined(); expect(JSON.stringify(affectedMail)).not.toContain(validBody.explanation);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'content_notice_review', adminId: 1 }));
  });
  it('rejects an unknown affected author before deciding', async () => {
    const receipt = (await submit()).body;
    expect((await decide(receipt.reference, { ...decision, affectedUserId: 999 })).statusCode).toBe(400);
    expect(notices.get(receipt.reference).status).toBe('received');
  });
  it('audits retry attempts and refuses a retry after successful delivery', async () => {
    const receipt = (await submit()).body;
    mocks.mail.mockResolvedValue('sent');
    const retry = await invoke('post', '/api/admin/content-notices/:reference/retry-email', {}, { id: 1, isAdmin: true }, receipt.reference);
    expect(retry.body.emailStatus).toBe('sent'); expect(emails).toHaveLength(2);
    expect(events.some(event => event.event === 'email_retry' && event.actorUserId === 1)).toBe(true);
    expect((await invoke('post', '/api/admin/content-notices/:reference/retry-email', {}, { id: 1, isAdmin: true }, receipt.reference)).statusCode).toBe(409);
  });
  it('does not issue a second delivery claim while a retry is pending', async () => {
    const receipt = (await submit()).body;
    const repository = new ContentNoticeRepository();
    const pending = await repository.retryEmail(receipt.reference, 1);
    expect(pending.emailAttempt.status).toBe('pending');
    expect(Math.abs(Date.now() - pending.emailAttempt.createdAt.getTime())).toBeLessThan(1000);
    await expect(repository.retryEmail(receipt.reference, 1)).rejects.toMatchObject({ statusCode: 409 });
    expect(emails).toHaveLength(2);
  });
  it('bounds and paginates the admin list while exposing full audited details only there', async () => {
    await submit(); await submit();
    const result = await invoke('get', '/api/admin/content-notices', {}, { id: 1, isAdmin: true }, undefined, { limit: '999', offset: '1' });
    expect(result.body.total).toBe(2); expect(result.body.pending).toBe(2); expect(result.body.notices).toHaveLength(1);
    expect(result.body.notices[0]).toMatchObject({ email: validBody.email, explanation: validBody.explanation, history: expect.any(Array) });
    expect(result.body.notices[0].trackingTokenHash).toBeUndefined();
    expect(mocks.query.mock.calls.some(([q, p]) => String(q).includes('LIMIT $1 OFFSET $2') && p[0] === 100 && p[1] === 1)).toBe(true);
  });
});

describe('locator, rate limit, CSRF and migration constraints', () => {
  it('enforces public rate limits independently while permitting more status lookups', async () => {
    const hit = async (path: string) => {
      const route = routes.find(item => item.method === 'post' && item.path === path)!;
      const req: any = { ip: '192.0.2.7', app: { get: () => false }, headers: {}, method: 'POST', originalUrl: path };
      const res: any = { statusCode: 200, headers: {}, headersSent: false, writableEnded: false,
        setHeader(name: string, value: string) { this.headers[name] = value; },
        status(code: number) { this.statusCode = code; return this; }, send: vi.fn() };
      const next = vi.fn();
      await route.handlers[0](req, res, next);
      return { res, next };
    };
    for (let index = 0; index < 6; index++) expect((await hit('/api/content-notices')).next).toHaveBeenCalledTimes(1);
    expect((await hit('/api/content-notices')).res.statusCode).toBe(429);
    for (let index = 0; index < 60; index++) expect((await hit('/api/content-notices/status')).next).toHaveBeenCalledTimes(1);
    expect((await hit('/api/content-notices/status')).res.statusCode).toBe(429);
    for (let index = 0; index < 12; index++) expect((await hit('/api/content-notices/review')).next).toHaveBeenCalledTimes(1);
    expect((await hit('/api/content-notices/review')).res.statusCode).toBe(429);
  });
  it.each(['//evil.example/p', '/\\evil.example/p', 'javascript:alert(1)', 'https://user:password@agoraxdemocracy.com/p',
    'https://agoraxdemocracy.com.evil.example/p', '/api/\nprivate', '/..//evil.example/p',
    'https://agoraxdemocracy.com//evil.example/p'])('rejects unsafe locator %s', value => {
    expect(normalizeContentNoticeUrl(value, 'https://agoraxdemocracy.com')).toBeNull();
  });
  it('normalizes only the configured origin without making a request', () => {
    expect(normalizeContentNoticeUrl('https://agoraxdemocracy.com/p?x=1#reply-8', 'https://agoraxdemocracy.com')).toBe('/p?x=1#reply-8');
    expect(contentNoticeSubmissionSchema.parse({ ...validBody, name: '  Reporter  ' }).name).toBe('Reporter');
  });
  it('leaves normal CSRF enforcement active for the unauthenticated route', () => {
    const req: any = { method: 'POST', path: '/api/content-notices', headers: {} };
    const res: any = { cookie: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn(); csrfMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403); expect(next).not.toHaveBeenCalled();
    req.headers = { cookie: `agorax_csrf=${'a'.repeat(64)}`, 'x-csrf-token': 'a'.repeat(64) };
    csrfMiddleware(req, res, next); expect(next).toHaveBeenCalledTimes(1);
  });
  it('registers a separate limiter on each public POST and schema constraints for completed measures', () => {
    const router = readFileSync(new URL('../../server/routers/content-notices.ts', import.meta.url), 'utf8');
    for (const limiter of ['submissionLimiter', 'statusLimiter', 'reviewLimiter']) expect(router).toMatch(new RegExp(`app\\.post\\('[^']+', ${limiter}`));
    const migration = readFileSync(new URL('../../migrations/0060_content_notices.sql', import.meta.url), 'utf8');
    expect(migration).toContain("CHECK (outcome IS DISTINCT FROM 'action_taken' OR (measure IS NOT NULL AND length(measure) >= 10))");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS content_notice_events');
    expect(migration).toContain('created_at timestamptz NOT NULL DEFAULT NOW()');
    expect(migration).not.toMatch(/\s(?:created_at|updated_at|decided_at|finished_at) timestamp[,\s]/);
    expect(router).not.toContain('EXEMPT_PATH');
  });
});
