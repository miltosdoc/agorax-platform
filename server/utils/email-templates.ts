/**
 * Every email AgoraX sends, as HTML plus a plain-text twin.
 *
 * Constraints these templates are built to:
 *  - No images. Not a logo, not a spacer, not a tracking pixel. The design
 *    has to survive "images are blocked", which is the default in a lot of
 *    clients, so it must not depend on any.
 *  - Tables and inline styles, because Outlook still does not do flexbox.
 *  - A real text/plain alternative, not a tag-stripped afterthought.
 *  - Every link absolute and built from APP_PUBLIC_URL.
 *
 * Language follows the member's own setting (users.locale), which they pick
 * by using the interface in that language. Greek is the fallback — the
 * platform default and the language of the community it was built for.
 */

import { publicUrl } from './mailer';

export type MailLocale = 'el' | 'en';

export function normalizeLocale(value: string | null | undefined): MailLocale {
  return value === 'en' ? 'en' : 'el';
}

// ─── Shell ──────────────────────────────────────────────────────────────────

const BRAND = '#1d4e89';
const INK = '#1a1a1a';
const MUTED = '#5f6b7a';
const LINE = '#e3e8ef';

interface ShellParts {
  locale: MailLocale;
  title: string;
  /** Paragraphs of body copy, already escaped. */
  paragraphs: string[];
  cta?: { label: string; url: string };
  /** Small print under the button — used for "the link expires in N minutes". */
  note?: string;
  /** Optional-mail footer. Absent on security mail. */
  footer?: { settingsUrl: string; unsubscribeUrl: string };
}

/**
 * `<` in a proposal title has ended up inside a mail body before now.
 * Everything interpolated into the HTML goes through here first.
 */
export function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const FOOTER_COPY: Record<MailLocale, { why: string; settings: string; unsubscribe: string; sig: string }> = {
  el: {
    why: 'Λαμβάνετε αυτό το email επειδή συμμετέχετε στο AgoraX και έχετε ενεργές προαιρετικές ειδοποιήσεις.',
    settings: 'Ρυθμίσεις ειδοποιήσεων',
    unsubscribe: 'Διακοπή όλων των προαιρετικών email',
    sig: 'AgoraX — πλατφόρμα διαβουλευτικής δημοκρατίας',
  },
  en: {
    why: 'You are receiving this because you take part in AgoraX and have optional notifications switched on.',
    settings: 'Notification settings',
    unsubscribe: 'Stop all optional email',
    sig: 'AgoraX — deliberative democracy platform',
  },
};

const SECURITY_FOOTER: Record<MailLocale, string> = {
  el: 'Αυτό είναι email ασφαλείας και αποστέλλεται πάντα — δεν απενεργοποιείται από τις ρυθμίσεις ειδοποιήσεων.',
  en: 'This is a security email and is always sent — it cannot be switched off in notification settings.',
};

