import type { Express, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import {
  contentNoticeAdminDecisionSchema, contentNoticeLookupSchema, contentNoticeReviewSchema,
  contentNoticeSubmissionSchema, normalizeContentNoticeUrl, type ContentNoticeEmailStatus,
} from '../../shared/content-notices';
import type { ContentNoticeRecord } from '../../shared/schema';
import { requireAdmin } from '../auth';
import {
  contentNoticeRepo, ContentNoticeError, toPublicContentNotice,
  type ContentNoticeEmailAttempt, type ContentNoticeRepository,
} from '../storage/content-notices';
import { sendContentNoticeEmail } from '../utils/email-service';
import { logAdminAction } from '../utils/admin-audit';
import { logger } from '../utils/logger';

interface Dependencies {
  repository?: ContentNoticeRepository;
  sendEmail?: typeof sendContentNoticeEmail;
}
const NOT_FOUND = 'Notice not found or tracking key invalid';

export function registerContentNoticeRoutes(app: Express, dependencies: Dependencies = {}): void {
  app.use(['/api/content-notices', '/api/admin/content-notices'], (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  const repository = dependencies.repository ?? contentNoticeRepo;
  const sendEmail = dependencies.sendEmail ?? sendContentNoticeEmail;
  const limit = (windowMs: number, count: number) => rateLimit({ windowMs, limit: count, standardHeaders: 'draft-7',
    legacyHeaders: false, message: { message: 'Too many requests. Please try again later.' } });
  const submissionLimiter = limit(60 * 60_000, 6);
  const statusLimiter = limit(60_000, 60);
  const reviewLimiter = limit(60 * 60_000, 12);

  const handleError = (res: Response, error: unknown) => {
    if (error instanceof ContentNoticeError) return res.status(error.statusCode).json({ message: error.message });
    logger.error('[content-notices] request failed');
    return res.status(500).json({ message: 'Unable to process the notice. Please try again.' });
  };
  const validateReference = (req: Request) => contentNoticeLookupSchema.shape.reference.safeParse(req.params.reference);

  async function deliver(notice: ContentNoticeRecord, attempt: ContentNoticeEmailAttempt): Promise<ContentNoticeEmailStatus> {
    let status: ContentNoticeEmailStatus;
    try {
      status = await sendEmail({ reference: notice.reference, kind: attempt.kind, locale: notice.locale === 'en' ? 'en' : 'el',
        email: attempt.kind === 'affected_user' ? undefined : notice.email, recipientUserId: attempt.recipientUserId,
        contentUrl: attempt.kind === 'affected_user' ? notice.contentUrl : undefined, ...attempt.payload });
    } catch { status = 'failed'; }
    try { await repository.finishEmail(attempt, status); }
    catch {
      // Receipt/decision was already committed. Never lose its reference or
      // secret because SMTP or an attempt-status write failed afterwards.
      // The durable pending attempt lets an operator retry after five minutes.
      logger.error('[content-notices] email outcome could not be recorded');
      return 'failed';
    }
    return status;
  }

  // Global csrfMiddleware remains in force for every POST/PATCH here.
  app.post('/api/content-notices', submissionLimiter, async (req, res) => {
    const parsed = contentNoticeSubmissionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Check the notice fields', errors: parsed.error.flatten().fieldErrors });
    const contentUrl = normalizeContentNoticeUrl(parsed.data.contentUrl, process.env.APP_PUBLIC_URL || 'https://agoraxdemocracy.com');
    if (!contentUrl) return res.status(400).json({ message: 'Use a URL belonging to this platform' });
    try {
      const receipt = await repository.create({ ...parsed.data, contentUrl });
      const emailStatus = await deliver(receipt.notice, receipt.emailAttempt);
      return res.status(201).json({ reference: receipt.notice.reference, trackingToken: receipt.trackingToken, emailStatus });
    } catch (error) { return handleError(res, error); }
  });

  app.post('/api/content-notices/status', statusLimiter, async (req, res) => {
    const parsed = contentNoticeLookupSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Provide a valid reference and tracking key' });
    try {
      const notice = await repository.getVerified(parsed.data.reference, parsed.data.trackingToken);
      if (!notice) return res.status(404).json({ message: NOT_FOUND });
      res.setHeader('Cache-Control', 'no-store');
      return res.json(toPublicContentNotice(notice));
    } catch (error) { return handleError(res, error); }
  });

  app.post('/api/content-notices/review', reviewLimiter, async (req, res) => {
    const parsed = contentNoticeReviewSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Provide a valid reference, tracking key and explanation' });
    try {
      const notice = await repository.requestReview(parsed.data.reference, parsed.data.trackingToken, parsed.data.explanation);
      res.setHeader('Cache-Control', 'no-store');
      return res.json(toPublicContentNotice(notice));
    } catch (error) { return handleError(res, error); }
  });

  app.get('/api/admin/content-notices', requireAdmin, async (req, res) => {
    try {
      const requested = Number(req.query.limit ?? 50);
      const count = Number.isFinite(requested) ? Math.min(100, Math.max(1, Math.floor(requested))) : 50;
      const requestedOffset = Number(req.query.offset ?? 0);
      const offset = Number.isFinite(requestedOffset) ? Math.max(0, Math.floor(requestedOffset)) : 0;
      const result = await repository.list(count, offset);
      await logAdminAction({ adminId: req.user!.id, action: 'content_notice_list',
        details: { limit: count, offset }, requestId: (req as any).requestId });
      res.setHeader('Cache-Control', 'no-store');
      return res.json(result);
    } catch (error) { return handleError(res, error); }
  });

  app.patch('/api/admin/content-notices/:reference', requireAdmin, async (req, res) => {
    const reference = validateReference(req);
    const parsed = contentNoticeAdminDecisionSchema.safeParse(req.body);
    if (!reference.success || !parsed.success) return res.status(400).json({ message: 'Provide a reason, legal or terms basis, and a completed measure where applicable' });
    try {
      const adminId = req.user!.id;
      const result = await repository.review(reference.data, parsed.data, adminId);
      await logAdminAction({ adminId, action: 'content_notice_review', targetResource: `content_notice:${reference.data}`,
        details: { status: parsed.data.status }, requestId: (req as any).requestId });
      for (const attempt of result.emailAttempts) await deliver(result.notice, attempt);
      res.setHeader('Cache-Control', 'no-store');
      return res.json(await repository.getAdmin(reference.data));
    } catch (error) { return handleError(res, error); }
  });

  app.post('/api/admin/content-notices/:reference/retry-email', requireAdmin, async (req, res) => {
    const reference = validateReference(req);
    if (!reference.success) return res.status(400).json({ message: 'Invalid reference' });
    try {
      const adminId = req.user!.id;
      const retry = await repository.retryEmail(reference.data, adminId);
      await logAdminAction({ adminId, action: 'content_notice_retry_email', targetResource: `content_notice:${reference.data}`,
        details: { attemptId: retry.emailAttempt.id }, requestId: (req as any).requestId });
      await deliver(retry.notice, retry.emailAttempt);
      res.setHeader('Cache-Control', 'no-store');
      return res.json(await repository.getAdmin(reference.data));
    } catch (error) { return handleError(res, error); }
  });
}
