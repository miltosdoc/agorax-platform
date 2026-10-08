import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../db';
import type { ContentNoticeRecord } from '../../shared/schema';
import type {
  ContentNoticeAdmin, ContentNoticeAdminDecision, ContentNoticeAdminList,
  ContentNoticeDecision, ContentNoticeEmailStatus, ContentNoticePublicStatus,
  ContentNoticeSubmission,
} from '../../shared/content-notices';

const columns = `reference, tracking_token_hash AS "trackingTokenHash", content_url AS "contentUrl",
  name, email, explanation, category, locale, good_faith AS "goodFaith", related_reference AS "relatedReference",
  status, outcome, reason, basis, measure, affected_user_id AS "affectedUserId", reviewed_by AS "reviewedBy",
  decided_at AS "decidedAt", email_status AS "emailStatus", created_at AS "createdAt", updated_at AS "updatedAt"`;
const iso = (value: Date | string) => value instanceof Date ? value.toISOString() : String(value);

export function hashContentNoticeToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
export function verifyContentNoticeToken(notice: ContentNoticeRecord | null, token: string): boolean {
  const candidate = Buffer.from(hashContentNoticeToken(token), 'hex');
  const stored = Buffer.from(notice?.trackingTokenHash ?? '0'.repeat(64), 'hex');
  return stored.length === candidate.length && timingSafeEqual(stored, candidate) && !!notice;
}
export function contentNoticeDecision(notice: ContentNoticeRecord): ContentNoticeDecision | undefined {
  if (!notice.outcome || !notice.reason || !notice.basis || !notice.decidedAt) return undefined;
  return { outcome: notice.outcome as ContentNoticeDecision['outcome'], reason: notice.reason, basis: notice.basis,
    measure: notice.measure, decidedAt: iso(notice.decidedAt) };
}
/** Explicit allowlist: neither reporter identity nor moderator data leaves this boundary. */
export function toPublicContentNotice(notice: ContentNoticeRecord): ContentNoticePublicStatus {
  return { reference: notice.reference, status: notice.status as ContentNoticePublicStatus['status'],
    createdAt: iso(notice.createdAt), updatedAt: iso(notice.updatedAt),
    ...(notice.status === 'decided' ? { decision: contentNoticeDecision(notice) } : {}),
    emailStatus: notice.emailStatus as ContentNoticeEmailStatus };
}

export class ContentNoticeError extends Error {
  constructor(public statusCode: number, message: string) { super(message); }
}
export interface ContentNoticeEmailAttempt {
  id: number;
  noticeReference: string;
  kind: 'acknowledgement' | 'decision' | 'affected_user';
  recipientUserId: number | null;
  payload: { outcome?: ContentNoticeDecision['outcome']; reason?: string; basis?: string; measure?: string | null };
  status: 'pending' | ContentNoticeEmailStatus;
  createdAt: Date;
  finishedAt: Date | null;
}
const emailColumns = `id, notice_reference AS "noticeReference", kind, recipient_user_id AS "recipientUserId",
  payload, status, created_at AS "createdAt", finished_at AS "finishedAt"`;