function renderHtml(parts: ShellParts): string {
  const { locale, title, paragraphs, cta, note, footer } = parts;
  const f = FOOTER_COPY[locale];

  const body = paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${INK};">${p}</p>`)
    .join('\n            ');

  const button = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 16px;">
              <tr><td style="border-radius:6px;background:${BRAND};">
                <a href="${esc(cta.url)}" style="display:inline-block;padding:13px 26px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">${esc(cta.label)}</a>
              </td></tr>
            </table>
            <p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:${MUTED};word-break:break-all;">${esc(cta.url)}</p>`
    : '';

  const noteHtml = note
    ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:${MUTED};">${note}</p>`
    : '';

  const footerHtml = footer
    ? `<p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:${MUTED};">${esc(f.why)}</p>
            <p style="margin:0 0 8px;font-size:13px;line-height:1.6;">
              <a href="${esc(footer.settingsUrl)}" style="color:${BRAND};">${esc(f.settings)}</a>
              &nbsp;·&nbsp;
              <a href="${esc(footer.unsubscribeUrl)}" style="color:${BRAND};">${esc(f.unsubscribe)}</a>
            </p>`
    : `<p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:${MUTED};">${esc(SECURITY_FOOTER[locale])}</p>`;

  return `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <title>${esc(title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f6f9;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6f9;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid ${LINE};border-radius:10px;">
            <tr><td style="padding:28px 28px 8px;">
              <p style="margin:0 0 4px;font-size:14px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${BRAND};">AgoraX</p>
              <h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;color:${INK};font-weight:700;">${esc(title)}</h1>
            </td></tr>
            <tr><td style="padding:0 28px;">
            ${body}
            ${button}
            ${noteHtml}
            </td></tr>
            <tr><td style="padding:8px 28px 24px;border-top:1px solid ${LINE};">
            ${footerHtml}
              <p style="margin:0;font-size:12px;color:${MUTED};">${esc(f.sig)}</p>
            </td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderText(parts: ShellParts): string {
  const { locale, title, paragraphs, cta, note, footer } = parts;
  const f = FOOTER_COPY[locale];
  const lines: string[] = ['AgoraX', '', title, '='.repeat(Math.min(title.length, 60)), ''];

  for (const p of paragraphs) lines.push(stripTags(p), '');
  if (cta) lines.push(`${cta.label}:`, cta.url, '');
  if (note) lines.push(stripTags(note), '');

  lines.push('---');
  if (footer) {
    lines.push(f.why, '', `${f.settings}: ${footer.settingsUrl}`, `${f.unsubscribe}: ${footer.unsubscribeUrl}`);
  } else {
    lines.push(SECURITY_FOOTER[locale]);
  }
  lines.push('', f.sig);
  return lines.join('\n');
}

/** The paragraphs carry <strong> and nothing else; unwrap for text/plain. */
function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export interface RenderedMail {
  subject: string;
  html: string;
  text: string;
}

function render(subject: string, parts: ShellParts): RenderedMail {
  return { subject, html: renderHtml(parts), text: renderText(parts) };
}

// ─── Security mail — never consults preferences ─────────────────────────────

export function passwordResetEmail(opts: {
  locale: MailLocale;
  name: string;
  resetUrl: string;
  expiresInMinutes: number;
}): RenderedMail {
  const { locale, name, resetUrl, expiresInMinutes } = opts;
  const n = esc(name);

  if (locale === 'en') {
    return render('Reset your AgoraX password', {
      locale,
      title: 'Reset your password',
      paragraphs: [
        `Hello ${n},`,
        'Someone asked to reset the password for the AgoraX account registered to this address. Use the button below to choose a new one.',
        'If that was not you, no action is needed — the link expires on its own and your password stays unchanged.',
      ],
      cta: { label: 'Set a new password', url: resetUrl },
      note: `<strong>This link works once and expires in ${expiresInMinutes} minutes.</strong> Requesting a new one immediately cancels this link.`,
    });
  }

  return render('Επαναφορά κωδικού AgoraX', {
    locale,
    title: 'Επαναφορά κωδικού',
    paragraphs: [
      `Γεια σας ${n},`,
      'Ζητήθηκε επαναφορά κωδικού για τον λογαριασμό AgoraX που είναι δηλωμένος σε αυτή τη διεύθυνση. Χρησιμοποιήστε το κουμπί παρακάτω για να ορίσετε νέο κωδικό.',
      'Αν δεν το ζητήσατε εσείς, δεν χρειάζεται να κάνετε τίποτα — ο σύνδεσμος λήγει μόνος του και ο κωδικός σας παραμένει ο ίδιος.',
    ],
    cta: { label: 'Ορισμός νέου κωδικού', url: resetUrl },
    note: `<strong>Ο σύνδεσμος ισχύει μία φορά και λήγει σε ${expiresInMinutes} λεπτά.</strong> Αν ζητήσετε νέον, αυτός εδώ ακυρώνεται αμέσως.`,
  });
}

export function passwordChangedEmail(opts: {
  locale: MailLocale;
  name: string;
  changedAt: Date;
}): RenderedMail {
  const { locale, name, changedAt } = opts;
  const n = esc(name);
  const when = changedAt.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

  if (locale === 'en') {
    return render('Your AgoraX password was changed', {
      locale,
      title: 'Your password was changed',
      paragraphs: [
        `Hello ${n},`,
        `The password on your AgoraX account was changed on <strong>${esc(when)}</strong>. Every session on every device was signed out, so you will need to sign in again.`,
        'If this was you, nothing further is needed. <strong>If it was not, your account may be compromised</strong> — reset the password immediately and contact the platform administrators.',
      ],
      cta: { label: 'Sign in', url: `${publicUrl()}/auth` },
    });
  }

  return render('Ο κωδικός σας στο AgoraX άλλαξε', {
    locale,
    title: 'Ο κωδικός σας άλλαξε',
    paragraphs: [
      `Γεια σας ${n},`,
      `Ο κωδικός του λογαριασμού σας στο AgoraX άλλαξε στις <strong>${esc(when)}</strong>. Όλες οι συνεδρίες σε όλες τις συσκευές τερματίστηκαν, οπότε θα χρειαστεί να συνδεθείτε ξανά.`,
      'Αν το κάνατε εσείς, δεν χρειάζεται καμία ενέργεια. <strong>Αν όχι, ο λογαριασμός σας ενδέχεται να έχει παραβιαστεί</strong> — κάντε αμέσως επαναφορά κωδικού και ενημερώστε τη διαχείριση της πλατφόρμας.',
    ],
    cta: { label: 'Σύνδεση', url: `${publicUrl()}/auth` },
  });
}

export function verifyEmailEmail(opts: {
  locale: MailLocale;
  name: string;
  verifyUrl: string;
  expiresInHours: number;
}): RenderedMail {
  const { locale, name, verifyUrl, expiresInHours } = opts;
  const n = esc(name);
  const days = Math.round(expiresInHours / 24);

  if (locale === 'en') {
    return render('Confirm your AgoraX email address', {
      locale,
      title: 'Confirm your email address',
      paragraphs: [
        `Hello ${n},`,
        'Confirming your address is how AgoraX can reach you about the proposals and votes in your communities — and how we can get you back into your account if you ever lose your password.',
        'If you did not create an AgoraX account, ignore this message and nothing will happen.',
      ],
      cta: { label: 'Confirm my address', url: verifyUrl },
      note: `<strong>This link expires in ${days} days.</strong> You can ask for a new one any time from your account settings.`,
    });
  }

  return render('Επιβεβαιώστε το email σας στο AgoraX', {
    locale,
    title: 'Επιβεβαίωση διεύθυνσης email',
    paragraphs: [
      `Γεια σας ${n},`,
      'Η επιβεβαίωση της διεύθυνσής σας είναι ο τρόπος με τον οποίο το AgoraX μπορεί να σας ενημερώνει για τις προτάσεις και τις ψηφοφορίες των κοινοτήτων σας — και ο τρόπος να ξαναμπείτε στον λογαριασμό σας αν χάσετε ποτέ τον κωδικό σας.',
      'Αν δεν δημιουργήσατε εσείς λογαριασμό στο AgoraX, αγνοήστε αυτό το μήνυμα και δεν θα συμβεί τίποτα.',
    ],
    cta: { label: 'Επιβεβαίωση διεύθυνσης', url: verifyUrl },
    note: `<strong>Ο σύνδεσμος λήγει σε ${days} ημέρες.</strong> Μπορείτε να ζητήσετε νέον όποτε θέλετε από τις ρυθμίσεις του λογαριασμού σας.`,
  });
}

/**
 * "You asked to reset a password on an account that has none."
 *
 * Half the reason this exists: the reset form must answer identically whether
 * or not an address has an account, so it cannot say "you signed in with
 * Google" — that would disclose the account to anyone probing addresses. But
 * an *email* to that address discloses nothing to a stranger; only the person
 * holding the mailbox reads it. So the uniform response stays uniform and the
 * owner still gets told what to do, instead of waiting for a link that by
 * design will never come.
 */
export function googleAccountEmail(opts: {
  locale: MailLocale;
  name: string;
  loginUrl: string;
}): RenderedMail {
  const { locale, name, loginUrl } = opts;
  const n = esc(name);

  if (locale === 'en') {
    return render('Signing in to AgoraX', {
      locale,
      title: 'This account signs in with Google',
      paragraphs: [
        `Hello ${n},`,
        'Someone asked to reset the password for the AgoraX account on this address. There is no password to reset: this account signs in with Google.',
        'Use the <strong>Sign in with Google</strong> button on the sign-in page and you are in — no password needed, and nothing about your account has changed.',
        'If that was not you, no action is needed.',
      ],
      cta: { label: 'Go to sign-in', url: loginUrl },
    });
  }

  return render('Σύνδεση στο AgoraX', {
    locale,
    title: 'Ο λογαριασμός συνδέεται με Google',
    paragraphs: [
      `Γεια σας ${n},`,
      'Ζητήθηκε επαναφορά κωδικού για τον λογαριασμό AgoraX σε αυτή τη διεύθυνση. Δεν υπάρχει κωδικός να επαναφερθεί: ο λογαριασμός συνδέεται μέσω Google.',
      'Χρησιμοποιήστε το κουμπί <strong>Σύνδεση με Google</strong> στη σελίδα σύνδεσης και μπαίνετε κατευθείαν — χωρίς κωδικό, και χωρίς καμία αλλαγή στον λογαριασμό σας.',
      'Αν δεν το ζητήσατε εσείς, δεν χρειάζεται καμία ενέργεια.',
    ],
    cta: { label: 'Στη σελίδα σύνδεσης', url: loginUrl },
  });
}

// ─── Optional mail — always carries settings + unsubscribe ──────────────────

interface OptionalOpts {
  locale: MailLocale;
  name: string;
  /** Proposal question, poll title, community name — already plain text. */
  subjectLine: string;
  communityName?: string;
  actionUrl: string;
  settingsUrl: string;
  unsubscribeUrl: string;
}

export function communityProposalEmail(o: OptionalOpts): RenderedMail {
  const n = esc(o.name);
  const s = esc(o.subjectLine);
  const c = o.communityName ? esc(o.communityName) : null;
  const footer = { settingsUrl: o.settingsUrl, unsubscribeUrl: o.unsubscribeUrl };

  if (o.locale === 'en') {
    return render('A new proposal in your community', {
      locale: o.locale,
      title: 'A new proposal in your community',
      paragraphs: [
        `Hello ${n},`,
        c
          ? `A new proposal was submitted in <strong>${c}</strong>:`
          : 'A new proposal was submitted in your community:',
        `<strong>${s}</strong>`,
        'It is open for amendments now — this is the stage where the text can still change.',
      ],
      cta: { label: 'Read the proposal', url: o.actionUrl },
      footer,
    });
  }

  return render('Νέα πρόταση στην κοινότητά σας', {
    locale: o.locale,
    title: 'Νέα πρόταση στην κοινότητά σας',
    paragraphs: [
      `Γεια σας ${n},`,
      c
        ? `Υποβλήθηκε νέα πρόταση στην κοινότητα <strong>${c}</strong>:`
        : 'Υποβλήθηκε νέα πρόταση στην κοινότητά σας:',
      `<strong>${s}</strong>`,
      'Είναι ανοιχτή για τροπολογίες — σε αυτό το στάδιο το κείμενο μπορεί ακόμη να αλλάξει.',
    ],
    cta: { label: 'Δείτε την πρόταση', url: o.actionUrl },
    footer,
  });
}

export function votingEmail(o: OptionalOpts): RenderedMail {
  const n = esc(o.name);
  const s = esc(o.subjectLine);
  const footer = { settingsUrl: o.settingsUrl, unsubscribeUrl: o.unsubscribeUrl };

  if (o.locale === 'en') {
    return render('Voting is open', {
      locale: o.locale,
      title: 'Voting is open',
      paragraphs: [
        `Hello ${n},`,
        'A vote you are eligible to take part in has opened:',
        `<strong>${s}</strong>`,
        'Every ballot lands in a tamper-evident record you can re-check yourself after the count.',
      ],
      cta: { label: 'Cast your vote', url: o.actionUrl },
      footer,
    });
  }

  return render('Άνοιξε η ψηφοφορία', {
    locale: o.locale,
    title: 'Άνοιξε η ψηφοφορία',
    paragraphs: [
      `Γεια σας ${n},`,
      'Άνοιξε ψηφοφορία στην οποία δικαιούστε να συμμετάσχετε:',
      `<strong>${s}</strong>`,
      'Κάθε ψήφος καταγράφεται σε αδιάβλητο μητρώο που μπορείτε να επαληθεύσετε και μόνοι σας μετά την καταμέτρηση.',
    ],
    cta: { label: 'Ψηφίστε', url: o.actionUrl },
    footer,
  });
}

export function proposalUpdateEmail(o: OptionalOpts & { updateLine: string }): RenderedMail {
  const n = esc(o.name);
  const s = esc(o.subjectLine);
  const u = esc(o.updateLine);
  const footer = { settingsUrl: o.settingsUrl, unsubscribeUrl: o.unsubscribeUrl };

  if (o.locale === 'en') {
    return render('An update on a proposal you follow', {
      locale: o.locale,
      title: 'An update on a proposal you follow',
      paragraphs: [
        `Hello ${n},`,
        `<strong>${s}</strong>`,
        u,
      ],
      cta: { label: 'See what changed', url: o.actionUrl },
      footer,
    });
  }

  return render('Ενημέρωση σε πρόταση που παρακολουθείτε', {
    locale: o.locale,
    title: 'Ενημέρωση σε πρόταση που παρακολουθείτε',
    paragraphs: [
      `Γεια σας ${n},`,
      `<strong>${s}</strong>`,
      u,
    ],
    cta: { label: 'Δείτε τι άλλαξε', url: o.actionUrl },
    footer,
  });
}
