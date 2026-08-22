/**
 * The single point every outbound email passes through.
 *
 * Two doors in, one door out:
 *
 *   sendSecurityEmail()   — password reset, password changed, and anything
 *                           else a member must receive to keep control of
 *                           their account. Never consults preferences.
 *                           Sent in-process, off the request's critical path,
 *                           and never written to the jobs table (see below).
 *
 *   enqueueOptionalEmail() — everything a member may switch off. Goes on the
 *                           Postgres job queue; the worker re-checks
 *                           preferences at send time, not at enqueue time.
 *
 * Both end up in deliver(), which claims an idempotency row *before* the SMTP
 * call. That claim is what stops a retried job or two overlapping fan-outs
 * from mailing the same person twice.
 *
 * Why security mail skips the queue: a reset link contains the live token,
 * and the jobs table is jsonb on disk. Queueing it would put a working token
 * in the database in the clear — exactly what storing only the SHA-256 in
 * password_reset_tokens exists to prevent. So it is sent from memory, in the
 * background of the request that created it, and never persisted anywhere.
 * If the process dies mid-send the member simply asks again; the link they
 * did not receive expires by itself in 30 minutes.
 */

import { randomBytes } from 'node:crypto';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { emailNotificationPrefs, userConsents, users } from '@shared/schema';
import {
  EMAIL_CATEGORY_KEYS,
  isCategoryEnabled,
  isEmailCategoryKey,
  type EmailCategoryKey,
  type EmailCategoryMap,
} from '@shared/email-categories';
import {
  areNotificationEmailsEnabled,
  isMailConfigured,
  publicUrl,
  sendMail,
} from './mailer';
import {
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from './email-tokens';
import {
  communityProposalEmail,
  normalizeLocale,
  passwordChangedEmail,
  passwordResetEmail,
  googleAccountEmail,
  proposalUpdateEmail,
  verifyEmailEmail,
  votingEmail,
  type MailLocale,
  type RenderedMail,
} from './email-templates';
import { enqueueJob } from './job-queue';
import { logger } from './logger';

export {
  hmacIdentifier,
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from './email-tokens';

// ─── Preferences ────────────────────────────────────────────────────────────

export interface ResolvedPrefs {
  userId: number;
  masterEnabled: boolean;
  categories: EmailCategoryMap;
  unsubscribeId: string;
}

function coerceCategories(value: unknown): EmailCategoryMap {
  const out: EmailCategoryMap = {};
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isEmailCategoryKey(k) && typeof v === 'boolean') out[k] = v;
    }
  }
  return out;
}

/**
 * Read a member's preferences, creating the default row on first sight.
 * Members who registered before this feature existed have no row; the
 * defaults in shared/email-categories.ts decide what they get until they
 * open the settings page.
 */
export async function getOrCreateEmailPrefs(userId: number): Promise<ResolvedPrefs> {
  const [existing] = await db
    .select()
    .from(emailNotificationPrefs)
    .where(eq(emailNotificationPrefs.userId, userId));

  if (existing) {
    return {
      userId,
      masterEnabled: existing.masterEnabled,
      categories: coerceCategories(existing.categories),
      unsubscribeId: existing.unsubscribeId,
    };
  }

  const unsubscribeId = randomBytes(24).toString('base64url');
  await db
    .insert(emailNotificationPrefs)
    .values({ userId, unsubscribeId })
    .onConflictDoNothing();

  // Lost the insert race — read back whatever landed.
  const [row] = await db
    .select()
    .from(emailNotificationPrefs)
    .where(eq(emailNotificationPrefs.userId, userId));

  return {
    userId,
    masterEnabled: row?.masterEnabled ?? true,
    categories: coerceCategories(row?.categories),
    unsubscribeId: row?.unsubscribeId ?? unsubscribeId,
  };
}

