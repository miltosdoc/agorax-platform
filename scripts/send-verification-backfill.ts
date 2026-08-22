/**
 * One-off: ask every existing member to confirm their address.
 *
 * Every account that predates migration 0044 is unverified, because nobody
 * ever proved those addresses. This walks them and sends one confirmation
 * link each.
 *
 * Run it on the production box after the migration and after SMTP is
 * configured:
 *
 *   npx tsx scripts/send-verification-backfill.ts --dry-run
 *   npx tsx scripts/send-verification-backfill.ts
 *
 * Safe to run more than once. It skips anyone already verified, and skips
 * anyone who was already sent a live link — so a re-run after a crash
 * continues rather than mailing the whole platform a second time.
 *
 * Paced deliberately. Scaleway's free tier is 300 messages a month and any
 * provider treats a sudden burst from a young domain as a reason to look
 * closely, so this trickles rather than floods: one message every DELAY_MS,
 * with --limit to split the run across days if the list is long.
 */

import 'dotenv/config';
import { and, eq, isNull, isNotNull, gt, sql } from 'drizzle-orm';
import { db, pool } from '../server/db';
import { emailVerificationTokens, users } from '@shared/schema';
import {
  VERIFICATION_TTL_HOURS,
  VERIFICATION_TTL_MS,
  generateVerificationToken,
} from '../server/utils/email-verification';
import { sendSecurityEmail } from '../server/utils/email-service';
import { isMailConfigured, publicUrl } from '../server/utils/mailer';

const DELAY_MS = 2_000;

/**
 * Addresses that exist in the users table but cannot receive mail: seeded
 * demo accounts, e2e fixtures, reserved example domains.
 *
 * Without this the run hands 30 of them to the provider one by one, collects
 * 30 rejections, and spends 30 attempts of a metered quota proving what the
 * domain names already say. Worse, a run log full of failures is a run log
 * nobody reads, and the real failure hides in it.
 */
const UNDELIVERABLE = /@(example\.(com|org|net|invalid)|demo\.agorax\.local|.*\.test|.*\.invalid|.*\.local)$/i;

function isDeliverable(email: string): boolean {
  return !UNDELIVERABLE.test(email.trim());
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split('=')[1];
}

const dryRun = process.argv.includes('--dry-run');
const limit = Number(arg('limit') ?? '0') || Infinity;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  if (!isMailConfigured() && !dryRun) {
    console.error('SMTP is not configured — set SMTP_HOST/SMTP_USER/SMTP_PASS first.');
    process.exitCode = 1;
    return;
  }

  console.log(`Links will point at ${publicUrl()} and expire in ${VERIFICATION_TTL_HOURS}h.`);

  const pending = await db
    .select({ id: users.id, email: users.email, username: users.username })
    .from(users)
    .where(and(
      isNull(users.emailVerifiedAt),
      isNotNull(users.email),
      // Never mail a banned account. Whatever they did, an unsolicited
      // message inviting them back in is not the follow-up.
      sql`${users.accountStatus} IS DISTINCT FROM 'banned'`,
    ))
    .orderBy(users.id);

  const deliverable = pending.filter((u) => isDeliverable(u.email));
  const undeliverable = pending.length - deliverable.length;

  console.log(`${pending.length} unverified account(s).`);
  if (undeliverable > 0) {
    // Named, not silent. A count that quietly shrinks is how a backfill
    // ends up having skipped real people nobody noticed.
    console.log(`${undeliverable} skipped as undeliverable (demo/test/reserved domains).`);
  }
  console.log(`${deliverable.length} will be mailed.`);

  let sent = 0;
  let skipped = 0;

  for (const user of deliverable) {
    if (sent >= limit) {
      console.log(`Reached --limit=${limit}; ${deliverable.length - sent - skipped} left for the next run.`);
      break;
    }

    // Someone already has a live link — a previous run, or they asked for one
    // themselves. Sending a second retires the first, which would break the
    // link in the message they are looking at right now.
    const [live] = await db
      .select({ id: emailVerificationTokens.id })
      .from(emailVerificationTokens)
      .where(and(
        eq(emailVerificationTokens.userId, user.id),
        isNull(emailVerificationTokens.usedAt),
        gt(emailVerificationTokens.expiresAt, new Date()),
      ))
      .limit(1);

    if (live) {
      skipped++;
      continue;
    }

    if (dryRun) {
      // The address is not printed. A run log on a shared box should not
      // become a copy of the member list.
      console.log(`would send → user #${user.id} (${user.username})`);
      sent++;
      continue;
    }

    const { token, tokenHash } = generateVerificationToken();
    await db.insert(emailVerificationTokens).values({
      userId: user.id,
      tokenHash,
      email: user.email,
      expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
    });

    try {
      await sendSecurityEmail({
        userId: user.id,
        template: 'email_verification',
        idempotencyKey: `email_verification:${tokenHash.slice(0, 32)}`,
        verifyUrl: `${publicUrl()}/verify-email?token=${encodeURIComponent(token)}`,
        expiresInHours: VERIFICATION_TTL_HOURS,
      });
      sent++;
      console.log(`sent → user #${user.id} (${sent}/${deliverable.length})`);
    } catch (err: any) {
      // Keep going. One bad address must not end the run — the token row
      // stays and the next run will skip this account until it expires.
      console.error(`FAILED → user #${user.id}: ${err?.message ?? 'unknown'}`);
    }

    await sleep(DELAY_MS);
  }

  console.log(`Done. sent=${sent} skipped_existing_link=${skipped}`);
}

main()
  .catch((err) => {
    console.error(err?.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
