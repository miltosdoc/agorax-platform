# Email — operator guide

AgoraX sends two kinds of email and nothing else:

- **Security mail** — password reset, password-changed confirmation, address
  confirmation. Always sent, not switchable, no unsubscribe link, no tracking.
- **Optional notification mail** — new proposals, votes and polls, updates on
  proposals a member follows. Every one carries a link to the member's
  notification settings and a one-click "stop all optional email".

There is no marketing mail and no mailing list. Every optional message is a
direct consequence of something happening in a community the member joined.

If `SMTP_HOST`, `SMTP_USER` or `SMTP_PASS` is missing, every send is a silent
no-op and the platform behaves exactly as it did before mail existed. That is
what keeps the test suite from ever reaching a mail server, and it is a safe
state for a deployment that has not been configured yet.

---

## 1. Provider

Scaleway Transactional Email (TEM). Not Gmail, and not a mail server on the
VPS — a self-hosted sender from a Hetzner IP starts life on every reputation
blocklist there is, and password-reset mail that lands in spam is a lockout.

Sending domain: `mail.agoraxdemocracy.com`, a subdomain, so a deliverability
problem never touches mail sent from the apex domain.

## 2. DNS

Four records on the sending subdomain, all created by Scaleway and added at
the registrar (GoDaddy):

| Record | Name | Purpose |
| --- | --- | --- |
| TXT | `mail.agoraxdemocracy.com` | SPF — `v=spf1 include:_spf.tem.scaleway.com -all` |
| TXT | `<uuid>._domainkey.mail.agoraxdemocracy.com` | DKIM public key |
| TXT | `_dmarc.mail.agoraxdemocracy.com` | DMARC — `v=DMARC1; p=none` |
| MX | `mail.agoraxdemocracy.com` | `10 blackhole.tem.scaleway.com` |

The DKIM selector is a UUID, not a friendly name like `default` or `smtp`, so
`dig` will not find it unless you have the exact record name from the Scaleway
console.

Verify from a shell rather than trusting the console alone:

```bash
dig +short TXT mail.agoraxdemocracy.com
```

Scaleway's domain page must read **Verified** before anything will send.

## 3. Environment

Set on the deployment only — never in the repository, never in a log:

```
SMTP_HOST=smtp.tem.scaleway.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_REQUIRE_TLS=true
SMTP_USER=<Scaleway project ID>
SMTP_PASS=<Scaleway secret key>
MAIL_FROM="AgoraX <no-reply@mail.agoraxdemocracy.com>"
APP_PUBLIC_URL=https://agoraxdemocracy.com
```

`SMTP_SECURE=false` with `SMTP_REQUIRE_TLS=true` is STARTTLS on port 587:
connect in the clear, then refuse to continue unless the server upgrades.
Setting `SMTP_SECURE=true` on 587 tries to speak TLS from the first byte and
hangs.

`EMAIL_NOTIFICATIONS_ENABLED` is a **second** switch, off unless set to
exactly `true`. SMTP alone enables security mail — password reset and address
confirmation — and nothing else. See §8.

`APP_PUBLIC_URL` is the base for every link inside an email. Mail links are
never built from a request `Host` header — a link built from an attacker-
controlled header in a password-reset email is a redirect gadget.

Signing also needs `SIGNING_MASTER_KEY`, which production already sets for
anonymous voting. Unsubscribe tokens and the reset rate-limiter's HMACs derive
from it via HKDF with per-purpose info strings.

## 4. What is stored

| Table | Holds | Cleaned up by |
| --- | --- | --- |
| `password_reset_tokens` | SHA-256 of the token, never the token | `cleanup_expired`, once used or a day past expiry |
| `password_reset_requests` | HMAC of the address and IP, never either in the clear | `cleanup_expired`, after 24h |
| `email_notification_prefs` | master switch, jsonb category map, opaque unsubscribe id | account deletion (cascade) |
| `email_deliveries` | idempotency ledger — key, template, status | `cleanup_expired`, after 30 days |
| `email_verification_tokens` | SHA-256 of the token plus the address it was issued for | `cleanup_expired`, once used or a week past expiry |