export async function updateEmailPrefs(
  userId: number,
  updates: { masterEnabled?: boolean; categories?: EmailCategoryMap },
): Promise<ResolvedPrefs> {
  const current = await getOrCreateEmailPrefs(userId);

  const nextCategories: EmailCategoryMap = { ...current.categories };
  for (const key of EMAIL_CATEGORY_KEYS) {
    const incoming = updates.categories?.[key];
    if (typeof incoming === 'boolean') nextCategories[key] = incoming;
  }

  await db
    .update(emailNotificationPrefs)
    .set({
      masterEnabled: updates.masterEnabled ?? current.masterEnabled,
      categories: nextCategories,
      updatedAt: new Date(),
    })
    .where(eq(emailNotificationPrefs.userId, userId));

  return getOrCreateEmailPrefs(userId);
}

/** Turn every optional email off for the member behind an unsubscribe token. */
export async function unsubscribeAllByToken(token: unknown): Promise<boolean> {
  const id = verifyUnsubscribeToken(token);
  if (!id) return false;

  const updated = await db
    .update(emailNotificationPrefs)
    .set({ masterEnabled: false, updatedAt: new Date() })
    .where(eq(emailNotificationPrefs.unsubscribeId, id))
    .returning({ userId: emailNotificationPrefs.userId });

  return updated.length > 0;
}

export function unsubscribeUrlFor(unsubscribeId: string): string {
  return `${publicUrl()}/unsubscribe?t=${encodeURIComponent(signUnsubscribeToken(unsubscribeId))}`;
}

export function notificationSettingsUrl(): string {
  return `${publicUrl()}/notifications/settings`;
}

// ─── Recipient ──────────────────────────────────────────────────────────────

interface Recipient {
  userId: number;
  email: string;
  name: string;
  locale: MailLocale;
}

/**
 * The address is read here, at send time, and never carried in a job payload —
 * so a member who deleted their account between enqueue and send gets nothing,
 * and the queue never holds a copy of anyone's address.
 *
 * Language is the member's own setting. The consent row's locale is only a
 * fallback for accounts that predate the `users.locale` column: it records
 * which legal text someone was shown once, which is weaker evidence of how
 * they want to be addressed, but it is better than defaulting a known English
 * speaker to Greek.
 */
async function loadRecipient(userId: number): Promise<Recipient | null> {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      locale: users.locale,
    })
    .from(users)
    .where(eq(users.id, userId));

  if (!user?.email) return null;

  let locale = user.locale;
  if (!locale) {
    const [consent] = await db
      .select({ locale: userConsents.locale })
      .from(userConsents)
      .where(eq(userConsents.userId, userId))
      .orderBy(desc(userConsents.acceptedAt))
      .limit(1);
    locale = consent?.locale ?? null as any;
  }

  return {
    userId,
    email: user.email,
    name: user.name || user.email.split('@')[0],
    locale: normalizeLocale(locale),
  };
}

// ─── Idempotency ────────────────────────────────────────────────────────────

type ClaimResult = 'claimed' | 'already_handled';

/**
 * Take the delivery slot for this key, or report that someone else has it.
 *
 * A row in 'queued' is a lease: if a process died mid-send it would otherwise
 * block the key forever, so a claim older than fifteen minutes can be taken
 * over and its clock reset. 'sent' and 'suppressed' are final — a retry must
 * not re-decide a suppression and mail someone who opted out.
 */
async function claimDelivery(
  idempotencyKey: string,
  userId: number | null,
  template: string,
): Promise<ClaimResult> {
  const claimed = await db.execute(sql`
    INSERT INTO email_deliveries (idempotency_key, user_id, template, status)
    VALUES (${idempotencyKey}, ${userId}, ${template}, 'queued')
    ON CONFLICT (idempotency_key) DO UPDATE
      SET status = 'queued', error = NULL, created_at = NOW()
      WHERE email_deliveries.status = 'failed'
         OR (email_deliveries.status = 'queued'
             AND email_deliveries.created_at < NOW() - INTERVAL '15 minutes')
    RETURNING id
  `);
  return claimed.rows.length > 0 ? 'claimed' : 'already_handled';
}

