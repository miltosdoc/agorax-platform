/**
 * Email notification preferences, and the one-click unsubscribe behind them.
 *
 * Two audiences, two auth models:
 *
 *  /api/email-preferences  — the signed-in member, full read/write.
 *  /api/unsubscribe        — whoever holds a signed link from an email.
 *                            No session. Can do exactly one thing: switch the
 *                            master switch off. It cannot read the address it
 *                            belongs to, cannot sign anyone in, and cannot
 *                            touch anything else on the account.
 */

import type { Express } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth';
import {
  getOrCreateEmailPrefs,
  unsubscribeAllByToken,
  updateEmailPrefs,
  verifyUnsubscribeToken,
} from '../utils/email-service';
import { areNotificationEmailsEnabled } from '../utils/mailer';
import {
  EMAIL_CATEGORIES,
  EMAIL_CATEGORY_KEYS,
  categoryDefault,
  type EmailCategoryKey,
} from '@shared/email-categories';

const updateSchema = z.object({
  masterEnabled: z.boolean().optional(),
  categories: z
    .record(z.enum(EMAIL_CATEGORY_KEYS as [EmailCategoryKey, ...EmailCategoryKey[]]), z.boolean())
    .optional(),
});

export function registerEmailPrefsRoutes(app: Express): void {

  /**
   * The catalogue plus this member's answers, resolved.
   *
   * `enabled` is what the send path would actually decide right now — the
   * master switch already folded in — so the UI never has to re-implement
   * the precedence rule and drift from the server.
   */
  app.get('/api/email-preferences', requireAuth, async (req, res) => {
    try {
      const prefs = await getOrCreateEmailPrefs(req.user!.id);
      res.json({
        masterEnabled: prefs.masterEnabled,
        // Whether optional email can actually go out on this deployment —
        // SMTP configured *and* the notification fan-out enabled. The page
        // says so plainly rather than letting someone switch categories on
        // and wonder why nothing ever arrives.
        mailConfigured: areNotificationEmailsEnabled(),
        categories: EMAIL_CATEGORIES.map((def) => ({
          key: def.key,
          labelKey: def.labelKey,
          descriptionKey: def.descriptionKey,
          enabled: prefs.categories[def.key] ?? categoryDefault(def.key),
        })),
      });
    } catch (error) {
      res.status(500).json({ message: 'Δεν ήταν δυνατή η ανάκτηση των ρυθμίσεων ειδοποιήσεων' });
    }
  });

  app.put('/api/email-preferences', requireAuth, async (req, res) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Μη έγκυρες ρυθμίσεις ειδοποιήσεων' });
    }

    try {
      const prefs = await updateEmailPrefs(req.user!.id, parsed.data);
      res.json({
        masterEnabled: prefs.masterEnabled,
        mailConfigured: areNotificationEmailsEnabled(),
        categories: EMAIL_CATEGORIES.map((def) => ({
          key: def.key,
          labelKey: def.labelKey,
          descriptionKey: def.descriptionKey,
          enabled: prefs.categories[def.key] ?? categoryDefault(def.key),
        })),
      });
    } catch (error) {
      res.status(500).json({ message: 'Δεν ήταν δυνατή η αποθήκευση των ρυθμίσεων' });
    }
  });

  /**
   * Does this link still mean anything? Lets the landing page show a
   * confirm button instead of a dead end — and answers only yes/no, never
   * whose link it is.
   */
  app.get('/api/unsubscribe', async (req, res) => {
    const id = verifyUnsubscribeToken(req.query.t);
    res.json({ valid: !!id });
  });

  /**
   * Switch every optional email off.
   *
   * Idempotent, and deliberately answers the same way for a valid link
   * whose row is already unsubscribed as for one that was just switched
   * off — the member's question is "will this stop", not "was I already
   * stopped". Only a signature that does not verify gets a 400.
   *
   * CSRF-exempt: a mail client acting on List-Unsubscribe-Post cannot send
   * our header. The signed token is the authorisation, and the single thing
   * it authorises is turning mail off — the worst a forged request could do
   * is stop email the holder of the link was already receiving.
   */
  app.post('/api/unsubscribe', async (req, res) => {
    const token = req.body?.token ?? req.query.t;
    if (!verifyUnsubscribeToken(token)) {
      return res.status(400).json({ ok: false, message: 'Ο σύνδεσμος δεν είναι έγκυρος.' });
    }
    try {
      await unsubscribeAllByToken(token);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ ok: false, message: 'Η ενέργεια απέτυχε. Δοκιμάστε ξανά.' });
    }
  });
}