async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const value = await fn(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
async function event(client: PoolClient, reference: string, name: string, actor: number | null, details: Record<string, unknown> = {}) {
  await client.query('INSERT INTO content_notice_events (notice_reference,event,actor_user_id,details) VALUES ($1,$2,$3,$4)',
    [reference, name, actor, JSON.stringify(details)]);
}
async function emailAttempt(client: PoolClient, reference: string, kind: ContentNoticeEmailAttempt['kind'],
  userId: number | null = null, payload: ContentNoticeEmailAttempt['payload'] = {}): Promise<ContentNoticeEmailAttempt> {
  if (kind !== 'affected_user') await client.query("UPDATE content_notices SET email_status='failed' WHERE reference=$1", [reference]);
  const { rows } = await client.query<ContentNoticeEmailAttempt>(`INSERT INTO content_notice_emails
    (notice_reference,kind,recipient_user_id,payload) VALUES ($1,$2,$3,$4) RETURNING ${emailColumns}`,
  [reference, kind, userId, JSON.stringify(payload)]);
  return rows[0];
}

export class ContentNoticeRepository {
  async create(data: ContentNoticeSubmission): Promise<{ notice: ContentNoticeRecord; trackingToken: string; emailAttempt: ContentNoticeEmailAttempt }> {
    const reference = randomUUID();
    const trackingToken = randomBytes(32).toString('base64url');
    return transaction(async client => {
      const { rows } = await client.query<ContentNoticeRecord>(`INSERT INTO content_notices
        (reference,tracking_token_hash,content_url,name,email,explanation,category,locale,good_faith,related_reference)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${columns}`,
      [reference, hashContentNoticeToken(trackingToken), data.contentUrl, data.name ?? null, data.email ?? null,
        data.explanation, data.category, data.locale, data.goodFaith, data.relatedReference ?? null]);
      await event(client, reference, 'received', null);
      const attempt = await emailAttempt(client, reference, 'acknowledgement');
      return { notice: rows[0], trackingToken, emailAttempt: attempt };
    });
  }

  async getVerified(reference: string, token: string): Promise<ContentNoticeRecord | null> {
    const { rows } = await pool.query<ContentNoticeRecord>(`SELECT ${columns} FROM content_notices WHERE reference=$1`, [reference]);
    const notice = rows[0] ?? null;
    return verifyContentNoticeToken(notice, token) ? notice : null;
  }

  async requestReview(reference: string, token: string, explanation: string): Promise<ContentNoticeRecord> {
    return transaction(async client => {
      const { rows } = await client.query<ContentNoticeRecord>(`SELECT ${columns} FROM content_notices WHERE reference=$1 FOR UPDATE`, [reference]);
      const notice = rows[0] ?? null;
      if (!verifyContentNoticeToken(notice, token)) throw new ContentNoticeError(404, 'Notice not found or tracking key invalid');
      if (notice!.status !== 'decided') throw new ContentNoticeError(409, 'A review can be requested after a decision');
      const updated = await client.query<ContentNoticeRecord>(`UPDATE content_notices SET status='under_review',updated_at=NOW()
        WHERE reference=$1 RETURNING ${columns}`, [reference]);
      await event(client, reference, 'review_requested', null, { explanation });
      return updated.rows[0];
    });
  }

  async review(reference: string, decision: ContentNoticeAdminDecision, adminId: number): Promise<{ notice: ContentNoticeRecord; emailAttempts: ContentNoticeEmailAttempt[] }> {
    return transaction(async client => {
      const { rows } = await client.query<ContentNoticeRecord>(`SELECT ${columns} FROM content_notices WHERE reference=$1 FOR UPDATE`, [reference]);
      if (!rows[0]) throw new ContentNoticeError(404, 'Notice not found');
      if (decision.status === 'under_review') {
        const updated = await client.query<ContentNoticeRecord>(`UPDATE content_notices
          SET status='under_review',reviewed_by=$2,updated_at=NOW() WHERE reference=$1 RETURNING ${columns}`, [reference, adminId]);
        await event(client, reference, 'under_review', adminId);
        return { notice: updated.rows[0], emailAttempts: [] };
      }
      if (rows[0].status === 'decided') throw new ContentNoticeError(409, 'Reopen the notice before recording a new decision');
      if (decision.affectedUserId) {
        const user = await client.query('SELECT id FROM users WHERE id=$1', [decision.affectedUserId]);
        if (!user.rows[0]) throw new ContentNoticeError(400, 'Affected member does not exist');
      }
      // Recording a completed measure has no side effect on hosted content.
      const updated = await client.query<ContentNoticeRecord>(`UPDATE content_notices SET status='decided',outcome=$2,
        reason=$3,basis=$4,measure=$5,affected_user_id=$6,reviewed_by=$7,decided_at=NOW(),updated_at=NOW()
        WHERE reference=$1 RETURNING ${columns}`,
      [reference, decision.outcome, decision.reason, decision.basis, decision.measure ?? null, decision.affectedUserId ?? null, adminId]);
      const snapshot = { outcome: decision.outcome, reason: decision.reason, basis: decision.basis, measure: decision.measure ?? null };
      await event(client, reference, 'decided', adminId, snapshot);
      const attempts = [await emailAttempt(client, reference, 'decision', null, { outcome: decision.outcome })];
      if (decision.affectedUserId) attempts.push(await emailAttempt(client, reference, 'affected_user', decision.affectedUserId, snapshot));
      return { notice: updated.rows[0], emailAttempts: attempts };
    });
  }

  async finishEmail(attempt: ContentNoticeEmailAttempt, status: ContentNoticeEmailStatus): Promise<void> {
    await transaction(async client => {
      await client.query('UPDATE content_notice_emails SET status=$2,finished_at=NOW() WHERE id=$1', [attempt.id, status]);
      if (attempt.kind !== 'affected_user') {
        await client.query(`UPDATE content_notices SET email_status=$2 WHERE reference=$1 AND $3=(SELECT MAX(id)
          FROM content_notice_emails WHERE notice_reference=$1 AND kind<>'affected_user')`, [attempt.noticeReference, status, attempt.id]);
      }
      await event(client, attempt.noticeReference, 'email_result', null, { attemptId: attempt.id, kind: attempt.kind, status });
    });
  }

  async retryEmail(reference: string, adminId: number): Promise<{ notice: ContentNoticeRecord; emailAttempt: ContentNoticeEmailAttempt }> {
    return transaction(async client => {
      const { rows } = await client.query<ContentNoticeRecord>(`SELECT ${columns} FROM content_notices WHERE reference=$1 FOR UPDATE`, [reference]);
      if (!rows[0]) throw new ContentNoticeError(404, 'Notice not found');
      const latest = await client.query<ContentNoticeEmailAttempt>(`SELECT ${emailColumns} FROM content_notice_emails
        WHERE notice_reference=$1 AND id IN (SELECT MAX(id) FROM content_notice_emails WHERE notice_reference=$1 GROUP BY kind)
        AND status<>'sent' ORDER BY id DESC LIMIT 1 FOR UPDATE`, [reference]);
      const previous = latest.rows[0];
      if (!previous || previous.status === 'sent' || (previous.status === 'pending' && Date.now() - new Date(previous.createdAt).getTime() < 5 * 60_000)) {
        throw new ContentNoticeError(409, 'No failed or unavailable email to retry');
      }
      const attempt = await emailAttempt(client, reference, previous.kind, previous.recipientUserId, previous.payload);
      await event(client, reference, 'email_retry', adminId, { previousAttemptId: previous.id, attemptId: attempt.id, kind: attempt.kind });
      return { notice: rows[0], emailAttempt: attempt };
    });
  }

  async getAdmin(reference: string): Promise<ContentNoticeAdmin | null> {
    const { rows } = await pool.query<ContentNoticeRecord>(`SELECT ${columns} FROM content_notices WHERE reference=$1`, [reference]);
    return rows[0] ? this.decorateAdmin(rows[0]) : null;
  }

  private async decorateAdmin(notice: ContentNoticeRecord): Promise<ContentNoticeAdmin> {
    const [events, emails] = await Promise.all([
      pool.query(`SELECT id,event,actor_user_id AS "actorUserId",details,created_at AS "createdAt"
        FROM content_notice_events WHERE notice_reference=$1 ORDER BY id ASC`, [notice.reference]),
      pool.query<ContentNoticeEmailAttempt>(`SELECT ${emailColumns} FROM content_notice_emails WHERE notice_reference=$1 ORDER BY id ASC`, [notice.reference]),
    ]);
    return { ...toPublicContentNotice(notice), decision: contentNoticeDecision(notice), contentUrl: notice.contentUrl,
      name: notice.name, email: notice.email, explanation: notice.explanation, goodFaith: notice.goodFaith,
      category: notice.category as ContentNoticeAdmin['category'], locale: notice.locale as ContentNoticeAdmin['locale'],
      relatedReference: notice.relatedReference, affectedUserId: notice.affectedUserId, reviewedBy: notice.reviewedBy,
      history: events.rows.map(row => ({ ...row, createdAt: iso(row.createdAt) })),
      emailAttempts: emails.rows.map(row => ({ id: row.id, kind: row.kind, status: row.status,
        createdAt: iso(row.createdAt), finishedAt: row.finishedAt ? iso(row.finishedAt) : null })) };
  }

  async list(limit = 50, offset = 0): Promise<ContentNoticeAdminList> {
    const bounded = Math.min(100, Math.max(1, Math.floor(limit)));
    const [notices, counts] = await Promise.all([
      pool.query<ContentNoticeRecord>(`SELECT ${columns} FROM content_notices ORDER BY created_at DESC,reference DESC LIMIT $1 OFFSET $2`, [bounded, Math.max(0, Math.floor(offset))]),
      pool.query<{ total: number; pending: number }>(`SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status<>'decided')::int AS pending FROM content_notices`),
    ]);
    return { notices: await Promise.all(notices.rows.map(notice => this.decorateAdmin(notice))),
      total: counts.rows[0]?.total ?? 0, pending: counts.rows[0]?.pending ?? 0 };
  }
}
export const contentNoticeRepo = new ContentNoticeRepository();