async function finishDelivery(
  idempotencyKey: string,
  status: 'sent' | 'failed' | 'suppressed',
  error?: string,
): Promise<void> {
  await db.execute(sql`
    UPDATE email_deliveries
    SET status = ${status},
        error = ${error ?? null},
        sent_at = ${status === 'sent' ? sql`NOW()` : sql`NULL`}
    WHERE idempotency_key = ${idempotencyKey}
  `);
}

// ─── The one exit ───────────────────────────────────────────────────────────

interface DeliverArgs {
  idempotencyKey: string;
  userId: number | null;
  template: string;
  to: string;
  rendered: RenderedMail;
  unsubscribeUrl?: string;
}

async function deliver(args: DeliverArgs): Promise<void> {
  const claim = await claimDelivery(args.idempotencyKey, args.userId, args.template);
  if (claim === 'already_handled') return;

  const result = await sendMail({
    to: args.to,
    subject: args.rendered.subject,
    html: args.rendered.html,
    text: args.rendered.text,
    unsubscribeUrl: args.unsubscribeUrl,
  });

  if (result.ok) {
    await finishDelivery(args.idempotencyKey, 'sent');
    return;
  }

  if (result.reason === 'not_configured') {
    // No SMTP on this deployment (or in the test suite). Record it and stop —
    // retrying costs nothing but noise, and nothing is going to change until
    // an operator sets the variables.
    await finishDelivery(args.idempotencyKey, 'failed', 'smtp_not_configured');
    return;
  }

  await finishDelivery(args.idempotencyKey, 'failed', result.error);
  throw new Error(`email send failed: ${result.error}`);
}

// ─── Security mail ──────────────────────────────────────────────────────────

export type SecurityTemplate =
  | 'password_reset'
  | 'password_changed'
  | 'email_verification'
  | 'google_account';

interface SecurityMailArgs {
  userId: number;
  template: SecurityTemplate;
  idempotencyKey: string;
  /** Only for password_reset. Never logged, never persisted. */
  resetUrl?: string;
  expiresInMinutes?: number;
  changedAt?: Date;
  /** Only for email_verification. Same rule: never logged, never persisted. */
  verifyUrl?: string;
  expiresInHours?: number;
}

/**
 * Send a message the member cannot switch off. Awaited by callers that want
 * the result (tests); production callers fire it with `void` so the HTTP
 * response does not wait on SMTP.
 */
export async function sendSecurityEmail(args: SecurityMailArgs): Promise<void> {
  const recipient = await loadRecipient(args.userId);
  if (!recipient) return;

  let rendered: RenderedMail;
  if (args.template === 'password_reset') {
    if (!args.resetUrl) throw new Error('password_reset requires a resetUrl');
    rendered = passwordResetEmail({
      locale: recipient.locale,
      name: recipient.name,
      resetUrl: args.resetUrl,
      expiresInMinutes: args.expiresInMinutes ?? 30,
    });
  } else if (args.template === 'google_account') {
    rendered = googleAccountEmail({
      locale: recipient.locale,
      name: recipient.name,
      loginUrl: `${publicUrl()}/auth`,
    });
  } else if (args.template === 'email_verification') {
    if (!args.verifyUrl) throw new Error('email_verification requires a verifyUrl');
    rendered = verifyEmailEmail({
      locale: recipient.locale,
      name: recipient.name,
      verifyUrl: args.verifyUrl,
      expiresInHours: args.expiresInHours ?? 168,
    });
  } else {
    rendered = passwordChangedEmail({
      locale: recipient.locale,
      name: recipient.name,
      changedAt: args.changedAt ?? new Date(),
    });
  }

  // No unsubscribeUrl: security mail carries no List-Unsubscribe, because
  // there is nothing here to unsubscribe from.
  await deliver({
    idempotencyKey: args.idempotencyKey,
    userId: args.userId,
    template: args.template,
    to: recipient.email,
    rendered,
  });
}

