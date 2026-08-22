/**
 * SMTP transport — the only place in AgoraX that opens a mail connection.
 *
 * Provider is Scaleway Transactional Email (smtp.tem.scaleway.com:587,
 * STARTTLS). Nothing else may send: everything goes through
 * server/utils/email-service.ts, which calls in here once it has decided
 * that a given message is allowed to go out at all.
 *
 * Env: SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_REQUIRE_TLS, SMTP_USER,
 * SMTP_PASS, MAIL_FROM, APP_PUBLIC_URL.
 *
 * If SMTP_HOST / SMTP_USER / SMTP_PASS are not all present, every send here
 * is a silent no-op that reports back as "not configured". That is what makes
 * the test suite safe — no test sets those variables, so no test can reach a
 * real mail server even by accident — and it matches how push-client.ts
 * degrades when VAPID is missing.
 *
 * Nothing in this file logs a recipient address, a subject, a body, or a
 * link. A reset token in a log file is a reset token in a backup.
 */

import nodemailer, { type Transporter } from 'nodemailer';
import { logger } from './logger';

export interface OutboundMail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /**
   * Optional-mail only. Sets List-Unsubscribe / List-Unsubscribe-Post so a
   * mail client can offer its own one-click unsubscribe. Deliberately absent
   * on security mail, which has nothing to unsubscribe from.
   */
  unsubscribeUrl?: string;
}

let transporter: Transporter | null = null;

export function isMailConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/**
 * Whether optional notification email may go out at all, deployment-wide.
 *
 * Separate from isMailConfigured() on purpose, and off unless explicitly set.
 *
 * Configuring SMTP has to make password reset and address confirmation work
 * immediately — those are the reason mail exists here. But the same switch
 * must not also open the notification fan-out, because the fan-out is
 * retroactive: the phase sweeps run on a timer over proposals that are
 * *already* in flight, so the first tick after enabling mail emits one
 * message per member per live proposal. Enabling SMTP on a dev box here did
 * exactly that — 79 messages in a single burst, from one proposal advancing.
 * On production that is one message per real member, for every community
 * with something in progress, in the first five seconds.
 *
 * So: SMTP on, notifications still silent. Then, deliberately, once the
 * volume has been looked at and the provider's quota can carry it,
 * EMAIL_NOTIFICATIONS_ENABLED=true.
 *
 * Security mail never consults this.
 */
export function areNotificationEmailsEnabled(): boolean {
  return isMailConfigured() && process.env.EMAIL_NOTIFICATIONS_ENABLED === 'true';
}

/** `AgoraX <no-reply@mail.agoraxdemocracy.com>` — the envelope and header From. */
export function mailFrom(): string {
  return process.env.MAIL_FROM || 'AgoraX <no-reply@mail.agoraxdemocracy.com>';
}

/**
 * Absolute base for every link in an email. Relative URLs are meaningless in
 * an inbox, and a link built from a request Host header is a redirect gadget
 * waiting to happen — mail links come from configuration only.
 */
export function publicUrl(): string {
  return (process.env.APP_PUBLIC_URL || 'https://agoraxdemocracy.com').replace(/\/+$/, '');
}

function getTransporter(): Transporter | null {
  if (!isMailConfigured()) return null;
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    // Port 587 is STARTTLS, not implicit TLS: secure=false with
    // requireTLS=true means "plain connect, then refuse to continue unless
    // the server upgrades". Setting secure=true here would try to speak TLS
    // at byte one and hang.
    secure: process.env.SMTP_SECURE === 'true',
    requireTLS: process.env.SMTP_REQUIRE_TLS !== 'false',
    auth: {
      user: process.env.SMTP_USER!,
      pass: process.env.SMTP_PASS!,
    },
    // The worker sends one message at a time off a 5s poll; a small pool
    // keeps the TLS handshake from being repaid on every notification.
    pool: true,
    maxConnections: 2,
    maxMessages: 50,
    // A hung mail server must not hold a worker slot indefinitely.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  return transporter;
}

export type SendResult =
  | { ok: true }
  | { ok: false; reason: 'not_configured' }
  | { ok: false; reason: 'send_failed'; error: string };

/**
 * Hand one message to the provider.
 *
 * Scaleway TEM does not rewrite links or embed open-tracking pixels, so there
 * is no per-message tracking to switch off. The guarantee AgoraX makes is
 * upstream of the provider anyway: reset and unsubscribe tokens only ever
 * appear in the link the member clicks, never in a log line, an analytics
 * event, or a redirect through a third party.
 */
export async function sendMail(mail: OutboundMail): Promise<SendResult> {
  const tx = getTransporter();
  if (!tx) return { ok: false, reason: 'not_configured' };

  const headers: Record<string, string> = {
    // Keep out-of-office replies and vacation autoresponders from bouncing
    // back at a no-reply address.
    'Auto-Submitted': 'auto-generated',
    'X-Auto-Response-Suppress': 'All',
  };

  if (mail.unsubscribeUrl) {
    headers['List-Unsubscribe'] = `<${mail.unsubscribeUrl}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }

  try {
    await tx.sendMail({
      from: mailFrom(),
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      headers,
    });
    return { ok: true };
  } catch (err: any) {
    // The message is the provider's ("Invalid login", "Mailbox unavailable").
    // Recipient, subject and body stay out of it.
    const error = err?.message ? String(err.message) : 'unknown SMTP error';
    logger.error('[mail] send failed', { error });
    return { ok: false, reason: 'send_failed', error };
  }
}

/** Test hook — drops the pooled transport so env changes take effect. */
export function resetTransportForTests(): void {
  try { transporter?.close(); } catch { /* nothing to close */ }
  transporter = null;
}
