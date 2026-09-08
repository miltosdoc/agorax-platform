/**
 * Newsletter mail.
 *
 * Kept out of email-service.ts because everything there is addressed to a
 * *user row* — it loads the recipient by userId and honours their preferences.
 * A newsletter subscriber may have no account at all, so this path goes
 * straight to the mailer with an address and a token.
 *
 * The confirmation is transactional, not promotional: it is the direct answer
 * to someone pressing a button, so it rides the same SMTP switch as password
 * resets rather than EMAIL_NOTIFICATIONS_ENABLED. Nothing else is ever sent to
 * an unconfirmed address.
 */

import { sendMail, publicUrl, isMailConfigured } from './mailer';
import { newsletterConfirmEmail, normalizeLocale } from './email-templates';
import { logger } from './logger';

export async function sendNewsletterConfirmation(
  email: string,
  token: string,
  locale: string,
): Promise<void> {
  if (!isMailConfigured()) {
    // Local development without SMTP: say so once, loudly enough to explain
    // why no mail arrived, without printing the token — it is a credential.
    logger.warn('[newsletter] SMTP not configured; confirmation not sent');
    return;
  }

  const confirmUrl = `${publicUrl()}/newsletter/confirm?token=${encodeURIComponent(token)}`;
  const rendered = newsletterConfirmEmail({
    locale: normalizeLocale(locale),
    confirmUrl,
  });

  const result = await sendMail({
    to: email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });

  if (!result.ok) {
    logger.error('[newsletter] confirmation failed', { reason: result.reason });
  }
}
