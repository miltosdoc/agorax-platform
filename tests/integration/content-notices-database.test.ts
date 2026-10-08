import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ContentNoticeRecord } from '../../shared/schema';
import type { ContentNoticeRepository } from '../../server/storage/content-notices';

// Opt-in against a disposable local DB with migration 0060 already applied.
// This suite never loads the mail service or sends messages.
const testUrl = process.env.CONTENT_NOTICE_TEST_DATABASE_URL;
let repository: ContentNoticeRepository;
let pool: typeof import('../../server/db')['pool'];
const references: string[] = [];

describe.skipIf(!testUrl)('content notices against PostgreSQL', () => {
  beforeAll(async () => {
    const parsed = new URL(testUrl!);
    if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || !/^\/agorax_notice_qa(?:_[a-z0-9_]+)?$/.test(parsed.pathname)) {
      throw new Error('Use a disposable local agorax_notice_qa database');
    }
    process.env.DATABASE_URL = testUrl!;
    ({ pool } = await import('../../server/db'));
    const { ContentNoticeRepository: Repository } = await import('../../server/storage/content-notices');
    repository = new Repository();
  });

  afterAll(async () => {
    if (!pool) return;
    if (references.length) {
      await pool.query('DELETE FROM content_notice_emails WHERE notice_reference=ANY($1::text[])', [references]);
      await pool.query('DELETE FROM content_notice_events WHERE notice_reference=ANY($1::text[])', [references]);
      await pool.query('DELETE FROM content_notices WHERE reference=ANY($1::text[])', [references]);
    }
    await pool.end();
  });

  async function create() {
    const receipt = await repository.create({ contentUrl: '/proposals/123#comment-456',
      name: 'QA reporter', email: 'reporter@example.test', explanation: 'Specific reasons for a local test notice.',
      goodFaith: true, locale: 'el', category: 'illegal_content' });
    references.push(receipt.notice.reference);
    return receipt;
  }

  it('persists a receipt and hash, and requires the separate secret for private tracking', async () => {
    const receipt = await create();
    expect(Math.abs(Date.now() - new Date(receipt.notice.createdAt).getTime())).toBeLessThan(5000);
    const stored = await pool.query<ContentNoticeRecord>('SELECT * FROM content_notices WHERE reference=$1', [receipt.notice.reference]);
    expect(JSON.stringify(stored.rows)).not.toContain(receipt.trackingToken);
    expect(stored.rows[0]).toHaveProperty('tracking_token_hash');
    expect(await repository.getVerified(receipt.notice.reference, receipt.trackingToken)).not.toBeNull();
    expect(await repository.getVerified(receipt.notice.reference, 'x'.repeat(43))).toBeNull();
    const { toPublicContentNotice } = await import('../../server/storage/content-notices');
    const visible = toPublicContentNotice(receipt.notice);
    expect(Object.keys(visible).sort()).toEqual(['createdAt', 'emailStatus', 'reference', 'status', 'updatedAt']);
    await expect(repository.requestReview(receipt.notice.reference, receipt.trackingToken, 'Additional specific grounds for review.')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('keeps the newest delivery state when an older SMTP attempt completes late', async () => {
    const receipt = await create();
    const decision = await repository.review(receipt.notice.reference, { status: 'decided', outcome: 'no_action',
      reason: 'This test item does not establish an infringement.', basis: 'Test review basis' }, 1);
    await repository.finishEmail(decision.emailAttempts[0], 'sent');
    await repository.finishEmail(receipt.emailAttempt, 'failed');
    expect((await repository.getVerified(receipt.notice.reference, receipt.trackingToken))?.emailStatus).toBe('sent');
  });

  it('serializes concurrent review requests and preserves the earlier decision in history', async () => {
    const receipt = await create();
    await repository.review(receipt.notice.reference, { status: 'decided', outcome: 'no_action',
      reason: 'The initial test assessment found no violation.', basis: 'Test assessment' }, 1);
    const requests = await Promise.allSettled([
      repository.requestReview(receipt.notice.reference, receipt.trackingToken, 'First additional explanation for human review.'),
      repository.requestReview(receipt.notice.reference, receipt.trackingToken, 'Second simultaneous explanation for human review.'),
    ]);
    expect(requests.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(requests.filter(result => result.status === 'rejected')).toHaveLength(1);
    const adminCase = await repository.getAdmin(receipt.notice.reference);
    expect(adminCase?.status).toBe('under_review');
    expect(adminCase?.history.filter(entry => entry.event === 'review_requested')).toHaveLength(1);
    expect(adminCase?.history.find(entry => entry.event === 'decided')?.details.reason).toContain('initial test assessment');
    await repository.review(receipt.notice.reference, { status: 'decided', outcome: 'action_taken',
      reason: 'Additional evidence established a test violation.', basis: 'Specific test basis',
      measure: 'A local test-only measure was already completed.', affectedUserId: 2 }, 1);
    const reviewed = await repository.getAdmin(receipt.notice.reference);
    expect(reviewed?.history.filter(entry => entry.event === 'decided')).toHaveLength(2);
    expect(reviewed?.emailAttempts.some(attempt => attempt.kind === 'affected_user')).toBe(true);
    await expect(pool.query('UPDATE content_notices SET measure=NULL WHERE reference=$1', [receipt.notice.reference])).rejects.toMatchObject({ code: '23514' });
  });

  it('retries a failed affected-author message even when the reporter message succeeded', async () => {
    const receipt = await create();
    const result = await repository.review(receipt.notice.reference, { status: 'decided', outcome: 'action_taken',
      reason: 'A specific test-only restriction was necessary.', basis: 'Test basis',
      measure: 'Completed test-only content restriction.', affectedUserId: 2 }, 1);
    await repository.finishEmail(result.emailAttempts[0], 'sent');
    await repository.finishEmail(result.emailAttempts[1], 'failed');
    const retry = await repository.retryEmail(receipt.notice.reference, 1);
    expect(retry.emailAttempt.kind).toBe('affected_user');
    expect(retry.emailAttempt.payload.reason).toContain('test-only restriction');
    expect(retry.emailAttempt.payload).not.toHaveProperty('trackingToken');
    await expect(repository.retryEmail(receipt.notice.reference, 1)).rejects.toMatchObject({ statusCode: 409 });
  });
});