/** Fire-and-forget wrapper for request handlers. Swallows, never logs bodies. */
export function sendSecurityEmailInBackground(args: SecurityMailArgs): void {
  void sendSecurityEmail(args).catch((err) => {
    logger.error('[mail] security email failed', {
      template: args.template,
      error: err?.message ? String(err.message) : 'unknown',
    });
  });
}

// ─── Optional mail ──────────────────────────────────────────────────────────

export type OptionalTemplate =
  | 'community_proposal'
  | 'voting_open'
  | 'proposal_update';

export interface OptionalEmailJob {
  userId: number;
  template: OptionalTemplate;
  category: EmailCategoryKey;
  idempotencyKey: string;
  subjectLine: string;
  actionPath: string;
  communityName?: string;
  updateLine?: string;
}

/**
 * Put an optional email on the queue. Nothing is decided here — not whether
 * the member wants it, not what their address is. Both are read in
 * deliverOptionalEmail() when the worker picks the job up, so a preference
 * changed in the meantime is the one that counts.
 */
export async function enqueueOptionalEmail(job: OptionalEmailJob): Promise<void> {
  // Checked here as well as in the worker: an unqueued job cannot be drained
  // later by accident when the flag flips, which is the whole point of the
  // flag. A queue full of yesterday's notifications waiting for someone to
  // enable email is the flood, just deferred.
  if (!areNotificationEmailsEnabled()) return;
  await enqueueJob({ type: 'send_email', data: job as any, priority: 'low' });
}

/** Worker side. Called only from the `send_email` job handler. */
export async function deliverOptionalEmail(job: OptionalEmailJob): Promise<void> {
  // Belt and braces: a job queued before the flag was turned off must not go
  // out after it.
  if (!areNotificationEmailsEnabled()) return;

  const prefs = await getOrCreateEmailPrefs(job.userId);

  // Checked here, at send time — not at enqueue time, and never after the
  // message has gone out.
  if (!isCategoryEnabled(prefs, job.category)) {
    await claimDelivery(job.idempotencyKey, job.userId, job.template);
    await finishDelivery(job.idempotencyKey, 'suppressed', 'opted_out');
    return;
  }

  const recipient = await loadRecipient(job.userId);
  if (!recipient) return;

  const unsubscribeUrl = unsubscribeUrlFor(prefs.unsubscribeId);
  const common = {
    locale: recipient.locale,
    name: recipient.name,
    subjectLine: job.subjectLine,
    communityName: job.communityName,
    actionUrl: `${publicUrl()}${job.actionPath}`,
    settingsUrl: notificationSettingsUrl(),
    unsubscribeUrl,
  };

  let rendered: RenderedMail;
  switch (job.template) {
    case 'community_proposal':
      rendered = communityProposalEmail(common);
      break;
    case 'voting_open':
      rendered = votingEmail(common);
      break;
    case 'proposal_update':
      rendered = proposalUpdateEmail({ ...common, updateLine: job.updateLine ?? '' });
      break;
    default:
      return;
  }

  await deliver({
    idempotencyKey: job.idempotencyKey,
    userId: job.userId,
    template: job.template,
    to: recipient.email,
    rendered,
    unsubscribeUrl,
  });
}

// ─── Housekeeping ───────────────────────────────────────────────────────────

const DELIVERY_RETENTION_DAYS = 30;

/** Called from the existing cleanup_expired sweep. */
export async function cleanupEmailDeliveries(): Promise<number> {
  const deleted = await db.execute(sql`
    DELETE FROM email_deliveries
    WHERE created_at < NOW() - (${DELIVERY_RETENTION_DAYS} || ' days')::interval
    RETURNING id
  `);
  return deleted.rows.length;
}
