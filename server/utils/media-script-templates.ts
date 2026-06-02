/**
 * Pure-text Greek script templates — no DB, no IO.
 *
 * Kept separate from media-scripts.ts (which loads data from Postgres)
 * so the templating logic can be unit-tested without spinning a db
 * connection or resolving the @shared schema alias.
 */

const MAX_ARGS_PER_SIDE = 3;
const ARG_MAX_CHARS = 280;
const MAX_AMENDMENTS = 4;
const AMENDMENT_MAX_CHARS = 320;
const MAX_THREADS = 5;
const THREAD_MAX_CHARS = 240;

export interface AmendmentSummary {
  text: string;
  decision: 'accepted' | 'rejected' | 'pending';
}

export interface ThreadSummary {
  text: string;
  upvotes: number;
  downvotes: number;
}

export interface ScriptContext {
  proposal: {
    question: string;
    solution: string;
  };
  communityName: string | null;
  forArgs: string[];
  againstArgs: string[];
  amendments?: AmendmentSummary[];
  threads?: ThreadSummary[];
}

export const SCRIPT_LIMITS = {
  MAX_ARGS_PER_SIDE,
  ARG_MAX_CHARS,
  MAX_AMENDMENTS,
  AMENDMENT_MAX_CHARS,
  MAX_THREADS,
  THREAD_MAX_CHARS,
} as const;

export function trim(text: string, max: number): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= max) return collapsed;
  return collapsed.slice(0, max - 1).replace(/[\s,.;]+$/, '') + '…';
}

export function podcastScript(ctx: ScriptContext): string {
  const { proposal, communityName, forArgs, againstArgs } = ctx;
  const opening = communityName
    ? `Καλώς ήρθατε στο AgoraX. Σήμερα, από την κοινότητα «${communityName}», συζητάμε μια πρόταση που σας αφορά.`
    : `Καλώς ήρθατε στο AgoraX. Σήμερα συζητάμε μια πρόταση που σας αφορά.`;

  const forBlock = forArgs.length
    ? forArgs.map((t, i) => `Β: Επιχείρημα ${i + 1} υπέρ. ${t}`).join('\n\n')
    : `Β: Δεν έχουν κατατεθεί ακόμη επιχειρήματα υπέρ. Καλούμε τα μέλη της κοινότητας να συμμετέχουν στον διάλογο.`;

  const againstBlock = againstArgs.length
    ? againstArgs.map((t, i) => `Α: Επιχείρημα ${i + 1} κατά. ${t}`).join('\n\n')
    : `Α: Δεν έχουν κατατεθεί ακόμη επιχειρήματα κατά. Η εικόνα μπορεί να αλλάξει καθώς προχωρά η διαβούλευση.`;

  const amendmentsBlock = ctx.amendments && ctx.amendments.length
    ? [
        ``,
        `## Τροπολογίες & βελτιώσεις`,
        `Α: Η κοινότητα έχει καταθέσει και συγκεκριμένες αντιπροτάσεις. Ας τις δούμε.`,
        ...ctx.amendments.map((a, i) => {
          const tag = a.decision === 'accepted' ? '[αποδεκτή]'
            : a.decision === 'rejected' ? '[απορρίφθηκε]'
            : '[εκκρεμεί]';
          return `Β: Τροπολογία ${i + 1} ${tag}. ${a.text}`;
        }),
      ].join('\n')
    : '';

  const threadsBlock = ctx.threads && ctx.threads.length
    ? [
        ``,
        `## Από τη συζήτηση της κοινότητας`,
        `Α: Δείτε δείγμα από όσα έχουν γραφτεί στο νήμα συζήτησης.`,
        ...ctx.threads.map((t, i) => {
          const net = (t.upvotes || 0) - (t.downvotes || 0);
          const score = net > 0 ? `(+${net})` : net < 0 ? `(${net})` : '';
          return `Β: Σχόλιο ${i + 1} ${score}. ${t.text}`.trim();
        }),
      ].join('\n')
    : '';

  return [
    `# Σενάριο podcast — AgoraX`,
    ``,
    `Φωνή Α (παρουσιαστής/ρια) · Φωνή Β (αναλυτής/τρια)`,
    `Διάρκεια στόχος: 3–5 λεπτά.`,
    `Τόνος: ψύχραιμος, ενημερωτικός, χωρίς επικριτικό ύφος.`,
    ``,
    `## Εισαγωγή`,
    `Α: ${opening}`,
    ``,
    `## Το ερώτημα`,
    `Α: Το ερώτημα που τέθηκε στην κοινότητα είναι το εξής:`,
    `Β: «${trim(proposal.question, 600)}»`,
    ``,
    `## Η προτεινόμενη λύση`,
    `Α: Η πρόταση που έχει τεθεί υπό διαβούλευση προτείνει:`,
    `Β: ${trim(proposal.solution, 900)}`,
    ``,
    `## Τι λένε όσοι υποστηρίζουν την πρόταση`,
    `Α: Ας ακούσουμε πρώτα την πλευρά που συμφωνεί.`,
    forBlock,
    ``,
    `## Τι λένε όσοι αντιτίθενται`,
    `Α: Και τώρα τα επιχειρήματα κατά.`,
    againstBlock,
    amendmentsBlock,
    threadsBlock,
    ``,
    `## Σύνοψη & κάλεσμα`,
    `Α: Αυτά τα επιχειρήματα δεν είναι τα μόνα. Η δική σας φωνή λείπει.`,
    `Β: Μπείτε στο AgoraX, διαβάστε όλη την πρόταση, καταθέστε ένα επιχείρημα ή μια τροπολογία, και ψηφίστε όταν ανοίξει η ψηφοφορία.`,
    `Α: Η δημοκρατία γίνεται καλύτερη όταν συμμετέχουμε ενημερωμένοι. Ευχαριστούμε που μας ακούσατε.`,
  ].join('\n');
}

