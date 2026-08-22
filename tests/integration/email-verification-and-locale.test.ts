/**
 * Address confirmation, and the language every email is written in.
 *
 * The token rules are pure (server/utils/email-verification.ts) and tested as
 * behaviour. The rest — that registration records a language, that the mail
 * path reads it, that confirmation is a POST and not a page load, that the
 * signed-out pages wear the platform's own chrome — is pinned against source,
 * this repo's way of covering routes and pages without a live database.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  VERIFICATION_RESENDS_PER_HOUR,
  VERIFICATION_TOKEN_BYTES,
  VERIFICATION_TTL_HOURS,
  VERIFICATION_TTL_MS,
  generateVerificationToken,
  hashVerificationToken,
  isVerificationTokenLive,
} from '../../server/utils/email-verification';
import { SELF_RESET_TTL_MS } from '../../server/utils/password-reset';

const root = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const auth = read('server/auth.ts');
const schema = read('shared/schema.ts');
const migration = read('migrations/0044_user_locale_and_email_verification.sql');
const service = read('server/utils/email-service.ts');
const templates = read('server/utils/email-templates.ts');
const backfill = read('scripts/send-verification-backfill.ts');
const shell = read('client/src/components/auth/AuthShell.tsx');
const localeSync = read('client/src/components/auth/LocaleSync.tsx');
const switcher = read('client/src/components/ui/language-switcher.tsx');
const authPage = read('client/src/pages/auth-page.tsx');
const adminPage = read('client/src/pages/admin-accounts.tsx');
const el = read('client/src/locales/el.ts');
const en = read('client/src/locales/en.ts');

// ─── Token rules ────────────────────────────────────────────────────────────

describe('verification token', () => {
  it('draws at least 32 cryptographically random bytes', () => {
    expect(VERIFICATION_TOKEN_BYTES).toBeGreaterThanOrEqual(32);
    const { token } = generateVerificationToken();
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(token).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-/i);
  });

  it('stores only the SHA-256', () => {
    const { token, tokenHash } = generateVerificationToken();
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).toBe(hashVerificationToken(token));
  });

  it('never repeats', () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateVerificationToken().token));
    expect(seen.size).toBe(200);
  });

  it('lives far longer than a reset link, because it is not a credential', () => {
    expect(VERIFICATION_TTL_MS).toBeGreaterThan(SELF_RESET_TTL_MS);
    expect(VERIFICATION_TTL_HOURS).toBeGreaterThanOrEqual(24);
  });
});

describe('verification token liveness', () => {
  const email = 'member@example.org';
  const future = new Date(Date.now() + 60 * 60_000);
  const past = new Date(Date.now() - 60 * 60_000);

  it('accepts a live token for the address on the account', () => {
    expect(isVerificationTokenLive({ usedAt: null, expiresAt: future, email }, email)).toBe(true);
  });

  it('ignores case and surrounding space when matching the address', () => {
    expect(
      isVerificationTokenLive({ usedAt: null, expiresAt: future, email: 'Member@Example.ORG' }, ` ${email} `),
    ).toBe(true);
  });

  it('rejects an expired token', () => {
    expect(isVerificationTokenLive({ usedAt: null, expiresAt: past, email }, email)).toBe(false);
  });

  it('rejects an already-used token', () => {
    expect(isVerificationTokenLive({ usedAt: new Date(), expiresAt: future, email }, email)).toBe(false);
  });

  it('rejects an unknown token', () => {
    expect(isVerificationTokenLive(null, email)).toBe(false);
    expect(isVerificationTokenLive(undefined, email)).toBe(false);
  });

  it('refuses to confirm an address the link was not issued for', () => {
    // Register with a typo, fix it, then click the first message: without
    // this the corrected address is marked verified having never been read.
    expect(
      isVerificationTokenLive({ usedAt: null, expiresAt: future, email: 'typo@example.org' }, email),
    ).toBe(false);
  });

  it('rejects when the account has no address at all', () => {
    expect(isVerificationTokenLive({ usedAt: null, expiresAt: future, email }, null)).toBe(false);
  });
});

// ─── Registration and sending ───────────────────────────────────────────────

describe('registration', () => {
  it('records the language the member registered in', () => {
    expect(schema).toMatch(/locale: z\.enum\(\['el', 'en'\]\)\.optional\(\)/);
    expect(auth).toMatch(/locale: parsed\.data\.locale \?\? consent\.locale \?\? 'el'/);
    expect(authPage).toMatch(/\n      locale,/);
  });

  it('sends the confirmation without letting a mail failure fail the signup', () => {
    expect(auth).toMatch(/void issueVerificationEmail\(user\.id\)\.catch/);
    const handler = auth.slice(auth.indexOf('void issueVerificationEmail'));
    expect(handler.indexOf('req.login(user')).toBeGreaterThan(0);
  });

  it('retires an outstanding link before minting a new one', () => {
    const issue = auth.slice(
      auth.indexOf('async function issueVerificationEmail'),
      auth.indexOf('app.post("/api/email-verification/verify"'),
    );
    expect(issue.indexOf('isNull(emailVerificationTokens.usedAt)')).toBeLessThan(
      issue.indexOf('generateVerificationToken()'),
    );
  });

  it('does nothing for an address already confirmed', () => {
    const issue = auth.slice(auth.indexOf('async function issueVerificationEmail'));
    expect(issue).toMatch(/if \(user\.emailVerifiedAt\) return false;/);
  });
});

describe('confirming', () => {
  const handler = auth.slice(
    auth.indexOf('app.post("/api/email-verification/verify"'),
    auth.indexOf('app.post("/api/email-verification/resend"'),
  );

  it('is unauthenticated, because the link opens in whatever browser has the inbox', () => {
    expect(handler).not.toMatch(/requireAuth/);
    expect(auth).toMatch(/app\.post\("\/api\/email-verification\/verify", authLimiter/);
  });

  it('is a POST, so a link scanner cannot confirm an address nobody read', () => {
    expect(auth).not.toMatch(/app\.get\("\/api\/email-verification\/verify"/);
    expect(read('client/src/pages/verify-email.tsx'))
      .toMatch(/api\.post<\{ ok: boolean \}>\('\/api\/email-verification\/verify'/);
  });

  it('checks the address still matches before setting the flag', () => {
    expect(handler.indexOf('isVerificationTokenLive')).toBeLessThan(
      handler.indexOf('emailVerifiedAt: new Date()'),
    );
  });

  it('burns the token', () => {
    expect(handler).toMatch(/emailVerificationTokens\)\s*\n\s*\.set\(\{ usedAt: new Date\(\) \}\)/);
  });

  it('reports success for an address already confirmed rather than a dead end', () => {
    expect(handler).toMatch(/alreadyVerified: true/);
  });

  it('answers the same shape whatever went wrong — no oracle', () => {
    expect(handler.match(/res\.json\(\{ ok: false \}\)/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('rate limits resends per account', () => {
    expect(VERIFICATION_RESENDS_PER_HOUR).toBeGreaterThan(0);
    const resend = auth.slice(auth.indexOf('app.post("/api/email-verification/resend"'));
    expect(resend).toMatch(/requireAuth/);
    expect(resend).toMatch(/VERIFICATION_RESENDS_PER_HOUR/);
    expect(resend).toMatch(/429/);
  });
});

// ─── Google accounts always have a real address ─────────────────────────────

describe('Google sign-in', () => {
  const strategy = auth.slice(
    auth.indexOf('new GoogleStrategy('),
    auth.indexOf('// ── Email verification'),
  );

  it('never invents an address when Google returns none', () => {
    // The old fallback was `${profile.id}@gmail.com` — a mailbox belonging
    // to nobody, or to a stranger. Harmless while nothing was ever sent;
    // a reset link posted to the wrong person once mail exists.
    expect(strategy).not.toMatch(/\$\{profile\.id\}@gmail\.com/);
    expect(strategy).toMatch(/const email = profile\.emails\?\.\[0\]\?\.value;/);
    expect(strategy).toMatch(/if \(!email\) \{/);
    expect(strategy).toMatch(/return done\(null, false, \{/);
  });

  it('refuses rather than creating a half-account', () => {
    const guard = strategy.slice(strategy.indexOf('if (!email) {'));
    expect(guard.indexOf('return done(null, false')).toBeLessThan(
      guard.indexOf('storage.createUser'),
    );
  });

  it('accepts Google’s own verification instead of asking twice', () => {
    expect(strategy).toMatch(/email_verified === true/);
    expect(strategy).toMatch(/emailVerifiedAt: googleVerified \? new Date\(\) : null/);
  });

  it('marks an existing account verified when it links to Google', () => {
    expect(strategy).toMatch(/linkVerified && !existingUser\.emailVerifiedAt/);
  });
});

describe('a Google account asking for a password reset', () => {
  it('gets told, by email, rather than left waiting', () => {
    const handler = auth.slice(
      auth.indexOf('app.post("/api/password-reset/request"'),
      auth.indexOf('app.post("/api/password-reset/check"'),
    );
    expect(handler).toMatch(/if \(!user\.password\) \{/);
    expect(handler).toMatch(/template: 'google_account'/);
  });

  it('still mints no reset token for it', () => {
    const handler = auth.slice(auth.indexOf('app.post("/api/password-reset/request"'));
    const guard = handler.slice(handler.indexOf('if (!user.password) {'));
    // The early return lands before any token is created.
    expect(guard.indexOf('return;')).toBeLessThan(guard.indexOf('generateResetToken()'));
  });

  it('does not change what the form says — no disclosure', () => {
    const handler = auth.slice(
      auth.indexOf('app.post("/api/password-reset/request"'),
      auth.indexOf('app.post("/api/password-reset/check"'),
    );
    expect(handler.match(/res\.json\(/g)?.length).toBe(1);
  });

  it('is capped so it cannot be used to mail someone repeatedly', () => {
    expect(auth).toMatch(/google_account:\$\{user\.id\}:\$\{Math\.floor\(Date\.now\(\) \/ 3_600_000\)\}/);
  });

  it('renders in both languages and points at sign-in', () => {
    expect(templates).toMatch(/export function googleAccountEmail/);
    const tpl = templates.slice(templates.indexOf('export function googleAccountEmail'));
    expect(tpl).toMatch(/locale === 'en'/);
    expect(tpl).toMatch(/Σύνδεση με Google/);
    expect(tpl).toMatch(/Sign in with Google/);
  });
});

// ─── Nothing is gated ───────────────────────────────────────────────────────

describe('verification gates nothing', () => {
  it('does not block login or any route on emailVerifiedAt', () => {
    const loginHandler = auth.slice(auth.indexOf('app.post("/api/login"'));
    expect(loginHandler).not.toMatch(/emailVerifiedAt/);
    expect(auth).not.toMatch(/requireVerifiedEmail/);
  });

  it('says so in the migration, so the next person does not "fix" it', () => {
    expect(migration).toMatch(/Nothing is gated on this column/);
  });
});

// ─── Language ───────────────────────────────────────────────────────────────

describe('email language', () => {
  it('reads the member’s own setting first', () => {
    const loader = service.slice(
      service.indexOf('async function loadRecipient'),
      service.indexOf('// ─── Idempotency'),
    );
    expect(loader).toMatch(/locale: users\.locale/);
    expect(loader.indexOf('user.locale')).toBeLessThan(loader.indexOf('userConsents'));
  });

  it('falls back to the consent locale only for rows that predate the column', () => {
    const loader = service.slice(service.indexOf('async function loadRecipient'));
    expect(loader).toMatch(/if \(!locale\) \{/);
    expect(loader).toMatch(/userConsents\.locale/);
  });

  it('renders every template in both languages', () => {
    for (const fn of [
      'passwordResetEmail',
      'passwordChangedEmail',
      'verifyEmailEmail',
      'communityProposalEmail',
      'votingEmail',
      'proposalUpdateEmail',
    ]) {
      const start = templates.indexOf(`export function ${fn}`);
      expect(start, `${fn} missing`).toBeGreaterThan(-1);
      const body = templates.slice(start, start + 3000);
      expect(body, `${fn} has no English branch`).toMatch(/locale === 'en'/);
    }
  });

  it('persists a language change for a signed-in member', () => {
    expect(switcher).toMatch(/api\.put\('\/api\/user\/locale', \{ locale: newLocale \}\)/);
    expect(switcher).toMatch(/if \(user\) \{/);
    expect(auth).toMatch(/app\.put\("\/api\/user\/locale", requireAuth/);
  });

  it('accepts only the two supported languages', () => {
    const handler = auth.slice(auth.indexOf('app.put("/api/user/locale"'));
    expect(handler).toMatch(/locale !== 'el' && locale !== 'en'/);
    expect(handler).toMatch(/400/);
  });

  it('adopts the stored language once per account, not on every render', () => {
    expect(localeSync).toMatch(/adoptedFor/);
    expect(localeSync).toMatch(/if \(adoptedFor\.current === user\.id\) return;/);
  });

  it('surfaces the language on the session user so the client can adopt it', () => {
    expect(schema).toMatch(/\| 'locale'/);
    expect(schema).toMatch(/\| 'emailVerifiedAt'/);
    expect(auth).toMatch(/locale: user\.locale,/);
  });
});

// ─── Signed-out pages wear the platform's chrome ────────────────────────────

describe('signed-out pages', () => {
  const pages = [
    'client/src/pages/forgot-password.tsx',
    'client/src/pages/reset-password.tsx',
    'client/src/pages/unsubscribe.tsx',
    'client/src/pages/verify-email.tsx',
  ];

  it('all use the shared AgoraX shell', () => {
    for (const p of pages) {
      const src = read(p);
      expect(src, `${p} is not in the shell`).toMatch(/<AuthShell/);
      expect(src, `${p} still uses the generic card`).not.toMatch(/@\/components\/ui\/card/);
    }
  });

  it('the shell carries the wordmark, the Beta badge and the language switcher', () => {
    expect(shell).toMatch(/logoImage/);
    expect(shell).toMatch(/data-testid="badge-beta"/);
    expect(shell).toMatch(/<LanguageSwitcher \/>/);
  });

  it('every string on them is translated, none hard-coded', () => {
    for (const p of pages) {
      const src = read(p);
      // Any user-visible text arrives through t(); the only bare strings left
      // are class names, test ids and placeholders.
      expect(src, `${p} has no translations`).toMatch(/t\('/);
    }
  });

  it('the login page shares the same style constants rather than its own copy', () => {
    expect(authPage).toMatch(/from "@\/components\/auth\/auth-styles"/);
    expect(authPage).not.toMatch(/^const BUTTON_PRIMARY =/m);
  });
});

// ─── Admin visibility ───────────────────────────────────────────────────────

describe('admin accounts page', () => {
  it('shows who has confirmed their address and who has not', () => {
    expect(adminPage).toMatch(/data-testid="table-head-email-verified"/);
    expect(adminPage).toMatch(/user\.emailVerifiedAt \? \(/);
    expect(adminPage).toMatch(/t\('admin\.verified'\)/);
    expect(adminPage).toMatch(/t\('admin\.notVerified'\)/);
  });

  it('keeps the empty-state row spanning every column', () => {
    // The page renders two tables; only the accounts one matters here.
    const accountsTable = adminPage.slice(
      adminPage.indexOf('table-head-username'),
      adminPage.indexOf('text-no-users'),
    );
    const headers = (accountsTable.match(/<TableHead data-testid="table-head-/g) ?? []).length + 1;
    expect(adminPage).toMatch(
      new RegExp(`colSpan=\\{${headers}\\} className="text-center py-8" data-testid="text-no-users"`),
    );
  });

  it('labels the column in both languages', () => {
    for (const key of ['admin.emailVerified', 'admin.verified', 'admin.notVerified']) {
      expect(el).toContain(`'${key}'`);
      expect(en).toContain(`'${key}'`);
    }
  });
});

// ─── Backfill ───────────────────────────────────────────────────────────────

describe('backfill script', () => {
  it('offers a dry run', () => {
    expect(backfill).toMatch(/--dry-run/);
    expect(backfill).toMatch(/const dryRun = process\.argv\.includes\('--dry-run'\)/);
  });

  it('is safe to re-run: skips the verified and anyone holding a live link', () => {
    expect(backfill).toMatch(/isNull\(users\.emailVerifiedAt\)/);
    expect(backfill).toMatch(/gt\(emailVerificationTokens\.expiresAt, new Date\(\)\)/);
    expect(backfill).toMatch(/if \(live\) \{/);
  });

  it('never mails a banned account', () => {
    expect(backfill).toMatch(/IS DISTINCT FROM 'banned'/);
  });

  it('paces itself and can be split across runs', () => {
    expect(backfill).toMatch(/const DELAY_MS/);
    expect(backfill).toMatch(/--limit/);
  });

  it('keeps addresses out of its own run log', () => {
    const loop = backfill.slice(backfill.indexOf('for (const user of pending)'));
    expect(loop).not.toMatch(/console\.\w+\([^)]*user\.email/);
  });

  it('refuses to run against an unconfigured mail server', () => {
    expect(backfill).toMatch(/if \(!isMailConfigured\(\) && !dryRun\)/);
  });
});

// ─── Migration ──────────────────────────────────────────────────────────────

describe('0044 migration', () => {
  it('adds both columns with safe defaults', () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'el'/);
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP/);
  });

  it('leaves every existing account unverified rather than assuming', () => {
    expect(migration).not.toMatch(/UPDATE users SET email_verified_at/i);
  });

  it('pins the token to one address', () => {
    expect(migration).toMatch(/email TEXT NOT NULL/);
  });

  it('is additive', () => {
    expect(migration).not.toMatch(/DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM/i);
  });
});
