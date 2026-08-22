/**
 * Optional-email preferences, the unsubscribe link, and the line between
 * mail a member may switch off and mail they may not.
 *
 * The resolution rules and the token are pure, so they are exercised
 * directly. Where the guarantee lives in the wiring — preferences read at
 * send time rather than after the fact, security mail never consulting them
 * at all — the source is pinned instead.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  EMAIL_CATEGORIES,
  EMAIL_CATEGORY_KEYS,
  categoryDefault,
  emailCategoryForNotification,
  isCategoryEnabled,
  isEmailCategoryKey,
  type EmailCategoryKey,
} from '../../shared/email-categories';

const root = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const service = read('server/utils/email-service.ts');
const tokens = read('server/utils/email-tokens.ts');
const router = read('server/routers/email-prefs.ts');
const templates = read('server/utils/email-templates.ts');
const notifications = read('server/utils/notifications.ts');
const migration = read('migrations/0043_email_notification_prefs.sql');
const settingsPage = read('client/src/pages/notification-settings.tsx');
const el = read('client/src/locales/el.ts');
const en = read('client/src/locales/en.ts');

const ALL_ON = Object.fromEntries(EMAIL_CATEGORY_KEYS.map((k) => [k, true]));
const ALL_OFF = Object.fromEntries(EMAIL_CATEGORY_KEYS.map((k) => [k, false]));

// ─── The catalogue ──────────────────────────────────────────────────────────

describe('category catalogue', () => {
  it('ships the three categories the platform promises', () => {
    expect([...EMAIL_CATEGORY_KEYS].sort()).toEqual([
      'community_proposals',
      'followed_proposals',
      'votes_and_polls',
    ]);
  });

  it('gives every category both an el and an en string', () => {
    for (const def of EMAIL_CATEGORIES) {
      for (const key of [def.labelKey, def.descriptionKey]) {
        expect(el, `${key} missing from el`).toContain(`'${key}'`);
        expect(en, `${key} missing from en`).toContain(`'${key}'`);
      }
    }
  });

  it('rejects a key that is not in the catalogue', () => {
    expect(isEmailCategoryKey('community_proposals')).toBe(true);
    expect(isEmailCategoryKey('anything_else')).toBe(false);
    expect(isEmailCategoryKey(null)).toBe(false);
  });
});

// ─── Master switch ──────────────────────────────────────────────────────────

describe('master switch', () => {
  it('sends nothing at all when it is off, whatever the categories say', () => {
    const prefs = { masterEnabled: false, categories: ALL_ON };
    for (const key of EMAIL_CATEGORY_KEYS) {
      expect(isCategoryEnabled(prefs, key)).toBe(false);
    }
  });

  it('hands control back to the categories when it is on', () => {
    const prefs = { masterEnabled: true, categories: ALL_ON };
    for (const key of EMAIL_CATEGORY_KEYS) {
      expect(isCategoryEnabled(prefs, key)).toBe(true);
    }
  });

  it('does not silently re-enable anything when switched back on', () => {
    const off: Record<string, boolean> = { ...ALL_ON, votes_and_polls: false };
    expect(isCategoryEnabled({ masterEnabled: false, categories: off }, 'votes_and_polls')).toBe(false);
    expect(isCategoryEnabled({ masterEnabled: true, categories: off }, 'votes_and_polls')).toBe(false);
    expect(isCategoryEnabled({ masterEnabled: true, categories: off }, 'community_proposals')).toBe(true);
  });
});

// ─── Individual categories ──────────────────────────────────────────────────

describe('individual categories', () => {
  it('honours one category off while the others stay on', () => {
    const prefs = { masterEnabled: true, categories: { ...ALL_ON, followed_proposals: false } };
    expect(isCategoryEnabled(prefs, 'followed_proposals')).toBe(false);
    expect(isCategoryEnabled(prefs, 'community_proposals')).toBe(true);
    expect(isCategoryEnabled(prefs, 'votes_and_polls')).toBe(true);
  });

  it('sends nothing when every category is off', () => {
    const prefs = { masterEnabled: true, categories: ALL_OFF };
    for (const key of EMAIL_CATEGORY_KEYS) {
      expect(isCategoryEnabled(prefs, key)).toBe(false);
    }
  });

  it('falls back to the declared default for a category never answered', () => {
    const prefs = { masterEnabled: true, categories: {} };
    for (const key of EMAIL_CATEGORY_KEYS) {
      expect(isCategoryEnabled(prefs, key)).toBe(categoryDefault(key));
    }
  });

  it('treats a stored non-boolean as unanswered rather than as consent', () => {
    const prefs = {
      masterEnabled: true,
      categories: { community_proposals: 'yes' as unknown as boolean },
    };
    expect(isCategoryEnabled(prefs, 'community_proposals')).toBe(
      categoryDefault('community_proposals'),
    );
  });
});

// ─── Which notifications become email ───────────────────────────────────────

describe('notification → category mapping', () => {
  it('maps the three promised streams', () => {
    expect(emailCategoryForNotification('new_proposal')).toBe('community_proposals');
    expect(emailCategoryForNotification('vote_started')).toBe('votes_and_polls');
    expect(emailCategoryForNotification('proposal_advanced')).toBe('followed_proposals');
    expect(emailCategoryForNotification('amendment_ready')).toBe('followed_proposals');
  });

  it('sends no email for a type that has not been given one', () => {
    for (const type of ['sortition_assigned', 'new_media', 'file_lost', 'community_invite']) {
      expect(emailCategoryForNotification(type)).toBeNull();
    }
  });

  it('maps every category to at least one notification type', () => {
    const mapped = new Set(
      ['new_proposal', 'vote_started', 'proposal_advanced', 'amendment_ready', 'deliberation_reminder']
        .map((t) => emailCategoryForNotification(t)),
    );
    for (const key of EMAIL_CATEGORY_KEYS) {
      expect(mapped.has(key as EmailCategoryKey)).toBe(true);
    }
  });
});

// ─── Preferences are read at send time ──────────────────────────────────────

describe('preferences are checked before sending, not after', () => {
  it('reads them inside the worker path, not at enqueue', () => {
    const enqueue = service.slice(
      service.indexOf('export async function enqueueOptionalEmail'),
      service.indexOf('export async function deliverOptionalEmail'),
    );
    expect(enqueue).not.toMatch(/isCategoryEnabled|getOrCreateEmailPrefs/);

    const deliver = service.slice(service.indexOf('export async function deliverOptionalEmail'));
    expect(deliver).toMatch(/getOrCreateEmailPrefs/);
    expect(deliver).toMatch(/isCategoryEnabled/);
  });

  it('decides before the message is built or handed to SMTP', () => {
    const deliver = service.slice(service.indexOf('export async function deliverOptionalEmail'));
    expect(deliver.indexOf('isCategoryEnabled')).toBeLessThan(deliver.indexOf('await deliver({'));
    expect(deliver.indexOf('isCategoryEnabled')).toBeLessThan(deliver.indexOf('loadRecipient'));
  });

  it('records an opt-out so a retry cannot re-decide it', () => {
    const deliver = service.slice(service.indexOf('export async function deliverOptionalEmail'));
    expect(deliver).toMatch(/'suppressed', 'opted_out'/);
    expect(migration).toMatch(/'suppressed'/);
  });

  it('carries no address in the queued job — it is read at send time', () => {
    expect(service).toMatch(/export interface OptionalEmailJob/);
    const start = service.indexOf('export interface OptionalEmailJob');
    const jobShape = service.slice(start, service.indexOf('\n}', start));
    expect(jobShape).not.toMatch(/\bemail\b|\bto\b:/);
    expect(jobShape).toMatch(/userId: number/);
  });
});

// ─── The deployment-wide fan-out switch ─────────────────────────────────────

describe('notification email is a second, separate switch', () => {
  const mailer = read('server/utils/mailer.ts');

  it('is off unless explicitly enabled, even with SMTP fully configured', () => {
    expect(mailer).toMatch(/export function areNotificationEmailsEnabled/);
    expect(mailer).toMatch(/process\.env\.EMAIL_NOTIFICATIONS_ENABLED === 'true'/);
    // Opt-in, not opt-out: no `!== 'false'` default-on reading.
    expect(mailer).not.toMatch(/EMAIL_NOTIFICATIONS_ENABLED !== 'false'/);
  });

  it('still requires SMTP — the flag alone cannot send', () => {
    const fn = mailer.slice(mailer.indexOf('export function areNotificationEmailsEnabled'));
    expect(fn).toMatch(/isMailConfigured\(\) &&/);
  });

  it('blocks at enqueue, so nothing accumulates to flood later', () => {
    const enqueue = service.slice(
      service.indexOf('export async function enqueueOptionalEmail'),
      service.indexOf('export async function deliverOptionalEmail'),
    );
    expect(enqueue).toMatch(/if \(!areNotificationEmailsEnabled\(\)\) return;/);
  });

  it('blocks again at send, for jobs queued before it was turned off', () => {
    const deliver = service.slice(service.indexOf('export async function deliverOptionalEmail'));
    expect(deliver).toMatch(/if \(!areNotificationEmailsEnabled\(\)\) return;/);
  });

  it('does not touch security mail', () => {
    const securityPath = service.slice(
      service.indexOf('export async function sendSecurityEmail'),
      service.indexOf('// ─── Optional mail'),
    );
    expect(securityPath).not.toMatch(/areNotificationEmailsEnabled/);
  });

  it('is what the settings page reports, so the UI cannot promise mail that will not come', () => {
    expect(router).toMatch(/mailConfigured: areNotificationEmailsEnabled\(\)/);
    expect(router).not.toMatch(/mailConfigured: isMailConfigured\(\)/);
  });
});

// ─── Security mail is not switchable ────────────────────────────────────────

describe('security mail ignores preferences entirely', () => {
  const securityPath = service.slice(
    service.indexOf('export async function sendSecurityEmail'),
    service.indexOf('// ─── Optional mail'),
  );

  it('never consults the preference table', () => {
    expect(securityPath).not.toMatch(/getOrCreateEmailPrefs/);
    expect(securityPath).not.toMatch(/isCategoryEnabled/);
    expect(securityPath).not.toMatch(/masterEnabled/);
  });

  it('carries no unsubscribe header — there is nothing to unsubscribe from', () => {
    const call = securityPath.slice(securityPath.indexOf('await deliver({'));
    expect(call).toMatch(/template: args\.template/);
    expect(call).not.toMatch(/unsubscribeUrl/);
  });

  it('has no category key that could turn it off', () => {
    for (const t of ['password_reset', 'password_changed', 'email_changed']) {
      expect(isEmailCategoryKey(t)).toBe(false);
      expect(emailCategoryForNotification(t)).toBeNull();
    }
  });

  it('says so in both languages on the settings page', () => {
    expect(settingsPage).toMatch(/t\('emailPrefs\.alwaysHint'\)/);
    expect(el).toContain("'emailPrefs.alwaysHint'");
    expect(en).toContain("'emailPrefs.alwaysHint'");
  });
});

// ─── Unsubscribe token ──────────────────────────────────────────────────────

describe('unsubscribe token', () => {
  beforeAll(() => {
    process.env.SIGNING_MASTER_KEY ||= 'a'.repeat(64);
  });

  const load = () => import('../../server/utils/email-tokens');

  it('round-trips a valid token back to its opaque subject', async () => {
    const { signUnsubscribeToken, verifyUnsubscribeToken } = await load();
    const id = 'opaque-subject-123';
    expect(verifyUnsubscribeToken(signUnsubscribeToken(id))).toBe(id);
  });

  it('rejects a tampered signature', async () => {
    const { signUnsubscribeToken, verifyUnsubscribeToken } = await load();
    const token = signUnsubscribeToken('opaque-subject-123');
    const [id, sig] = [token.slice(0, token.lastIndexOf('.')), token.slice(token.lastIndexOf('.') + 1)];
    const flipped = sig[0] === 'A' ? 'B' + sig.slice(1) : 'A' + sig.slice(1);
    expect(verifyUnsubscribeToken(`${id}.${flipped}`)).toBeNull();
  });

  it('rejects a signature lifted onto a different subject', async () => {
    const { signUnsubscribeToken, verifyUnsubscribeToken } = await load();
    const token = signUnsubscribeToken('subject-a');
    const sig = token.slice(token.lastIndexOf('.') + 1);
    expect(verifyUnsubscribeToken(`subject-b.${sig}`)).toBeNull();
  });

  it('rejects garbage', async () => {
    const { verifyUnsubscribeToken } = await load();
    for (const bad of ['', '.', 'nodot', 'a.', null, undefined, 42, {}]) {
      expect(verifyUnsubscribeToken(bad as unknown)).toBeNull();
    }
  });

  it('exposes neither a user id nor an address', async () => {
    const { signUnsubscribeToken } = await load();
    const token = signUnsubscribeToken('Zm9vYmFy_opaque');
    expect(token).not.toMatch(/@/);
    expect(token).not.toMatch(/userId|user_id|uid=/);
    // The subject is the random column, not the primary key.
    expect(service).toMatch(/unsubscribeUrlFor\(prefs\.unsubscribeId\)/);
    expect(migration).toMatch(/unsubscribe_id TEXT NOT NULL UNIQUE/);
  });

  it('is compared in constant time', () => {
    expect(tokens).toMatch(/timingSafeEqual/);
  });

  it('derives its key from the platform signing root, never a literal', () => {
    expect(tokens).toMatch(/process\.env\.SIGNING_MASTER_KEY/);
    expect(tokens).toMatch(/hkdfSync/);
    expect(tokens).not.toMatch(/=\s*['"][A-Za-z0-9+/=]{16,}['"]/);
  });
});

// ─── Unsubscribe endpoint scope ─────────────────────────────────────────────

describe('unsubscribe endpoint', () => {
  it('can do exactly one thing: switch the master switch off', () => {
    const unsub = service.slice(
      service.indexOf('export async function unsubscribeAllByToken'),
      service.indexOf('export function unsubscribeUrlFor'),
    );
    expect(unsub).toMatch(/masterEnabled: false/);
    // Not the categories, not the address, not the password, not a session.
    expect(unsub).not.toMatch(/categories:|email:|password|req\.login/);
  });

  it('refuses an unsigned token before touching the database', () => {
    const post = router.slice(router.indexOf("app.post('/api/unsubscribe'"));
    expect(post.indexOf('verifyUnsubscribeToken')).toBeLessThan(
      post.indexOf('unsubscribeAllByToken'),
    );
  });

  it('answers the GET probe with yes/no and nothing else', () => {
    const start = router.indexOf("app.get('/api/unsubscribe'");
    const get = router.slice(start, router.indexOf('});', start) + 3);
    expect(get).toMatch(/res\.json\(\{ valid: !!id \}\)/);
    expect(get).not.toMatch(/email|userId|name/);
  });

  it('is exempt from CSRF so RFC 8058 one-click works', () => {
    const csrf = read('server/utils/csrf.ts');
    expect(csrf).toMatch(/\/\^\\\/api\\\/unsubscribe\$\//);
  });
});

// ─── Every optional email carries both links ────────────────────────────────

describe('optional email footer', () => {
  it('renders a settings link and a stop-all link in both languages', () => {
    expect(templates).toMatch(/settings: 'Ρυθμίσεις ειδοποιήσεων'/);
    expect(templates).toMatch(/unsubscribe: 'Διακοπή όλων των προαιρετικών email'/);
    expect(templates).toMatch(/settings: 'Notification settings'/);
    expect(templates).toMatch(/unsubscribe: 'Stop all optional email'/);
  });

  it('passes both to every optional template', () => {
    const deliver = service.slice(service.indexOf('export async function deliverOptionalEmail'));
    expect(deliver).toMatch(/settingsUrl: notificationSettingsUrl\(\)/);
    expect(deliver).toMatch(/unsubscribeUrl,/);
  });

  it('sets List-Unsubscribe only when there is something to unsubscribe from', () => {
    const mailer = read('server/utils/mailer.ts');
    expect(mailer).toMatch(/if \(mail\.unsubscribeUrl\) \{/);
    expect(mailer).toMatch(/List-Unsubscribe-Post.*One-Click/);
  });
});

// ─── Templates ──────────────────────────────────────────────────────────────

describe('templates', () => {
  it('covers all five messages', () => {
    for (const fn of [
      'passwordResetEmail',
      'passwordChangedEmail',
      'communityProposalEmail',
      'votingEmail',
      'proposalUpdateEmail',
    ]) {
      expect(templates).toContain(`export function ${fn}`);
    }
  });

  it('always produces a plain-text alternative alongside the HTML', () => {
    expect(templates).toMatch(/return \{ subject, html: renderHtml\(parts\), text: renderText\(parts\) \}/);
  });

  it('uses no images at all, so a client that blocks them loses nothing', () => {
    expect(templates).not.toMatch(/<img\b/i);
    expect(templates).not.toMatch(/background-image/i);
  });

  it('escapes interpolated content', () => {
    expect(templates).toMatch(/export function esc\(value: string\)/);
    expect(templates).toMatch(/replace\(\/</);
  });

  it('suppresses autoresponders rather than inviting a reply to no-reply@', () => {
    const mailer = read('server/utils/mailer.ts');
    expect(mailer).toMatch(/'Auto-Submitted': 'auto-generated'/);
    expect(mailer).toMatch(/'X-Auto-Response-Suppress': 'All'/);
  });
});

// ─── No duplicate sends ─────────────────────────────────────────────────────

describe('idempotency', () => {
  it('claims the slot before the SMTP call, not after', () => {
    const deliverFn = service.slice(
      service.indexOf('async function deliver(args: DeliverArgs)'),
      service.indexOf('// ─── Security mail'),
    );
    expect(deliverFn.indexOf('claimDelivery')).toBeLessThan(deliverFn.indexOf('await sendMail('));
    expect(deliverFn).toMatch(/if \(claim === 'already_handled'\) return;/);
  });

  it('treats sent and suppressed as final, and a stale queued row as reclaimable', () => {
    expect(service).toMatch(/ON CONFLICT \(idempotency_key\) DO UPDATE/);
    expect(service).toMatch(/email_deliveries\.status = 'failed'/);
    expect(service).toMatch(/INTERVAL '15 minutes'/);
  });

  it('keys a notification email by member, subject, wording and day', () => {
    expect(notifications).toMatch(
      /idempotencyKey: `\$\{params\.type\}:\$\{params\.userId\}:\$\{subjectId\}:\$\{titleFingerprint\}:\$\{day\}`/,
    );
  });

  it('enforces uniqueness in the database, not only in code', () => {
    expect(migration).toMatch(/idempotency_key TEXT NOT NULL UNIQUE/);
  });
});

// ─── Schema extensibility ───────────────────────────────────────────────────

describe('0043 migration', () => {
  it('stores categories as jsonb so a new one needs no migration', () => {
    expect(migration).toMatch(/categories JSONB NOT NULL DEFAULT '\{\}'::jsonb/);
    // No column-per-category, which is how the 0003b table ossified.
    for (const key of EMAIL_CATEGORY_KEYS) {
      expect(migration).not.toContain(`${key} BOOLEAN`);
    }
  });

  it('keeps the master switch a real column, since every send reads it', () => {
    expect(migration).toMatch(/master_enabled BOOLEAN NOT NULL DEFAULT TRUE/);
  });

  it('cascades on account deletion', () => {
    expect(migration).toMatch(/REFERENCES users\(id\) ON DELETE CASCADE/);
  });

  it('is additive', () => {
    expect(migration).not.toMatch(/DROP TABLE|DROP COLUMN|TRUNCATE/i);
  });
});

// ─── The settings page ──────────────────────────────────────────────────────

describe('settings page', () => {
  it('offers a master switch and one switch per category', () => {
    expect(settingsPage).toMatch(/data-testid="email-master-switch"/);
    expect(settingsPage).toMatch(/data-testid=\{`email-category-\$\{c\.key\}`\}/);
  });

  it('takes its categories from the server, not a hard-coded list', () => {
    expect(settingsPage).toMatch(/prefs\.categories\.map/);
    for (const key of EMAIL_CATEGORY_KEYS) {
      expect(settingsPage).not.toContain(`'${key}'`);
    }
  });

  it('confirms a save', () => {
    expect(settingsPage).toMatch(/t\('emailPrefs\.savedTitle'\)/);
    expect(settingsPage).toMatch(/t\('emailPrefs\.savedBody'\)/);
  });

  it('is reachable at the address every optional email points to', () => {
    expect(service).toMatch(/\/notifications\/settings/);
    expect(read('client/src/App.tsx')).toMatch(
      /path="\/notifications\/settings" component=\{NotificationSettingsPage\}/,
    );
  });
});