## 5. Adding a notification category

1. Add an entry to `EMAIL_CATEGORIES` in `shared/email-categories.ts`.
2. Add its two locale strings to `client/src/locales/el.ts` and `en.ts`.
3. Map the notification type in `NOTIFICATION_EMAIL_CATEGORY`, and add the
   template in `EMAIL_TEMPLATE_FOR` in `server/utils/notifications.ts`.

No migration. The preferences column is jsonb precisely so this stays a
three-file change — the in-app preference table from `0003b` took the
column-per-type route and every notification type added since shipped with no
preference at all, because adding one meant a migration nobody wrote.

## 6. Language

Every message is written in `users.locale` (`el` | `en`), which the member
sets simply by using the interface in that language — the switcher in the
header writes it. There is no separate "email language" setting to find and
forget. Accounts created before migration `0044` fall back to the locale on
their consent row, then to Greek.

## 7. Address confirmation

`users.email_verified_at` is NULL until the member clicks the link in the
confirmation email. New registrations are sent one automatically; the member
can ask for another from `/notifications/settings`, capped per hour.

**Nothing is gated on it.** Every account predating `0044` is unverified, and
locking those people out on deployment day would be a far worse failure than
an unconfirmed address. The admin accounts page shows a Verified / Not
verified badge per account so there is something to act on.

The token is pinned to the address it was issued for, so a member who
registers with a typo, corrects it, and then clicks the original link does not
mark the corrected address verified.

### Backfilling existing members

Once, after the migration and after SMTP is live in production:

```bash
npx tsx scripts/send-verification-backfill.ts --dry-run
npx tsx scripts/send-verification-backfill.ts --limit=100
```

Safe to re-run: it skips anyone already verified and anyone still holding a
live link, so a second run continues rather than mailing everyone twice. It
paces one message every two seconds and never mails a banned account. Use
`--limit` to split a large list across days — Scaleway's free tier is 300
messages a month, and a young sending domain that suddenly emits hundreds of
messages is a domain that gets looked at.

## 8. Turning the notification fan-out on

`EMAIL_NOTIFICATIONS_ENABLED=true`, and only after SMTP has been proven with
security mail.

The reason it is separate: the phase sweeps run on a timer across proposals
that are *already* in flight, so the first tick after mail becomes available
emits one message per member per live proposal. Enabling SMTP on a dev box
during development did exactly this — 79 messages in one burst, from a single
proposal advancing a phase. On production that is one message per real member,
per community with anything in progress, within five seconds of the restart.

Before flipping it, do the arithmetic:

```sql
SELECT count(*) FROM users WHERE account_status IS DISTINCT FROM 'banned';
SELECT count(*) FROM proposals WHERE status NOT IN ('draft','decided','rejected');
```

Members × live proposals × stages is the order of magnitude per week. Scaleway's
free tier is 300 messages a month; if the product of those numbers is anywhere
near it, move to a paid TEM plan before setting the flag, not after.

The blocking happens at enqueue as well as at send, so leaving the flag off
does not build a backlog that floods when it is finally turned on.

## 9. Turning email off everywhere

Unset `SMTP_HOST` (or `SMTP_USER` / `SMTP_PASS`) and restart. Queued
`send_email` jobs record `smtp_not_configured` and stop; nothing retries in a
loop, nothing else changes. In-app and Web Push notifications are unaffected.

## 10. Privacy notes

- A reset token exists in exactly one place outside the member's inbox: the
  response of the request that created it, in memory, on its way to SMTP.
  It is never queued, never logged, never in an activity row.
- Security mail is sent in-process rather than through the job queue, so a
  live token is never serialised into `jobs.payload`.
- The unsubscribe link carries a random opaque id, not a user id and not an
  address, so a link in an inbox or a forwarded message cannot be read back
  into an identity. It authorises exactly one action.
- Scaleway TEM does not rewrite links or embed open-tracking pixels, so there
  is no per-message tracking to disable.
- The rate-limit table stores HMACs, not addresses: the endpoint answers
  identically whether or not an account exists, so a plaintext table would
  otherwise become a list of every address anyone ever typed into the form.