export function teaserScript(ctx: ScriptContext): string {
  const { proposal, communityName, forArgs, againstArgs } = ctx;
  const hookCommunity = communityName ? `από την κοινότητα «${communityName}»` : `από την κοινότητα της AgoraX`;
  const proLine = forArgs[0] ? `Υπέρ λένε: ${trim(forArgs[0], 180)}` : `Υπέρ: η συζήτηση είναι ανοιχτή — μπορείτε να καταθέσετε το πρώτο επιχείρημα.`;
  const conLine = againstArgs[0] ? `Κατά λένε: ${trim(againstArgs[0], 180)}` : `Κατά: η συζήτηση είναι ανοιχτή — μπορείτε να καταθέσετε το πρώτο επιχείρημα.`;

  return [
    `# Σενάριο σύντομου βίντεο (~45 δευτερόλεπτα) — AgoraX`,
    ``,
    `Τόνος: άμεσος, καθαρός. Έντονη εικόνα στις πρώτες τρεις σκηνές.`,
    `Στόχος: να οδηγήσει τον θεατή να μπει στην πλατφόρμα και να ψηφίσει.`,
    ``,
    `## Σκηνή 1 — Hook (0:00–0:05)`,
    `Πλάνο: τίτλος στην οθόνη.`,
    `Αφήγηση: Μια καινούργια πρόταση είναι σε διαβούλευση ${hookCommunity}.`,
    ``,
    `## Σκηνή 2 — Το ερώτημα (0:05–0:15)`,
    `Πλάνο: κάρτα κειμένου με το ερώτημα.`,
    `Αφήγηση: ${trim(proposal.question, 220)}`,
    ``,
    `## Σκηνή 3 — Η πρόταση (0:15–0:25)`,
    `Πλάνο: σύντομη υπογράμμιση των βασικών σημείων.`,
    `Αφήγηση: ${trim(proposal.solution, 260)}`,
    ``,
    `## Σκηνή 4 — Δύο πλευρές (0:25–0:38)`,
    `Πλάνο: split-screen ή δύο εικονίδια.`,
    `Αφήγηση: ${proLine}`,
    `Αφήγηση: ${conLine}`,
    ``,
    `## Σκηνή 5 — Κάλεσμα δράσης (0:38–0:45)`,
    `Πλάνο: λογότυπο AgoraX, διεύθυνση πλατφόρμας.`,
    `Αφήγηση: Διαβάστε την πρόταση, καταθέστε το επιχείρημά σας, ψηφίστε. AgoraX — η δημοκρατία γίνεται καλύτερη όταν συμμετέχουμε.`,
  ].join('\n');
}
