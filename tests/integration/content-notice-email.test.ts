import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ configured: vi.fn(), send: vi.fn(), select: vi.fn() }));
vi.mock('../../server/db', () => ({ db: { select: mocks.select } }));
vi.mock('../../server/utils/mailer', () => ({
  isMailConfigured: mocks.configured, sendMail: mocks.send, publicUrl: () => 'https://agoraxdemocracy.com',
  areNotificationEmailsEnabled: () => false,
}));
vi.mock('../../server/utils/job-queue', () => ({ enqueueJob: vi.fn() }));
import { sendContentNoticeEmail } from '../../server/utils/email-service';

beforeEach(() => {
  mocks.configured.mockReset().mockReturnValue(true);
  mocks.send.mockReset().mockResolvedValue({ ok: true });
  mocks.select.mockReset().mockReturnValue({ from: () => ({ where: async () => [{ id: 5, email: 'author@example.org', name: 'Author', locale: 'en' }] }) });
});
const reference = '53b45e00-81d7-408c-a62f-042c6ac338fa';

describe('transactional content-notice emails', () => {
  it('sends a receipt despite optional notifications being off, without complaint text or a tracking secret', async () => {
    expect(await sendContentNoticeEmail({ reference, kind: 'acknowledgement', email: 'reporter@example.org', locale: 'en' })).toBe('sent');
    const mail = mocks.send.mock.calls[0][0];
    expect(mail.text).toContain(reference); expect(mail.text).toContain('/report-content');
    expect(mail.text).toContain('awaits human review'); expect(mail.unsubscribeUrl).toBeUndefined();
    expect(mail).not.toHaveProperty('trackingToken');
  });
  it('keeps sensitive decision details behind the secret for an unverified reporter email', async () => {
    await sendContentNoticeEmail({ reference, kind: 'decision', email: 'reporter@example.org', locale: 'el',
      reason: 'A potentially sensitive reason', basis: 'Terms 8', measure: 'Hidden material' });
    const mail = mocks.send.mock.calls[0][0];
    expect(mail.text).toContain('κλειδί παρακολούθησης'); expect(mail.text).not.toContain('potentially sensitive');
    expect(mail.text).not.toContain('Hidden material');
  });
  it('sends escaped reason/basis to the existing affected member with an independent review route', async () => {
    await sendContentNoticeEmail({ reference, kind: 'affected_user', recipientUserId: 5, locale: 'el', contentUrl: '/communities/3/forum/7',
      outcome: 'action_taken', reason: '<script>unsafe</script>', basis: 'Terms & conditions', measure: 'Post hidden by administrator' });
    const mail = mocks.send.mock.calls[0][0];
    expect(mail.to).toBe('author@example.org'); expect(mail.html).toContain('&lt;script&gt;unsafe&lt;/script&gt;');
    expect(mail.html).not.toContain('<script>'); expect(mail.text).toContain('Terms & conditions');
    expect(mail.text).toContain(`relatedReference=${reference}`); expect(mail.text).toContain('contentUrl=%2Fcommunities');
    expect(mail.text).not.toContain('reporter@example.org');
  });
  it('reports unavailable configuration or an omitted child-safety contact without a send', async () => {
    mocks.configured.mockReturnValue(false);
    expect(await sendContentNoticeEmail({ reference, kind: 'acknowledgement', email: 'a@example.org', locale: 'el' })).toBe('unavailable');
    mocks.configured.mockReturnValue(true);
    expect(await sendContentNoticeEmail({ reference, kind: 'acknowledgement', locale: 'el' })).toBe('unavailable');
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('reports transport failure explicitly without throwing or pretending it was delivered', async () => {
    mocks.send.mockResolvedValue({ ok: false, reason: 'send_failed', error: 'mock failure' });
    expect(await sendContentNoticeEmail({ reference, kind: 'decision', email: 'a@example.org', locale: 'en' })).toBe('failed');
    mocks.send.mockRejectedValue(new Error('mock transport threw'));
    expect(await sendContentNoticeEmail({ reference, kind: 'decision', email: 'a@example.org', locale: 'en' })).toBe('failed');
  });
});
