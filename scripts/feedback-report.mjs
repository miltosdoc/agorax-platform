#!/usr/bin/env node
/**
 * Builds feedback/REVIEW.md from the raw feedback/*.json drops.
 *
 * The folder is append-only: the in-app feedback widget writes one JSON file
 * per submission and nothing ever reads them back. This script gives that pile
 * a shape — it groups the submissions by *topic* rather than by date, so the
 * same request reported six times by four people reads as one line item with a
 * weight, not six entries scattered across a month.
 *
 * TRIAGE below is the only hand-maintained part. Anything not listed there
 * lands in an "Αδιαλογάριαστα" section at the end of the report, so new
 * feedback is loud rather than silently dropped. Run after every batch:
 *
 *   node scripts/feedback-report.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'feedback');
const OUT = path.join(DIR, 'REVIEW.md');

// ── Themes ───────────────────────────────────────────────────────────────────
const THEMES = {
  STRUCT: 'Δομή πρότασης, τροπολογίες, αντιπροτάσεις',
  PHASE: 'Φάσεις, χρόνοι και ροή',
  TALK: 'Συζήτηση και σχολιασμός',
  VOTE: 'Ψηφοφορία',
  NOTIF: 'Ειδοποιήσεις',
  COMM: 'Κοινότητες',
  DISC: 'Ανακάλυψη, ταξινόμηση, φιλτράρισμα',
  UI: 'Σχεδίαση και χρηστικότητα',
  ACCT: 'Εγγραφή, λογαριασμός, προφίλ',
  AI: 'Τεχνητή νοημοσύνη και έλεγχος',
  DOC: 'Τεκμηρίωση και εκπαίδευση',
  NOISE: 'Εκτός διαλογής',
};
const THEME_ORDER = ['STRUCT', 'TALK', 'PHASE', 'VOTE', 'NOTIF', 'COMM', 'DISC', 'UI', 'ACCT', 'AI', 'DOC', 'NOISE'];

const STATUS = {
  done: { label: '✅ Έγινε', rank: 3 },
  partial: { label: '🟡 Μερικώς', rank: 2 },
  open: { label: '⬜ Ανοιχτό', rank: 1 },
  decision: { label: '🔵 Θέλει απόφαση', rank: 0 },
  noise: { label: '⚪ Εκτός', rank: 4 },
};

// ── Διαλογή από τη σελίδα ────────────────────────────────────────────────────
// Το TRIAGE παρακάτω ήταν επί χρόνια το μόνο σημείο που γραφόταν με το χέρι:
// για να μπει μια καινούργια καταχώρηση σε θέμα, έπρεπε να ανοίξει κανείς
// αυτό το αρχείο. Πλέον ο διαχειριστής κάνει την ίδια δουλειά μέσα από το
// /admin/feedback-review, και η επιλογή του γράφεται στο feedback/triage.json.
//
// Το αρχείο κρατάει τρία πράγματα ανά καταχώρηση: σε ποια θέματα ανήκει, τι
// προτεραιότητα της έδωσε ο διαχειριστής, και ποιος το έκανε πότε. Κρατάει
// επίσης όσα θέματα φτιάχτηκαν από τη σελίδα, γιατί μια νέα αναφορά συχνά δεν
// χωράει σε κανένα από τα υπάρχοντα.
//
// Ό,τι λέει το αρχείο υπερισχύει του TRIAGE για το ίδιο κλειδί — ώστε μια
// διόρθωση από τη σελίδα να μη γυρίζει πίσω στην επόμενη νυχτερινή παραγωγή.
const PRIO = {
  1: { label: 'Άμεσα', short: 'Π1' },
  2: { label: 'Σε σειρά', short: 'Π2' },
  3: { label: 'Αργότερα', short: 'Π3' },
};
const STORE_FILE = 'triage.json';
const STORE = (() => {
  const empty = { entries: {}, topics: {} };
  const f = path.join(DIR, STORE_FILE);
  if (!fs.existsSync(f)) return empty;
  try {
    const p = JSON.parse(fs.readFileSync(f, 'utf8'));
    return {
      entries: (p && typeof p.entries === 'object' && p.entries) || {},
      topics: (p && typeof p.topics === 'object' && p.topics) || {},
    };
  } catch {
    // Χαλασμένο αρχείο δεν ρίχνει την παραγωγή: γυρνάμε στη διαλογή του
    // script, που είναι πάντα συντακτικά έγκυρη γιατί ζει μέσα στον κώδικα.
    return empty;
  }
})();

// ── Topics ───────────────────────────────────────────────────────────────────
// slug: [label, theme, status, note?]
const TOPICS = {
  // STRUCT
  'numbered-paragraphs': ['Αριθμημένες παράγραφοι, τροπολογία επί συγκεκριμένης παραγράφου', 'STRUCT', 'open'],
  'proposal-as-alternatives': ['Η πρόταση ως λίστα εναλλακτικών κάτω από ένα πρόβλημα', 'STRUCT', 'open'],
  'counter-proposal-approval': ['Οι αντιπροτάσεις να μη χρειάζονται έγκριση του αρχικού συγγραφέα', 'STRUCT', 'open'],
  'counter-proposal-regression': ['Δεν γίνεται αντιπρόταση, μόνο βελτίωση', 'STRUCT', 'open',
    'Αναφέρθηκε 13/08 ως οπισθοδρόμηση. Στον κώδικα η επιλογή «Αντιπρόταση» υπάρχει, αλλά μόνο όσο η πρόταση είναι σε draft/author_review/community_signal (AmendmentsPanel.tsx:130), και εξαφανίζεται όταν απαντάς σε υπάρχουσα αντιπρόταση (:140, ένα επίπεδο μόνο). Θέλει επιβεβαίωση με τον χρήστη σε ποια φάση ήταν.'],
  'amendment-decision-stale': ['Οι κριμένες τροπολογίες εμφανίζονται ακόμη ως εκκρεμείς', 'STRUCT', 'open'],
  'amendment-decision-reversible': ['Ο συγγραφέας να αλλάζει απόφαση σε τροπολογία εκ των υστέρων', 'STRUCT', 'open'],
  'amendment-review-ux': ['Στην κρίση τροπολογιών να φαίνονται οι ψήφοι κάθε τροπολογίας', 'STRUCT', 'open'],
  'word-limits': ['Όριο λέξεων σε προτάσεις και αντιπροτάσεις', 'STRUCT', 'open'],
  'draft-save': ['Αποθήκευση πρόχειρης πρότασης πριν την υποβολή', 'STRUCT', 'done',
    'Υπάρχει: κατάσταση draft με δικαίωμα επεξεργασίας μόνο στον συγγραφέα (proposals.ts:264).'],
  'ai-amendment-writing': ['Βοήθεια ΤΝ στη σύνταξη τροπολογίας από απλή περιγραφή', 'STRUCT', 'open'],
  'anonymous-deliberation': ['Ανώνυμες προτάσεις/τροπολογίες στη φάση του προθαλάμου', 'STRUCT', 'open'],
  'edit-after-submit': ['Διόρθωση κειμένου μετά την υποβολή', 'STRUCT', 'open',
    'Σήμερα επιτρέπεται μόνο σε draft (proposals.ts:264). Μετά την υποβολή, ούτε ορθογραφικό.'],
  'submit-vs-publish': ['Χωριστά κουμπιά «υποβολή για έλεγχο» και «δημοσίευση στην κοινότητα»', 'STRUCT', 'open'],

  // TALK
  'amendment-comments': ['Σχολιασμός κάτω από κάθε τροπολογία', 'TALK', 'done',
    'Υλοποιήθηκε: πίνακας amendment_comments, δύο διαδρομές API, πάνελ στη στήλη τροπολογιών.'],
  'talk-during-voting': ['Ο διάλογος να μένει ανοιχτός κατά την ψηφοφορία', 'TALK', 'done',
    'Το voting και το final_review μπήκαν στα DEBATE_ACTIVE_STATES. Έκλεινε το «Νέο Νήμα» με σφάλμα.'],
  'rename-terms': ['Μετονομασία όρων ώστε να μη μπερδεύεται διάλογος με διαβούλευση', 'TALK', 'done',
    'Η καρτέλα «Διαβούλευση» έγινε «Συζήτηση» και οι «Τροπολογίες» έγιναν «Διαβούλευση», σε ελληνικά και αγγλικά.'],
  'community-chat': ['Εσωτερικό chat ανά κοινότητα', 'TALK', 'open'],
  'basic-advanced': ['Δύο είδη διαβούλευσης: basic μόνο βελτιώσεις, advanced και αντιπροτάσεις', 'TALK', 'open'],

  // PHASE
  'author-sets-duration': ['Ο συγγραφέας να ορίζει τη διάρκεια διαβούλευσης και ψηφοφορίας', 'PHASE', 'partial',
    'Το πεδίο υπάρχει από τις 25/07 στη φόρμα πρότασης, με όρια που θέτει η κοινότητα. Η τελευταία αναφορά όμως είναι της 06/08 και ζητάει να ορίζεται «σε ελληνικά και αγγλικά»: οι ετικέτες του πεδίου δεν είχαν μεταφραστεί ποτέ και έβγαιναν πάντα στα ελληνικά. Διορθώθηκε. Μένει η διάρκεια της ίδιας της ψηφοφορίας, που ορίζεται μόνο στο vote track.'],
  'phase-time-visible': ['Ο χρόνος και η φάση να φαίνονται δίπλα στην πρόταση', 'PHASE', 'partial'],
  'phase-explanations': ['Επεξήγηση κάθε βήματος όταν κλικάρεις τα σήματα φάσης', 'PHASE', 'open'],
  'stuck-proposal': ['Πρόταση κολλημένη στη διαβούλευση χωρίς αντίστροφη μέτρηση', 'PHASE', 'partial',
    'Ο μηχανισμός διορθώθηκε (computePhaseDeadline). Οι προτάσεις #23 και #35 έχουν ακόμη κενή προθεσμία και θέλουν χειροκίνητη ρύθμιση.'],
  'track-choice': ['Επιλογή διαβούλευσης ή απευθείας ψηφοφορίας κατά την υποβολή', 'PHASE', 'done'],
  'amendments-timing': ['Οι τροπολογίες να επιτρέπονται στην τελική φάση, όχι στην αρχική', 'PHASE', 'open'],
  'delete-proposal': ['Διαγραφή διαβούλευσης/πρότασης', 'PHASE', 'open'],

  // VOTE
  'vote-column-stale': ['Η στήλη ψηφοφορίας δεν ανανεώνεται όταν αλλάζεις πρόταση', 'VOTE', 'open',
    'Σοβαρό: ο χρήστης νομίζει ότι ψήφισε ενώ δεν ψήφισε. Θέλει ανανέωση σελίδας.'],
  'vote-error': ['Σφάλμα κατά την ψήφο ενώ η πρόταση φαίνεται σε ψηφοφορία', 'VOTE', 'partial',
    'Πιθανώς η ίδια αιτία με το σφάλμα που έστελνε τις διαβουλεύσεις κατευθείαν σε ψηφοφορία, το οποίο διορθώθηκε. Θέλει επιβεβαίωση.'],
  'hide-live-tally': ['Να μη φαίνεται η εξέλιξη της ψηφοφορίας πριν λήξει η προθεσμία', 'VOTE', 'open'],
  'cta-after-close': ['Το «Διαβάστε & Ψηφίστε» παραμένει ενεργό μετά τη λήξη', 'VOTE', 'open'],
  'referendum-priority': ['Δημοψηφίσματα με χρόνο παραμονής, λίστα προτεραιότητας, αποτελέσματα στην αρχική', 'VOTE', 'open'],
  'vote-sort': ['Χρονολογική ταξινόμηση ενεργών ψηφοφοριών', 'VOTE', 'open'],

  // NOTIF
  'mobile-notifications': ['Δεν έρχονται ειδοποιήσεις στο κινητό', 'NOTIF', 'open',
    'Δεν λείπει κώδικας: λείπουν κλειδιά VAPID, οπότε το push σιωπά χωρίς σφάλμα.'],
  'notif-preferences': ['Επιλογές στο τι ειδοποιήσεις λαμβάνει ο χρήστης', 'NOTIF', 'open'],
  'notif-missing': ['Δεν ήρθε ειδοποίηση για τροπολογία σε δική μου πρόταση', 'NOTIF', 'open'],
  'notif-badge-empty': ['Το καμπανάκι δείχνει αριθμό αλλά δεν εμφανίζει ειδοποιήσεις', 'NOTIF', 'open'],
  'notif-truncated': ['Δεν φαίνεται ολόκληρο το κείμενο της ειδοποίησης', 'NOTIF', 'open'],
  'broadcast-announcement': ['Ανακοίνωση προς τη Γενική Κοινότητα από τη σχεδιαστική ομάδα', 'NOTIF', 'partial'],

  // COMM
  'member-list': ['Να βλέπουμε τα μέλη μιας κοινότητας με τα ονόματά τους', 'COMM', 'open',
    'Η διαδρομή GET /api/communities/:id/members υπάρχει· το θέμα είναι καθαρά στη διεπαφή.'],
  'delete-community': ['Διαγραφή κοινότητας', 'COMM', 'open',
    'Επιβεβαιωμένο κενό: δεν υπάρχει καθόλου διαδρομή DELETE /api/communities/:id.'],
  'cleanup-communities': ['Καθαρισμός δοκιμαστικών κοινοτήτων', 'COMM', 'decision',
    'Εκκρεμεί και η κοινότητα 8, της οποίας ο ιδρυτής είναι διαγραμμένος λογαριασμός: 0 προτάσεις, 1 ενεργό μέλος, κανένας διαχειριστής. Χωρίς διαδρομή διαγραφής κοινότητας (βλ. παραπάνω) ο καθαρισμός γίνεται μόνο με SQL.'],
  'edit-community': ['Επεξεργασία ονόματος κοινότητας μετά τη δημιουργία', 'COMM', 'open'],
  'private-deliberations': ['Ιδιωτικές διαβουλεύσεις ορατές μόνο στα μέλη', 'COMM', 'open'],
  'private-content-setting': ['Η ρύθμιση «μη δημόσιο περιεχόμενο» δεν εφαρμόζεται', 'COMM', 'open'],
  'invite-flow': ['Λείπει η διαδικασία αποστολής πρόσκλησης', 'COMM', 'partial'],
  'hide-member-names': ['Επιλογή απόκρυψης ονομάτων μελών', 'COMM', 'open'],
  'admins-label-bug': ['Γράφει «Χωρίς διαχειριστές» ενώ υπάρχουν', 'COMM', 'partial',
    'Σχετίζεται με τα adminIds. Καθαρίστηκε μια κρεμασμένη εγγραφή διαγραμμένου χρήστη· η ετικέτα θέλει ξεχωριστό έλεγχο.'],
  'community-impact-scope': ['Οι μετρήσεις αντικτύπου δείχνουν συνολικά, όχι της κοινότητας', 'COMM', 'open'],
  'vote-only-community': ['Κοινότητα χωρίς διαβούλευση, μόνο ψηφοφορίες', 'COMM', 'open'],
  'general-community-autojoin': ['Αυτόματη ένταξη στη Γενική Κοινότητα', 'COMM', 'done',
    'Κάθε νέος χρήστης εντάσσεται αυτόματα και μπορεί να αποχωρήσει.'],

  // DISC
  'proposal-ranking': ['Ταξινόμηση προτάσεων με βάση το ενδιαφέρον της κοινότητας', 'DISC', 'open',
    'Ζητήθηκε ως βελάκια, ως κλίμακα -5..5, ως like και ως ταξινόμηση δημοφιλίας.'],
  'interest-tags': ['Τομείς ενδιαφέροντος και εξατομικευμένη ροή', 'DISC', 'open'],
  'folders-topics': ['Φάκελοι/θεματικές για ομαδοποίηση σχετικών διαβουλεύσεων', 'DISC', 'open'],
  'community-sort': ['Η Γενική Κοινότητα πρώτη, οι υπόλοιπες κατά συμμετοχή', 'DISC', 'open'],
  'home-filters': ['Φίλτρα κατηγορίας και σταδίου στην αρχική', 'DISC', 'open'],
  'merge-similar': ['Εντοπισμός και συγχώνευση σχεδόν ταυτόσημων προτάσεων', 'DISC', 'open'],
  'proposal-community-label': ['Η σελίδα πρότασης δεν δείχνει σε ποια κοινότητα ανήκει', 'DISC', 'open'],

  // UI
  'visual-design': ['Γενική αισθητική αναβάθμιση', 'UI', 'open'],
  'simplify-ui': ['Απλοποίηση: αφαίρεση στοιχείων που δεν λειτουργούν ακόμη', 'UI', 'open'],
  'home-page-simplify': ['Απλούστερη αρχική σελίδα', 'UI', 'open'],
  'settings-explanations': ['Επεξήγηση κάθε ρύθμισης και επιλογής κοινότητας', 'UI', 'open'],
  'community-list-visual': ['Οπτικός διαχωρισμός των κοινοτήτων στη λίστα', 'UI', 'open'],
  'leftover-ui': ['Λειτουργία που ξεχάστηκε να αφαιρεθεί', 'UI', 'open'],
  'cta-invisible': ['Το call to action δεν φαίνεται στην αρχική', 'UI', 'open'],
  'submit-time-display': ['Να φαίνεται και η ώρα υποβολής, όχι μόνο η ημέρα', 'UI', 'open'],
  'beta-subtitle': ['Υπότιτλος «Δοκιμαστική Εφαρμογή» κάτω από τον τίτλο', 'UI', 'open'],
  'ios-app': ['Εφαρμογή και για Apple', 'UI', 'open'],
  'livekit-share': ['Ο διαμοιρασμός οθόνης δεν λειτουργεί', 'UI', 'open'],
  'livekit-camera': ['Ο χρήστης δεν βλέπει την κάμερά του στη διάσκεψη', 'UI', 'open'],

  // ACCT
  'govgr': ['Επαλήθευση Gov.gr', 'ACCT', 'done',
    'Αφαιρέθηκε πλήρως από τη διεπαφή, τα κείμενα και τις ρυθμίσεις κοινότητας.'],
  'registration-fail': ['Αποτυχία εγγραφής με μη κατανοητό μήνυμα', 'ACCT', 'open',
    'Δύο αναφορές, η μία μέσω της φόρμας επικοινωνίας από χρήστη που δεν κατάφερε καν να εγγραφεί και περιμένει ακόμη απάντηση (τα στοιχεία του στο αντίστοιχο contact-*.json).'],
  'password-visibility': ['Εμφάνιση και επιβεβαίωση κωδικού στην εγγραφή', 'ACCT', 'open'],
  'contact-channel': ['Κανάλι επικοινωνίας για προβλήματα', 'ACCT', 'partial'],
  'edit-profile': ['Επεξεργασία ονόματος και email στο προφίλ', 'ACCT', 'open'],
  'invite-guarantee-copy': ['«Ο προσκαλών εγγυάται»: ποιες είναι οι συνέπειες;', 'ACCT', 'decision',
    'Νομικό ερώτημα επί του κειμένου των όρων, όχι σφάλμα.'],

  // AI
  'ai-strictness': ['Αυστηρότητα του ελέγχου ΤΝ στις υποβολές', 'AI', 'open',
    'Ζητήθηκε και προς τις δύο κατευθύνσεις: αυστηρότερα για άσχετες προτάσεις, χαλαρότερα στη δοκιμαστική φάση.'],
  'merge-rerun': ['Η επανεκτέλεση της συγχώνευσης δεν δουλεύει σωστά', 'AI', 'open'],
  'ai-final-text-empty': ['Χωρίς τροπολογίες δεν πρέπει να εμφανίζεται τελικό κείμενο ΤΝ', 'AI', 'open'],

  // DOC
  'explainer-video': ['Επεξηγηματικά βίντεο χρήσης', 'DOC', 'open'],

  // NOISE
  philosophy: ['Σχόλιο επί της αυτοοργάνωσης', 'NOISE', 'noise'],
  junk: ['Δοκιμαστική καταχώρηση', 'NOISE', 'noise'],
};

// Θέματα που έφτιαξε ο διαχειριστής από τη σελίδα. Μπαίνουν δίπλα στα
// παραπάνω και συμπεριφέρονται ολόιδια· η μόνη διαφορά είναι ότι ζουν στο
// triage.json αντί για εδώ, γιατί κανείς δεν θα άνοιγε το script στις 11 το
// βράδυ για να καταχωρήσει ένα καινούργιο αίτημα.
for (const [slug, t] of Object.entries(STORE.topics)) {
  if (TOPICS[slug] || !t || !t.label || !THEMES[t.theme]) continue;
  TOPICS[slug] = [String(t.label), t.theme, STATUS[t.status] ? t.status : 'open', t.note ? String(t.note) : undefined];
}

// ── Triage: createdAt (μέχρι δευτερόλεπτο) → topics ──────────────────────────
const TRIAGE = {
  '2026-07-03T07:13:51': ['ai-amendment-writing'],
  '2026-07-03T07:39:59': ['draft-save'],
  '2026-07-03T08:59:10': ['folders-topics', 'anonymous-deliberation', 'explainer-video'],
  '2026-07-03T17:37:13': ['notif-preferences'],
  '2026-07-05T06:14:20': ['vote-only-community', 'amendments-timing', 'numbered-paragraphs'],
  '2026-07-05T06:54:22': ['proposal-as-alternatives'],
  '2026-07-06T09:54:19': ['folders-topics'],
  '2026-07-06T09:54:41': ['notif-missing'],
  '2026-07-06T10:00:59': ['numbered-paragraphs'],
  '2026-07-06T10:39:20': ['member-list'],
  '2026-07-06T11:00:25': ['phase-explanations'],
  '2026-07-08T07:00:42': ['amendment-decision-stale'],
  '2026-07-09T16:18:58': ['govgr'],
  '2026-07-09T18:31:34': ['livekit-share'],
  '2026-07-09T18:31:59': ['livekit-camera'],
  '2026-07-09T20:40:37': ['merge-rerun'],
  '2026-07-09T20:45:04': ['track-choice'],
  '2026-07-09T20:46:26': ['delete-proposal'],
  '2026-07-09T21:14:04': ['govgr'],
  '2026-07-10T03:24:32': ['proposal-ranking'],
  '2026-07-10T03:24:46': ['general-community-autojoin'],
  '2026-07-11T08:01:10': ['phase-time-visible'],
  '2026-07-11T14:05:27': ['notif-badge-empty'],
  '2026-07-13T08:52:33': ['beta-subtitle'],
  '2026-07-13T09:43:32': ['author-sets-duration'],
  '2026-07-13T09:45:28': ['leftover-ui'],
  '2026-07-13T10:25:03': ['ai-strictness'],
  '2026-07-13T10:30:57': ['member-list'],
  '2026-07-13T11:22:19': ['rename-terms'],
  '2026-07-13T17:23:27': ['philosophy'],
  '2026-07-14T12:16:19': ['govgr'],
  '2026-07-14T19:18:02': ['visual-design'],
  '2026-07-14T19:19:07': ['visual-design'],
  '2026-07-14T19:45:47': ['merge-similar'],
  '2026-07-15T06:00:23': ['explainer-video', 'simplify-ui', 'basic-advanced', 'proposal-ranking', 'talk-during-voting', 'ios-app'],
  '2026-07-15T07:12:33': ['interest-tags'],
  '2026-07-15T07:33:00': ['rename-terms'],
  '2026-07-15T11:00:21': ['author-sets-duration'],
  '2026-07-15T11:16:11': ['author-sets-duration'],
  '2026-07-16T18:35:57': ['settings-explanations'],
  '2026-07-16T19:27:31': ['junk'],
  '2026-07-17T06:45:00': ['home-page-simplify'],
  '2026-07-17T07:03:15': ['home-page-simplify'],
  '2026-07-18T17:31:05': ['private-deliberations'],
  '2026-07-19T08:19:59': ['mobile-notifications'],
  '2026-07-20T20:27:09': ['ai-strictness'],
  '2026-07-20T22:23:35': ['talk-during-voting'],
  '2026-07-23T19:12:00': ['settings-explanations'],
  '2026-07-23T22:07:51': ['edit-community'],
  '2026-07-23T22:12:42': ['community-impact-scope'],
  '2026-07-24T19:01:15': ['proposal-ranking'],
  '2026-07-25T06:47:52': ['amendment-decision-stale'],
  '2026-07-25T08:21:41': ['amendment-review-ux'],
  '2026-07-25T09:40:16': ['notif-truncated'],
  '2026-07-25T13:38:37': ['mobile-notifications', 'phase-time-visible', 'rename-terms'],
  '2026-07-25T14:16:55': ['broadcast-announcement'],
  '2026-07-25T14:18:52': ['private-content-setting'],
  '2026-07-25T14:27:44': ['counter-proposal-approval'],
  '2026-07-25T19:03:45': ['invite-flow'],
  '2026-07-25T19:25:28': ['admins-label-bug'],
  '2026-07-25T19:34:00': ['community-sort'],
  '2026-07-26T08:44:10': ['amendment-decision-reversible'],
  '2026-07-26T08:45:31': ['vote-sort'],
  '2026-07-26T08:45:45': ['referendum-priority'],
  '2026-07-26T08:46:09': ['home-filters'],
  '2026-07-26T08:46:25': ['settings-explanations'],
  '2026-07-26T08:46:36': ['community-sort'],
  '2026-07-26T08:47:37': ['edit-profile'],
  '2026-07-26T08:47:49': ['community-chat'],
  '2026-07-26T08:48:46': ['rename-terms'],
  '2026-07-26T08:49:06': ['counter-proposal-approval'],
  '2026-07-26T08:50:00': ['referendum-priority'],
  '2026-07-26T08:50:25': ['word-limits', 'proposal-ranking', 'merge-similar'],
  '2026-07-26T10:23:42': ['proposal-community-label'],
  '2026-07-26T10:26:24': ['talk-during-voting'],
  '2026-07-26T10:58:06': ['amendment-comments'],
  '2026-07-26T11:07:14': ['merge-similar'],
  '2026-07-26T20:29:17': ['rename-terms'],
  '2026-07-27T06:29:38': ['community-list-visual'],
  '2026-07-27T07:06:16': ['amendment-comments', 'rename-terms'],
  '2026-07-28T13:38:03': ['vote-error'],
  '2026-07-29T10:46:08': ['registration-fail', 'password-visibility', 'contact-channel'],
  '2026-07-30T06:08:21': ['delete-community'],
  '2026-07-30T15:22:32': ['registration-fail'],
  '2026-07-30T16:20:54': ['edit-after-submit'],
  '2026-07-30T18:40:19': ['hide-member-names'],
  '2026-08-01T09:10:48': ['ai-final-text-empty'],
  '2026-08-01T12:21:04': ['edit-after-submit'],
  '2026-08-01T15:45:08': ['interest-tags'],
  '2026-08-02T08:41:37': ['cta-after-close'],
  '2026-08-02T23:30:39': ['submit-time-display'],
  '2026-08-03T05:53:32': ['stuck-proposal'],
  '2026-08-03T12:50:37': ['hide-live-tally'],
  '2026-08-04T19:57:04': ['proposal-ranking'],
  '2026-08-04T20:29:56': ['cta-invisible'],
  '2026-08-06T11:19:21': ['vote-column-stale'],
  '2026-08-06T12:26:31': ['submit-vs-publish'],
  '2026-08-06T13:23:31': ['member-list'],
  '2026-08-06T13:35:15': ['cleanup-communities'],
  '2026-08-06T18:27:19': ['author-sets-duration'],
  '2026-08-12T10:23:47': ['invite-guarantee-copy'],
  '2026-08-13T06:38:10': ['counter-proposal-regression'],
};

// Η διαλογή που ισχύει πραγματικά: ό,τι όρισε ο διαχειριστής από τη σελίδα,
// αλλιώς ό,τι λέει το TRIAGE. Άδεια λίστα από τη σελίδα σημαίνει «το ξε-όρισα»
// και το στέλνει πίσω στα αδιαλογάριαστα — γι' αυτό ελέγχουμε Array.isArray
// και όχι απλώς αν υπάρχει κάτι.
const adminTopics = key => {
  const rec = STORE.entries[key];
  return Array.isArray(rec?.topics) ? rec.topics.filter(s => TOPICS[s]) : null;
};
const topicsFor = key => adminTopics(key) ?? TRIAGE[key] ?? null;
const prioOf = key => (PRIO[STORE.entries[key]?.prio] ? STORE.entries[key].prio : 0);
const triagedBy = key => STORE.entries[key] || null;

// ── Load ─────────────────────────────────────────────────────────────────────
const entries = fs.readdirSync(DIR)
  // Ο φάκελος κρατάει και το triage.json, που δεν είναι καταχώρηση αλλά η
  // διαλογή του διαχειριστή: χωρίς αυτή την εξαίρεση περνούσε ως
  // ανατροφοδότηση χωρίς createdAt και έριχνε ολόκληρη την παραγωγή.
  .filter(f => f.endsWith('.json') && f !== STORE_FILE)
  .map(f => {
    const j = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    return { file: f, key: (j.createdAt || '').slice(0, 19), ...j };
  })
  .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));

const who = e => (e.username || '').trim() || (e.replyTo ? `«${e.replyTo}»` : 'ανώνυμος');
const when = e => (e.createdAt || '').slice(0, 10);

const untriaged = [];
const byTopic = new Map();
for (const e of entries) {
  const slugs = topicsFor(e.key);
  // Άγνωστο slug από το TRIAGE είναι λάθος του κώδικα και πρέπει να ουρλιάξει.
  // Από το triage.json όμως το έχει ήδη κόψει το adminTopics(): εκεί ένα slug
  // που έσβησε από το TOPICS σημαίνει απλώς παλιά διαλογή, όχι σφάλμα.
  if (!slugs || !slugs.length) { untriaged.push(e); continue; }
  for (const s of slugs) {
    if (!TOPICS[s]) throw new Error(`Άγνωστο topic "${s}" στο ${e.file}`);
    if (!byTopic.has(s)) byTopic.set(s, []);
    byTopic.get(s).push(e);
  }
}

const staleKeys = Object.keys(TRIAGE).filter(k => !entries.some(e => e.key === k));

// ── Render ───────────────────────────────────────────────────────────────────
const reportersOf = s => [...new Set(byTopic.get(s).map(who))];
const slugs = [...byTopic.keys()];

const countBy = pred => slugs.filter(s => TOPICS[s][2] === pred).length;
const users = [...new Set(entries.map(who))];
const shots = entries.filter(e => e.screenshot).length;
const span = `${when(entries[0])} → ${when(entries[entries.length - 1])}`;

const L = [];
L.push('# Αξιολόγηση ανατροφοδότησης χρηστών');
L.push('');
L.push(`_Παράγεται από \`scripts/feedback-report.mjs\`. Μην το επεξεργάζεστε χειροκίνητα — αλλάξτε τη διαλογή στο script και ξανατρέξτε το._`);
L.push('');
L.push(`**${entries.length} καταχωρήσεις** από **${users.length} χρήστες**, ${span}. ${shots} με στιγμιότυπο.`);
L.push(`Ομαδοποιούνται σε **${slugs.length} θέματα**: ${countBy('done')} έγιναν, ${countBy('partial')} μερικώς, ${countBy('open')} ανοιχτά, ${countBy('decision')} θέλουν απόφαση.`);
L.push('');

// Ποιος μιλάει
L.push('## Ποιος μιλάει');
L.push('');
const perUser = users.map(u => [u, entries.filter(e => who(e) === u).length]).sort((a, b) => b[1] - a[1]);
L.push('| Χρήστης | Καταχωρήσεις | Μερίδιο |');
L.push('| --- | ---: | ---: |');
for (const [u, n] of perUser) L.push(`| ${u} | ${n} | ${Math.round(n / entries.length * 100)}% |`);
L.push('');
L.push(`> Οι μισές καταχωρήσεις προέρχονται από έναν χρήστη. Ό,τι αναφέρεται από **πολλούς διαφορετικούς** ανθρώπους αξίζει βαρύτερα από ό,τι αναφέρεται πολλές φορές από τον ίδιο — γι' αυτό η κατάταξη παρακάτω μετράει διακριτούς αναφέροντες.`);
L.push('');

// Χειροκίνητη προτεραιότητα — πρώτο πράγμα στην αναφορά, γιατί είναι το μόνο
// κομμάτι της που είναι απόφαση και όχι μέτρηση.
const flaggedEntries = entries.filter(e => prioOf(e.key))
  .sort((a, b) => prioOf(a.key) - prioOf(b.key) || (a.createdAt || '').localeCompare(b.createdAt || ''));
if (flaggedEntries.length) {
  const cell = t => String(t).replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
  L.push('## Προτεραιότητα κατά τον διαχειριστή');
  L.push('');
  L.push('Ορισμένη ανά καταχώρηση μέσα από το `/admin/feedback-review`, όχι από την κατάταξη ζήτησης.');
  L.push('');
  L.push('| # | Ανατροφοδότηση | Θέμα | Από | Διαλογή |');
  L.push('| --- | --- | --- | --- | --- |');
  for (const e of flaggedEntries) {
    const lv = prioOf(e.key);
    const msg = cell(e.message || '');
    const topics = (topicsFor(e.key) || []).map(s => TOPICS[s][0]).join(' · ');
    L.push(`| ${PRIO[lv].short} ${PRIO[lv].label} | ${msg.length > 90 ? msg.slice(0, 90) + '…' : msg} `
      + `| ${cell(topics) || '—'} | ${cell(who(e))} | ${cell(triagedBy(e.key)?.by || '—')} |`);
  }
  L.push('');
}

// Κατάταξη
L.push('## Τι ζητήθηκε περισσότερο');
L.push('');
L.push('| Θέμα | Αναφέροντες | Αναφορές | Κατάσταση |');
L.push('| --- | ---: | ---: | --- |');
const ranked = slugs
  .filter(s => TOPICS[s][2] !== 'noise')
  .sort((a, b) => reportersOf(b).length - reportersOf(a).length
    || byTopic.get(b).length - byTopic.get(a).length
    || STATUS[TOPICS[a][2]].rank - STATUS[TOPICS[b][2]].rank);
for (const s of ranked.slice(0, 15)) {
  L.push(`| ${TOPICS[s][0]} | ${reportersOf(s).length} | ${byTopic.get(s).length} | ${STATUS[TOPICS[s][2]].label} |`);
}
L.push('');

// Θέλουν απόφαση
const decisions = slugs.filter(s => TOPICS[s][2] === 'decision');
if (decisions.length) {
  L.push('## Θέλουν δική σου απόφαση');
  L.push('');
  for (const s of decisions) {
    L.push(`- **${TOPICS[s][0]}** — ${TOPICS[s][3] || ''} _(${reportersOf(s).join(', ')})_`);
  }
  L.push('');
}

// Σώμα ανά θέμα
L.push('## Αναλυτικά ανά περιοχή');
L.push('');
for (const theme of THEME_ORDER) {
  const inTheme = ranked.concat(slugs.filter(s => TOPICS[s][2] === 'noise'))
    .filter(s => TOPICS[s][1] === theme);
  if (!inTheme.length) continue;
  L.push(`### ${THEMES[theme]}`);
  L.push('');
  for (const s of inTheme) {
    const [label, , status, note] = TOPICS[s];
    const es = byTopic.get(s);
    L.push(`#### ${label}`);
    L.push('');
    L.push(`${STATUS[status].label} · ${es.length} ${es.length === 1 ? 'αναφορά' : 'αναφορές'} από ${reportersOf(s).join(', ')}`);
    L.push('');
    if (note) { L.push(`> ${note}`); L.push(''); }
    for (const e of es) {
      const meta = [when(e), who(e), e.page || '—'].filter(Boolean).join(' · ');
      L.push(`- **${meta}**${e.screenshot ? ` · [στιγμιότυπο](${e.screenshot})` : ''}`);
      for (const line of (e.message || '').trim().split(/\r?\n/)) {
        L.push(`  > ${line.trim()}`);
      }
    }
    L.push('');
  }
}

if (untriaged.length) {
  L.push('## Αδιαλογάριαστα');
  L.push('');
  L.push('_Νέες καταχωρήσεις που δεν έχουν μπει ακόμη στο `TRIAGE` του script._');
  L.push('');
  for (const e of untriaged) {
    L.push(`- **${when(e)} · ${who(e)} · ${e.page || '—'}** (\`${e.key}\`)`);
    for (const line of (e.message || '').trim().split(/\r?\n/)) L.push(`  > ${line.trim()}`);
  }
  L.push('');
}

if (staleKeys.length) {
  L.push('## Ξεκρέμαστες εγγραφές διαλογής');
  L.push('');
  L.push('_Κλειδιά στο `TRIAGE` χωρίς αντίστοιχο αρχείο — πιθανώς διαγράφηκε ή άλλαξε._');
  L.push('');
  for (const k of staleKeys) L.push(`- \`${k}\``);
  L.push('');
}

fs.writeFileSync(OUT, L.join('\n'));
console.log(`Γράφτηκε ${path.relative(ROOT, OUT)}`);
console.log(`  ${entries.length} καταχωρήσεις · ${slugs.length} θέματα · ${untriaged.length} αδιαλογάριαστα · ${staleKeys.length} ξεκρέμαστα`);

// ── HTML ─────────────────────────────────────────────────────────────────────
// Ίδια δεδομένα, μορφή για ανάγνωση στον browser. Τα στιγμιότυπα μπαίνουν
// σμικρυμένα μέσα στη σελίδα ώστε να είναι αυτοτελής (τα πρωτότυπα ξεπερνούν
// τα 15MB και δεν χωράνε).
const OUT_HTML = path.join(DIR, 'review.html');
const sharp = (await import(path.join(ROOT, 'node_modules/sharp/lib/index.js'))).default;

// Ο πίνακας «ποιος μιλάει» δημοσιεύεται· ένας αναφέρων ταυτοποιείται μόνο από
// το email του, οπότε δεν το τυπώνουμε.
const whoPublic = e => (e.username || '').trim() || 'χρήστης χωρίς λογαριασμό';

const thumbs = {};
for (const e of entries) {
  if (!e.screenshot) continue;
  const src = path.join(DIR, e.screenshot);
  if (!fs.existsSync(src)) { console.warn(`  ! λείπει στιγμιότυπο: ${e.screenshot}`); continue; }
  const buf = await sharp(src).rotate().resize({ width: 1000, withoutEnlargement: true })
    .jpeg({ quality: 68, mozjpeg: true }).toBuffer();
  thumbs[e.screenshot] = `data:image/jpeg;base64,${buf.toString('base64')}`;
}
const shotBytes = Object.values(thumbs).reduce((n, s) => n + s.length, 0);

// Το σήμα του AgoraX. Η σελίδα σερβίρεται από τον δίσκο, έξω από το bundle του
// Vite, οπότε δεν μπορεί να δείξει το assets/logo.png με τη διεύθυνση που του
// δίνει το build — μπαίνει σμικρυμένο μέσα στη σελίδα, όπως τα στιγμιότυπα.
const logo = 'data:image/png;base64,' + (await sharp(path.join(ROOT, 'client', 'src', 'assets', 'logo.png'))
  .resize({ height: 96, withoutEnlargement: true })
  .png({ compressionLevel: 9 })
  .toBuffer()).toString('base64');
const year = new Date().getFullYear();

// Εβδομαδιαία κατανομή. Η σελίδα ταξινομεί και φιλτράρει χρονικά, οπότε
// χρειάζεται τις ημερομηνίες ως δεδομένα, όχι μόνο τα πλήθη.
const mondayOf = (iso) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};
const weekCounts = new Map();
for (const e of entries) {
  const k = mondayOf(when(e));
  weekCounts.set(k, (weekCounts.get(k) || 0) + 1);
}
// Μπαίνουν και οι άδειες εβδομάδες: η σιωπή μιας περιόδου είναι πληροφορία,
// και χωρίς αυτές οι στήλες θα έδειχναν συνεχή ροή εκεί που δεν υπήρχε.
const activity = [];
{
  const lastWeek = mondayOf(when(entries[entries.length - 1]));
  let w = mondayOf(when(entries[0]));
  while (w <= lastWeek) {
    activity.push({ week: w, n: weekCounts.get(w) || 0 });
    const d = new Date(w + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 7);
    w = d.toISOString().slice(0, 10);
  }
}

// Το key (createdAt μέχρι δευτερόλεπτο) είναι η διεύθυνση της καταχώρησης: με
// αυτό η σελίδα λέει στον διακομιστή ποια ακριβώς διαλογεί.
const publicEntry = e => ({
  key: e.key, date: when(e), who: whoPublic(e), page: e.page || '', shot: e.screenshot || '',
  message: (e.message || '').trim(),
});

const payload = {
  meta: {
    total: entries.length, users: users.length, span,
    shots: entries.filter(e => e.screenshot).length,
    done: countBy('done'), partial: countBy('partial'), open: countBy('open'), decision: countBy('decision'),
    untriaged: untriaged.length,
    first: when(entries[0]), last: when(entries[entries.length - 1]),
    generatedAt: new Date().toISOString(),
  },
  themes: THEMES,
  themeOrder: THEME_ORDER,
  statuses: Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [k, v.label])),
  reporters: perUser.map(([u, n]) => ({ name: u === '«<redacted-email>»' ? 'χρήστης χωρίς λογαριασμό' : u, n })),
  activity,
  // Η σελίδα δεν παίρνει πια έτοιμη ομαδοποίηση: παίρνει τις καταχωρήσεις
  // επίπεδα, τη διαλογή του script και τη διαλογή του διαχειριστή, και τις
  // ομαδοποιεί μόνη της με τον ίδιο κανόνα. Έτσι, μόλις ο διαχειριστής βάλει
  // μια καταχώρηση σε θέμα, μετακομίζει μπροστά στα μάτια του αντί να περιμένει
  // τη νυχτερινή παραγωγή — και η σελίδα δεν μπορεί να διαφωνήσει με το
  // REVIEW.md, γιατί ο κανόνας είναι γραμμένος μία φορά.
  allEntries: entries.map(publicEntry),
  baseTriage: Object.fromEntries(entries.map(e => [e.key, TRIAGE[e.key]]).filter(([, v]) => v)),
  store: STORE.entries,
  topicMeta: Object.fromEntries(Object.entries(TOPICS).map(([slug, t]) => (
    [slug, { label: t[0], theme: t[1], status: t[2], note: t[3] || '' }]
  ))),
  prioLabels: PRIO,
  thumbs,
};

const html = `<!doctype html>
<html lang="el"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Ανατροφοδότηση AgoraX</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=GFS+Didot&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
/* Χρώματα και τυπογραφία από τα tokens του AgoraX (client/src/index.css).
   Καμία νέα παλέτα: το ίδιο kyanós, οι ίδιες πολιτειακές σημασιολογίες,
   και η ίδια μέγιστη καμπυλότητα των 4px. */
:root{
  --paper:#FAFAF7; --surface:#FFFFFF; --sunken:#F1F2ED;
  --line:#D9DCD4; --line-strong:#9AA096;
  --ink:#14212E; --ink-soft:#4A5561; --ink-faint:#6B7480;
  --kyanos:#0B4C8C; --kyanos-deep:#093A6B; --kyanos-wash:#EDF2F8;
  --s-done:#2F6B3F; --s-partial:#8A5A00; --s-open:#5B6470; --s-decision:#0B4C8C; --s-noise:#9AA096;
  --radius:0.25rem;
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    /* Το σκούρο έδαφος του AgoraX — τα broadcast tokens. */
    --paper:#0C1B2A; --surface:#12253A; --sunken:#16293F;
    --line:#27405C; --line-strong:#3A5875;
    --ink:#F2F6FA; --ink-soft:#93A6BA; --ink-faint:#7D91A6;
    --kyanos:#6E9FD4; --kyanos-deep:#8FB6E0; --kyanos-wash:#16293F;
    --s-done:#56A96E; --s-partial:#C9A14A; --s-open:#66788C; --s-decision:#6E9FD4; --s-noise:#5B6E82;
  }
}
:root[data-theme="dark"]{
  --paper:#0C1B2A; --surface:#12253A; --sunken:#16293F;
  --line:#27405C; --line-strong:#3A5875;
  --ink:#F2F6FA; --ink-soft:#93A6BA; --ink-faint:#7D91A6;
  --kyanos:#6E9FD4; --kyanos-deep:#8FB6E0; --kyanos-wash:#16293F;
  --s-done:#56A96E; --s-partial:#C9A14A; --s-open:#66788C; --s-decision:#6E9FD4; --s-noise:#5B6E82;
}
*{box-sizing:border-box}
body{
  margin:0; background:var(--paper); color:var(--ink);
  font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;
  font-size:16px; line-height:1.6; -webkit-font-smoothing:antialiased;
}
.wrap{max-width:1120px; margin:0 auto; padding:0 24px}
h1,h2,h3{font-family:"GFS Didot",Georgia,"Times New Roman",serif; font-weight:400; text-wrap:balance}
.mono{font-family:"IBM Plex Mono",Menlo,Consolas,monospace; font-variant-numeric:tabular-nums}

/* Επιγραφή. Ίδια δομή με το client/src/components/layout/header.tsx: μολυβιά
   μελανιού στην κορυφή, σήμα, λεκτικό σήμα, ένδειξη Beta, υπότιτλος. Δεν
   κολλάει στην κορυφή όπως στην εφαρμογή — εδώ κολλημένη είναι η μπάρα των
   φίλτρων, και δύο κολλημένες σειρές θα έτρωγαν μισή οθόνη σε κινητό. */
.rule{height:4px; background:var(--ink)}
.masthead{border-bottom:1px solid var(--line); background:var(--paper)}
.masthead-inner{display:flex; flex-wrap:wrap; align-items:center; gap:10px 16px; padding:10px 0}
.brand{display:flex; align-items:center; gap:10px; text-decoration:none; color:inherit; min-width:0}
.masthead .brand{margin-right:auto}
.brand img{height:36px; width:auto; flex:0 0 auto}
.brand-line{display:flex; align-items:baseline; gap:6px; line-height:1}
.wordmark{font-family:"GFS Didot",Georgia,"Times New Roman",serif; font-size:1.5rem; color:var(--ink)}
.beta{
  border:1px solid rgba(11,76,140,.4); background:var(--kyanos-wash); color:var(--kyanos);
  border-radius:2px; padding:2px 4px; font-size:10px; font-weight:600;
  text-transform:uppercase; letter-spacing:.12em; line-height:1;
}
.brand-sub{
  display:block; margin-top:4px; font-size:10px; font-weight:600;
  text-transform:uppercase; letter-spacing:.14em; color:var(--ink-faint);
}
.masthead-nav{display:flex; flex-wrap:wrap; gap:8px 16px; font-size:.82rem}
.masthead-nav a{color:var(--kyanos); text-decoration:none; font-weight:500}
.masthead-nav a:hover{text-decoration:underline}
.masthead-nav a:focus-visible{outline:2px solid var(--kyanos); outline-offset:2px}
@media (max-width:640px){.brand-sub{display:none}}

header.top{border-bottom:1px solid var(--line); background:var(--surface)}
.head-inner{display:flex; flex-direction:column; gap:10px; padding:40px 0 30px}
h1{font-size:clamp(1.9rem,4vw,2.7rem); line-height:1.15; margin:0}
.lede{margin:0; color:var(--ink-soft); max-width:62ch}
.eyebrow{
  margin:0; font-size:.7rem; letter-spacing:.14em; text-transform:uppercase;
  color:var(--kyanos); font-weight:600;
}

.stats{display:flex; flex-wrap:wrap; margin-top:22px; border:1px solid var(--line); border-radius:var(--radius); overflow:hidden}
.stat{flex:1 1 130px; padding:12px 16px; background:var(--sunken); border-right:1px solid var(--line)}
.stat:last-child{border-right:0}
.stat b{display:block; font-size:1.5rem; line-height:1.2; font-weight:600}
.stat span{font-size:.76rem; color:var(--ink-soft)}

section{padding:36px 0}
h2{font-size:1.4rem; margin:0 0 6px}
.sub{color:var(--ink-soft); font-size:.9rem; margin:0 0 18px; max-width:62ch}

.voices{background:var(--surface); border:1px solid var(--line); border-radius:var(--radius); padding:22px}
.bar{display:flex; height:26px; border-radius:var(--radius); overflow:hidden; margin:14px 0 12px; background:var(--sunken)}
.seg:focus-visible{outline:2px solid var(--kyanos); outline-offset:2px}
.legend{display:flex; flex-wrap:wrap; gap:6px 18px; font-size:.8rem; color:var(--ink-soft)}
.legend i{display:inline-block; width:9px; height:9px; margin-right:6px}
.pull{
  margin:16px 0 0; padding:12px 16px; border-left:3px solid var(--kyanos);
  background:var(--kyanos-wash); border-radius:0 var(--radius) var(--radius) 0; font-size:.92rem;
}

.panels{display:grid; gap:16px; grid-template-columns:1fr}
@media (min-width:900px){.panels{grid-template-columns:1.1fr .9fr; align-items:start}}
.panel{background:var(--surface); border:1px solid var(--line); border-radius:var(--radius); padding:22px}
.panel h2{font-size:1.15rem; margin:0 0 4px}
.panel .sub{margin:0 0 6px}

/* Καταχωρήσεις ανά εβδομάδα. Οι άδειες εβδομάδες κρατούν το πλάτος τους ώστε
   ο χρόνος να διαβάζεται γραμμικά — μια σιωπηλή εβδομάδα φαίνεται ως κενό. */
.weeks{display:flex; align-items:flex-end; gap:3px; height:116px; margin:12px 0 6px}
.wk{
  flex:1 1 0; min-width:5px; padding:0; border:0; background:none; cursor:pointer;
  display:flex; flex-direction:column; justify-content:flex-end; height:100%;
}
.wk i{display:block; background:var(--kyanos); border-radius:2px 2px 0 0; min-height:2px; opacity:.8}
.wk:hover i{opacity:1}
.wk.zero i{background:var(--line); opacity:1}
.wk[aria-pressed=true] i{background:var(--ink); opacity:1}
.wk:focus-visible{outline:2px solid var(--kyanos); outline-offset:2px}
.axis{display:flex; justify-content:space-between; font-size:.72rem; color:var(--ink-faint)}

.controls{
  position:sticky; top:0; z-index:20; background:var(--paper);
  border-bottom:1px solid var(--line); padding:12px 0;
}
.ctl-inner{display:flex; flex-wrap:wrap; gap:10px; align-items:center}
.ctl-second{margin-top:9px; padding-top:9px; border-top:1px dashed var(--line); gap:8px 14px}
.fld{display:inline-flex; align-items:center; gap:6px; font-size:.74rem; color:var(--ink-faint); white-space:nowrap}
.fld select,.fld input{font-size:.86rem}
input[type=date]{
  font:inherit; font-size:.86rem; color:var(--ink); background:var(--surface);
  border:1px solid var(--line); border-radius:var(--radius); padding:6px 9px;
}
input[type=date]:focus-visible{outline:2px solid var(--kyanos); outline-offset:1px}
input[type=search],select{
  font:inherit; font-size:.9rem; color:var(--ink); background:var(--surface);
  border:1px solid var(--line); border-radius:var(--radius); padding:7px 11px;
}
input[type=search]{flex:1 1 220px; min-width:180px}
input[type=search]:focus-visible,select:focus-visible,button:focus-visible{outline:2px solid var(--kyanos); outline-offset:1px}
.pills{display:flex; flex-wrap:wrap; gap:6px}
.pill{
  font:inherit; font-size:.8rem; cursor:pointer; padding:6px 12px;
  border:1px solid var(--line); background:var(--surface); color:var(--ink-soft);
  border-radius:var(--radius); transition:background 120ms ease-out;
}
.pill:hover{background:var(--sunken)}
.pill[aria-pressed=true]{background:var(--ink); color:var(--paper); border-color:var(--ink)}
.count{margin-left:auto; font-size:.82rem; color:var(--ink-soft); white-space:nowrap}

.theme-h{
  display:flex; align-items:baseline; gap:12px; margin:34px 0 12px;
  padding-bottom:8px; border-bottom:1px solid var(--line);
}
.theme-h h3{font-size:1.1rem; margin:0}
.theme-h span{font-size:.78rem; color:var(--ink-faint)}
.cards{display:flex; flex-direction:column; gap:10px}
.card{
  background:var(--surface); border:1px solid var(--line); border-radius:var(--radius);
  border-left:3px solid var(--sc); overflow:hidden;
}
.card summary{
  cursor:pointer; padding:14px 16px; display:flex; flex-wrap:wrap;
  gap:6px 14px; align-items:baseline; list-style:none;
}
.card summary::-webkit-details-marker{display:none}
.card summary:hover{background:var(--sunken)}
.card summary:focus-visible{outline:2px solid var(--kyanos); outline-offset:-2px}
.t-label{font-weight:600; flex:1 1 320px; min-width:0}
.t-status{font-size:.75rem; color:var(--sc); font-weight:600; white-space:nowrap}
.t-meta{font-size:.78rem; color:var(--ink-faint); white-space:nowrap}
.t-date{font-size:.78rem; color:var(--ink-faint); white-space:nowrap}
.chip{
  font-size:.7rem; color:var(--ink-soft); background:var(--sunken);
  border:1px solid var(--line); border-radius:var(--radius); padding:1px 7px; white-space:nowrap;
}
.untriaged-note{
  margin:0 0 10px; padding:10px 14px; border-left:3px solid var(--kyanos);
  background:var(--kyanos-wash); border-radius:0 var(--radius) var(--radius) 0; font-size:.86rem;
}
/* Χειροκίνητη προτεραιότητα: η σημαία μπαίνει και ως χρωματιστή ράβδος στο
   αριστερό χείλος της κάρτας, ώστε τα καρφιτσωμένα θέματα να ξεχωρίζουν με το
   μάτι μέσα σε μια στήλη από δεκάδες. */
.card[data-prio]{border-left:3px solid var(--pc)}
.card[data-prio="1"]{--pc:#A11B1B}
.card[data-prio="2"]{--pc:#8A5A00}
.card[data-prio="3"]{--pc:#5B6470}
.prio-flag{
  font-size:.7rem; font-weight:600; white-space:nowrap; color:#fff;
  background:var(--pc); border-radius:var(--radius); padding:2px 7px;
}
.tri{
  margin:10px 0 2px; padding:8px 10px; background:var(--sunken);
  border:1px solid var(--line); border-radius:var(--radius); font-size:.76rem;
}
.tri-row{display:flex; flex-wrap:wrap; gap:5px 7px; align-items:center}
.tri-row + .tri-row{margin-top:6px}
.tri-h{color:var(--ink-faint); font-weight:600; min-width:5.5rem}
.tri button,.tri select,.tri input{
  font:inherit; padding:2px 8px; border-radius:var(--radius);
  border:1px solid var(--line-strong); background:var(--surface); color:var(--ink-soft);
}
.tri button{cursor:pointer}
.tri button:hover{border-color:var(--kyanos); color:var(--kyanos)}
.tri [data-eprio][aria-pressed="true"]{background:var(--kyanos); border-color:var(--kyanos); color:#fff}
.tri [disabled]{opacity:.5; cursor:progress}
.tri select{max-width:17rem}
.tchip{
  display:inline-flex; align-items:center; gap:3px; padding:1px 3px 1px 8px;
  background:var(--kyanos-wash); border:1px solid var(--kyanos);
  color:var(--kyanos-deep); border-radius:var(--radius); font-weight:600;
}
.tchip button{border:0; background:none; color:inherit; padding:0 3px; font-size:1rem; line-height:1}
.tri-none{color:var(--ink-faint); font-style:italic}
.tri-new{display:flex; flex-wrap:wrap; gap:6px; margin-top:6px}
.tri-new input{flex:1 1 14rem}
.tri-by{color:var(--ink-faint); margin-left:auto}
.tri-err{display:block; margin-top:6px; color:#A11B1B; font-weight:600}
.card[open] summary{border-bottom:1px solid var(--line)}
.body{padding:4px 16px 16px}
.note{
  margin:12px 0 4px; padding:10px 14px; background:var(--sunken);
  border:1px solid var(--line); border-radius:var(--radius); font-size:.88rem; color:var(--ink-soft);
}
.note b{color:var(--ink)}
.entry{padding:14px 0; border-top:1px solid var(--line)}
.entry:first-of-type{border-top:0}
.ehead{display:flex; flex-wrap:wrap; gap:4px 10px; align-items:baseline; font-size:.78rem; color:var(--ink-faint); margin-bottom:6px}
.ehead b{color:var(--ink); font-weight:600; font-size:.84rem}
.quote{
  margin:0; padding-left:14px; border-left:2px solid var(--line);
  white-space:pre-wrap; overflow-wrap:break-word; font-size:.94rem;
}
.shot{margin:10px 0 0}
.shot img{max-width:100%; height:auto; border:1px solid var(--line); border-radius:var(--radius); display:block}
.shot figcaption{font-size:.74rem; color:var(--ink-faint); margin-top:5px}
.empty{padding:50px 0; text-align:center; color:var(--ink-soft)}
/* Colophon, όπως στο client/src/components/layout/footer.tsx. Τα χρώματά του
   δεν είναι tokens που εναλλάσσονται: το υποσέλιδο της εφαρμογής είναι σκούρο
   και στα δύο θέματα, και οφείλει να δείχνει το ίδιο κι εδώ. */
.colophon{background:#14212E; color:#FAFAF7; border-top:1px solid #9AA096; margin-top:48px}
.colophon-grid{display:grid; gap:34px; padding:54px 0; grid-template-columns:1fr}
@media (min-width:760px){.colophon-grid{grid-template-columns:6fr 3fr 3fr; gap:32px}}
.colophon .wordmark{color:#FAFAF7; font-size:2rem}
.tagline{margin:16px 0 0; max-width:40ch; font-size:.86rem; line-height:1.65; color:#93A6BA}
.col-h{margin:0; font-family:Inter,system-ui,sans-serif; font-size:.7rem; font-weight:600;
  text-transform:uppercase; letter-spacing:.14em; color:#93A6BA}
.col-links{list-style:none; margin:14px 0 0; padding:0; border-top:1px solid #27405C}
.col-links li{border-bottom:1px solid #27405C}
.col-links a{display:block; padding:9px 0; font-size:.86rem; color:#93A6BA; text-decoration:none; transition:color 120ms ease-out}
.col-links a:hover{color:#FAFAF7}
.col-links a:focus-visible{outline:2px solid #6E9FD4; outline-offset:-2px}
.col-note{margin:14px 0 0; font-size:.8rem; line-height:1.6; color:#93A6BA}
.colophon code{background:#16293F; border-color:#27405C; color:#F2F6FA}
.legal{border-top:1px solid #27405C; padding:22px 0}
.legal p{margin:0; font-size:.74rem; color:#93A6BA}
code{font-family:"IBM Plex Mono",Menlo,Consolas,monospace; font-size:.86em; background:var(--sunken); padding:1px 5px; border-radius:var(--radius); border:1px solid var(--line)}
@media (prefers-reduced-motion:reduce){*{animation:none!important; transition:none!important}}
@media (max-width:640px){.head-inner{padding:28px 0 22px} .count{margin-left:0; width:100%}}
</style></head><body>

<div class="rule" aria-hidden="true"></div>
<header class="masthead"><div class="wrap masthead-inner">
  <a class="brand" href="/feed">
    <img src="${logo}" alt="" width="36" height="36">
    <span>
      <span class="brand-line"><span class="wordmark">AgoraX</span><span class="beta">Beta</span></span>
      <span class="brand-sub">Πλατφόρμα Ψηφιακής Δημοκρατίας</span>
    </span>
  </a>
  <nav class="masthead-nav">
    <a href="/admin/accounts">Διαχείριση</a>
    <a href="/feed">Επιστροφή στην πλατφόρμα</a>
  </nav>
</div></header>

<header class="top"><div class="wrap head-inner">
  <p class="eyebrow">AgoraX &middot; διαλογή ανατροφοδότησης</p>
  <h1>Τι μας είπαν οι πρώτοι χρήστες</h1>
  <p class="lede">Κάθε υποβολή από το widget της πλατφόρμας, ομαδοποιημένη κατά θέμα αντί για ημερομηνία. Ανοίξτε ένα θέμα για να δείτε τα αυτούσια λόγια.</p>
  <div class="stats" id="stats"></div>
</div></header>

<div class="wrap">
  <section class="panels">
    <div class="panel">
      <h2>Ποιος μιλάει</h2>
      <p class="sub">Πριν διαβάσετε τι ζητήθηκε, δείτε από ποιους. Η κατανομή αλλάζει τον τρόπο που μετράμε τη ζήτηση.</p>
      <div class="bar" id="bar"></div>
      <div class="legend" id="legend"></div>
      <p class="pull">Οι μισές καταχωρήσεις είναι ενός ανθρώπου. Γι' αυτό η κατάταξη μετράει <b>πόσοι διαφορετικοί άνθρωποι</b> ζήτησαν κάτι, όχι πόσες φορές γράφτηκε.</p>
    </div>
    <div class="panel">
      <h2>Πότε μιλάνε</h2>
      <p class="sub">Καταχωρήσεις ανά εβδομάδα. Κάντε κλικ σε μια στήλη για να κρατήσετε μόνο εκείνη την εβδομάδα.</p>
      <div class="weeks" id="weeks"></div>
      <div class="axis" id="axis"></div>
      <p class="pull" id="periodNote"></p>
    </div>
  </section>
</div>

<div class="controls"><div class="wrap">
  <div class="ctl-inner">
    <input type="search" id="q" placeholder="Αναζήτηση στα λόγια των χρηστών…" aria-label="Αναζήτηση">
    <div class="pills" id="statusPills"></div>
    <span class="count" id="count"></span>
  </div>
  <div class="ctl-inner ctl-second">
    <label class="fld">Ταξινόμηση <select id="sort"></select></label>
    <label class="fld">Περιοχή <select id="theme"></select></label>
    <label class="fld">Αναφέρων <select id="reporter"></select></label>
    <label class="fld">Από <input type="date" id="from"></label>
    <label class="fld">Έως <input type="date" id="to"></label>
    <div class="pills" id="presets"></div>
    <button class="pill" id="reset" type="button">Καθαρισμός φίλτρων</button>
  </div>
</div></div>

<div class="wrap"><main id="list"></main></div>

<footer class="colophon"><div class="wrap">
  <div class="colophon-grid">
    <div>
      <a class="brand" href="/">
        <img src="${logo}" alt="" width="36" height="36">
        <span class="wordmark">AgoraX</span>
      </a>
      <p class="tagline">Πλατφόρμα ψηφιακής δημοκρατίας για μια πιο ανοιχτή και συμμετοχική διακυβέρνηση</p>
    </div>
    <div>
      <h3 class="col-h">Χρήσιμοι Σύνδεσμοι</h3>
      <ul class="col-links">
        <li><a href="/how-it-works">Πώς λειτουργεί</a></li>
        <li><a href="/faq">Συχνές Ερωτήσεις</a></li>
        <li><a href="/terms">Όροι Χρήσης</a></li>
        <li><a href="/privacy">Πολιτική Απορρήτου</a></li>
      </ul>
    </div>
    <div>
      <h3 class="col-h">Αυτή η αναφορά</h3>
      <p class="col-note" id="generated"></p>
      <p class="col-note">Παράγεται από <code>scripts/feedback-report.mjs</code>, αυτόματα κάθε μέρα. Τα στιγμιότυπα είναι σμικρυμένα για να χωρέσουν στη σελίδα· τα πρωτότυπα μένουν στον διακομιστή.</p>
    </div>
  </div>
  <div class="legal"><p class="mono">&copy; ${year} AgoraX &mdash; Πλατφόρμα Ψηφιακής Δημοκρατίας</p></div>
</div></footer>

<script>
const D = ${JSON.stringify(payload).replace(/</g, '\\u003c')};
const SC = {done:'--s-done', partial:'--s-partial', open:'--s-open', decision:'--s-decision', noise:'--s-noise'};
const esc = s => s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

const fmt = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '—';
const shift = (iso, days) => new Date(Date.parse(iso + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
const today = () => new Date().toISOString().slice(0, 10);
// Υπολογίζεται στον browser, όχι κατά την παραγωγή: η σελίδα ξαναφτιάχνεται
// μία φορά την ημέρα, το «πριν πόσο» πρέπει να ισχύει κάθε ώρα.
const ago = iso => {
  const n = Math.floor((Date.parse(today() + 'T00:00:00Z') - Date.parse(iso + 'T00:00:00Z')) / 86400000);
  if (n <= 0) return 'σήμερα';
  if (n === 1) return 'χθες';
  if (n < 31) return 'πριν ' + n + ' ημέρες';
  const m = Math.round(n / 30);
  return m <= 1 ? 'πριν έναν μήνα' : 'πριν ' + m + ' μήνες';
};

// Τα πλήθη θεμάτων και αδιαλογάριαστων αλλάζουν με κάθε κατάταξη, οπότε τα
// πλακίδια ξαναγράφονται αντί να ψηθούν μία φορά στην παραγωγή.
function renderStats() {
  const st = k => TV.filter(t => t.status === k).length;
  document.getElementById('stats').innerHTML = [
    [D.meta.total, 'καταχωρήσεις'], [TV.length, 'θέματα'], [D.meta.users, 'χρήστες'],
    [st('open'), 'ανοιχτά'], [st('done'), 'έγιναν'], [UN.length, 'αδιαλογάριαστα'],
    [D.meta.shots, 'στιγμιότυπα'],
  ].map(([n, l]) => '<div class="stat"><b class="mono">' + n + '</b><span>' + l + '</span></div>').join('');
}

document.getElementById('generated').textContent =
  'Τελευταία παραγωγή: ' + new Date(D.meta.generatedAt).toLocaleString('el-GR') +
  ' · τελευταία καταχώρηση: ' + fmt(D.meta.last) + ' (' + ago(D.meta.last) + ').';

// Μονοχρωματική κλίμακα του kyanós: η ένταση δείχνει όγκο, χωρίς να
// εισάγει χρώματα εκτός του συστήματος.
const palette = ['#0B4C8C','#2F6FA8','#5B90C2','#8FB3D6','#B9CFE4','#D9E3EE'];
document.getElementById('bar').innerHTML = D.reporters.map((r, i) => {
  const pct = r.n / D.meta.total * 100;
  return '<div class="seg" tabindex="0" style="width:' + pct + '%;background:' + palette[Math.min(i, palette.length - 1)] +
    '" title="' + esc(r.name) + ' — ' + r.n + '"></div>';
}).join('');
document.getElementById('legend').innerHTML = D.reporters.slice(0, 6).map((r, i) =>
  '<span><i style="background:' + palette[Math.min(i, palette.length - 1)] + '"></i>' + esc(r.name) +
  ' <span class="mono">' + r.n + '</span></span>').join('') +
  (D.reporters.length > 6 ? '<span><i style="background:' + palette[5] + '"></i>λοιποί <span class="mono">' +
    D.reporters.slice(6).reduce((n, r) => n + r.n, 0) + '</span></span>' : '');

// ── Κατάσταση φίλτρων ────────────────────────────────────────────────────────
// Το χρονικό φίλτρο δουλεύει σε επίπεδο *καταχώρησης*, όχι θέματος: αλλιώς μια
// αναζήτηση «τι ειπώθηκε την περασμένη εβδομάδα» θα επέστρεφε ολόκληρο θέμα με
// αναφορές έξι εβδομάδων μέσα του. Ό,τι βλέπετε στον μετρητή, το είπαν τότε.
let fStatus = 'all', fReporter = 'all', fTheme = 'all', fQuery = '', fFrom = '', fTo = '', fSort = 'demand';

const SORTS = [
  ['demand',  'Ζήτηση, ανά περιοχή', (a, b) => b.people - a.people || b.es.length - a.es.length],
  // Τα ακαρφίτσωτα πάνε στο 99 ώστε να πέφτουν κάτω από κάθε καρφιτσωμένο,
  // και μεταξύ τους ξανακρίνονται με ζήτηση.
  ['priority', 'Χειροκίνητη προτεραιότητα', (a, b) =>
    (topicPrio(a) || 99) - (topicPrio(b) || 99) || b.people - a.people || b.es.length - a.es.length],
  ['recent',  'Πιο πρόσφατα πρώτα',  (a, b) => b.last.localeCompare(a.last) || b.people - a.people],
  ['oldest',  'Παλαιότερα πρώτα',    (a, b) => a.first.localeCompare(b.first) || b.people - a.people],
  ['reports', 'Περισσότερες αναφορές', (a, b) => b.es.length - a.es.length || b.people - a.people],
  ['people',  'Περισσότεροι άνθρωποι', (a, b) => b.people - a.people || b.es.length - a.es.length],
];
const sortFn = () => (SORTS.find(x => x[0] === fSort) || SORTS[0])[2];

// ── Διαλογή: ζωντανή κατάσταση ───────────────────────────────────────────────
// S είναι η διαλογή του διαχειριστή. Ξεκινάει με ό,τι ήξερε η νυχτερινή
// παραγωγή και αντικαθίσταται από ό,τι λέει ο διακομιστής μόλις απαντήσει,
// ώστε δουλειά άλλου διαχειριστή μετά τις 03:20 να μη χαθεί από τα μάτια.
let S = D.store || {};
const TM = D.topicMeta;

const effTopics = key => {
  const rec = S[key];
  if (Array.isArray(rec?.topics)) return rec.topics.filter(sl => TM[sl]);
  return D.baseTriage[key] || null;
};
const prioOfKey = key => (D.prioLabels[S[key]?.prio] ? S[key].prio : 0);
// Το 1 είναι το ισχυρότερο, άρα ένα θέμα κληρονομεί την πιο επείγουσα σημαία
// που κουβαλάει οποιαδήποτε καταχώρησή του.
const topicPrio = t => (t.es || t.entries).reduce((m, e) => {
  const l = prioOfKey(e.key);
  return l && (!m || l < m) ? l : m;
}, 0);

// Η ομαδοποίηση ξαναγίνεται μετά από κάθε αλλαγή: ο κανόνας είναι ο ίδιος με
// του script, γραμμένος εδώ μία φορά.
let TV = [], UN = [];
function regroup() {
  const map = new Map();
  UN = [];
  for (const e of D.allEntries) {
    const ts = effTopics(e.key);
    if (!ts || !ts.length) { UN.push(e); continue; }
    for (const sl of ts) {
      if (!TM[sl]) continue;
      if (!map.has(sl)) map.set(sl, []);
      map.get(sl).push(e);
    }
  }
  TV = [...map].map(([slug, es]) => ({
    slug, ...TM[slug], entries: es, reporters: [...new Set(es.map(e => e.who))],
  }));
}
regroup();

const csrf = () => (document.cookie.match(/(?:^|; )agorax_csrf=([^;]*)/) || [, ''])[1];

async function api(url, method, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': decodeURIComponent(csrf()) },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

// Στέλνει ολόκληρη την εγγραφή της καταχώρησης, όχι διαφορά: ο διακομιστής
// κρατάει ό,τι του δώσαμε και δεν χρειάζεται να συμφιλιώσει τίποτα.
async function saveTriage(key, topics, prio) {
  const data = await api('/api/admin/feedback-triage/' + encodeURIComponent(key), 'PUT', { topics, prio });
  if (data.entry) S[key] = data.entry; else delete S[key];
  regroup();
}

async function createTopic(label, theme) {
  const data = await api('/api/admin/feedback-topics', 'POST', { label, theme });
  TM[data.slug] = data.topic;
  return data.slug;
}

fetch('/api/admin/feedback-triage', { credentials: 'same-origin' })
  .then(r => r.ok ? r.json() : null)
  .then(d => {
    if (!d) return;
    if (d.topics) Object.assign(TM, d.topics);
    S = d.entries || {};
    regroup(); sync(); render();
  })
  .catch(() => {});

// ── Έλεγχοι ──────────────────────────────────────────────────────────────────
const STATUS_ORDER = ['all', 'flagged', 'untriaged', 'decision', 'open', 'partial', 'done', 'noise'];
const statusLabel = k => k === 'all' ? 'Όλα' : k === 'flagged' ? 'Με προτεραιότητα'
  : k === 'untriaged' ? 'Αδιαλογάριαστα' : D.statuses[k];
// Το πλήθος των καρφιτσωμένων αλλάζει με κάθε κλικ, οπότε τα pills
// ξαναγράφονται από τη sync() αντί να ψηθούν μία φορά.
function renderPills() {
  // Μετριούνται τα θέματα που όντως φέρουν σημαία, όχι τα κλειδιά του αρχείου:
  // ένα καρφίτσωμα σε slug που μετονομάστηκε στο TOPICS επιβιώνει στο
  // priorities.json και θα φούσκωνε τον μετρητή δείχνοντας θέματα που δεν
  // εμφανίζονται πουθενά.
  const n = TV.filter(t => topicPrio(t)).length + UN.filter(e => prioOfKey(e.key)).length;
  document.getElementById('statusPills').innerHTML = STATUS_ORDER
    .filter(k => (k !== 'untriaged' || UN.length) && (k !== 'flagged' || n))
    .map(k => '<button class="pill" type="button" data-s="' + k + '" aria-pressed="' + (k === fStatus) + '">' +
      esc(statusLabel(k)) +
      (k === 'untriaged' ? ' <span class="mono">' + UN.length + '</span>' : '') +
      (k === 'flagged' ? ' <span class="mono">' + n + '</span>' : '') +
      '</button>').join('');
}
renderPills();
document.getElementById('statusPills').addEventListener('click', ev => {
  const b = ev.target.closest('.pill'); if (!b) return;
  fStatus = b.dataset.s;
  sync(); render();
});

document.getElementById('sort').innerHTML = SORTS
  .map(([k, l]) => '<option value="' + k + '">' + esc(l) + '</option>').join('');
document.getElementById('sort').addEventListener('change', e => { fSort = e.target.value; render(); });

document.getElementById('theme').innerHTML = '<option value="all">Όλες οι περιοχές</option>' +
  D.themeOrder.filter(th => TV.some(t => t.theme === th))
    .map(th => '<option value="' + th + '">' + esc(D.themes[th]) + '</option>').join('');
document.getElementById('theme').addEventListener('change', e => { fTheme = e.target.value; render(); });

const names = [...new Set(D.allEntries.map(e => e.who))]
  .sort((a, b) => a.localeCompare(b, 'el'));
document.getElementById('reporter').innerHTML = '<option value="all">Όλοι οι αναφέροντες</option>' +
  names.map(n => '<option value="' + esc(n) + '">' + esc(n) + '</option>').join('');
document.getElementById('reporter').addEventListener('change', e => { fReporter = e.target.value; render(); });

document.getElementById('q').addEventListener('input', e => { fQuery = e.target.value.trim().toLowerCase(); render(); });

for (const id of ['from', 'to']) {
  const el = document.getElementById(id);
  el.min = D.meta.first;
  el.max = D.meta.last > today() ? D.meta.last : today();
  el.addEventListener('change', e => {
    if (id === 'from') fFrom = e.target.value; else fTo = e.target.value;
    sync(); render();
  });
}

// Τα προκαθορισμένα διαστήματα μετρούν από σήμερα, όχι από την τελευταία
// καταχώρηση: αν επί δέκα μέρες δεν έγραψε κανείς, το «7 ημέρες» οφείλει να
// βγάλει άδειο αποτέλεσμα — αυτό είναι η πληροφορία.
document.getElementById('presets').innerHTML = [7, 30, 90]
  .map(d => '<button class="pill" type="button" data-d="' + d + '">' + d + ' ημέρες</button>').join('');
document.getElementById('presets').addEventListener('click', ev => {
  const b = ev.target.closest('.pill'); if (!b) return;
  const from = shift(today(), 1 - Number(b.dataset.d));
  if (fFrom === from && fTo === today()) { fFrom = ''; fTo = ''; } else { fFrom = from; fTo = today(); }
  sync(); render();
});

document.getElementById('reset').addEventListener('click', () => {
  fStatus = 'all'; fReporter = 'all'; fTheme = 'all'; fQuery = ''; fFrom = ''; fTo = ''; fSort = 'demand';
  document.getElementById('q').value = '';
  document.getElementById('sort').value = 'demand';
  document.getElementById('theme').value = 'all';
  document.getElementById('reporter').value = 'all';
  sync(); render();
});

// ── Εβδομαδιαία κατανομή ─────────────────────────────────────────────────────
const maxWeek = Math.max(1, ...D.activity.map(a => a.n));
document.getElementById('weeks').innerHTML = D.activity.map(a =>
  '<button class="wk' + (a.n ? '' : ' zero') + '" type="button" data-w="' + a.week + '" aria-pressed="false" ' +
  'title="Εβδομάδα ' + fmt(a.week) + ' — ' + a.n + (a.n === 1 ? ' καταχώρηση' : ' καταχωρήσεις') + '">' +
  '<i style="height:' + Math.max(2, Math.round(a.n / maxWeek * 100)) + '%"></i></button>').join('');
document.getElementById('axis').innerHTML =
  '<span>' + fmt(D.activity[0].week) + '</span>' +
  '<span class="mono">κορυφή: ' + maxWeek + '</span>' +
  '<span>' + fmt(D.activity[D.activity.length - 1].week) + '</span>';
document.getElementById('weeks').addEventListener('click', ev => {
  const b = ev.target.closest('.wk'); if (!b) return;
  const w = b.dataset.w, end = shift(w, 6);
  if (fFrom === w && fTo === end) { fFrom = ''; fTo = ''; } else { fFrom = w; fTo = end; }
  sync(); render();
});

function sync() {
  // Ξαναγράφει και τα pills: το πλήθος των καρφιτσωμένων αλλάζει με το κλικ,
  // και το ίδιο το «Με προτεραιότητα» εμφανίζεται μόλις υπάρξει το πρώτο.
  renderPills();
  document.querySelectorAll('#presets .pill').forEach(p =>
    p.setAttribute('aria-pressed', String(fTo === today() && fFrom === shift(today(), 1 - Number(p.dataset.d)))));
  document.querySelectorAll('.wk').forEach(p =>
    p.setAttribute('aria-pressed', String(fFrom === p.dataset.w && fTo === shift(p.dataset.w, 6))));
  document.getElementById('from').value = fFrom;
  document.getElementById('to').value = fTo;
  document.getElementById('periodNote').textContent = (fFrom || fTo)
    ? 'Περίοδος: ' + (fFrom ? fmt(fFrom) : 'αρχή') + ' έως ' + (fTo ? fmt(fTo) : 'σήμερα') + '.'
    : 'Όλη η περίοδος: ' + fmt(D.meta.first) + ' έως ' + fmt(D.meta.last) + '.';
}

// ── Φιλτράρισμα ──────────────────────────────────────────────────────────────
function entryPass(e, labelHit) {
  if (fFrom && e.date < fFrom) return false;
  if (fTo && e.date > fTo) return false;
  if (fReporter !== 'all' && e.who !== fReporter) return false;
  if (fQuery && !labelHit && !(e.message + ' ' + e.who + ' ' + e.page).toLowerCase().includes(fQuery)) return false;
  return true;
}

function visibleTopics() {
  if (fStatus === 'untriaged') return [];
  const out = [];
  for (const t of TV) {
    if (fStatus !== 'all' && fStatus !== 'flagged' && t.status !== fStatus) continue;
    if (fTheme !== 'all' && t.theme !== fTheme) continue;
    const labelHit = fQuery ? (t.label + ' ' + t.note).toLowerCase().includes(fQuery) : false;
    let es = t.entries.filter(e => entryPass(e, labelHit));
    // Στο «Με προτεραιότητα» κρατάμε μόνο τις σημαιοδοτημένες καταχωρήσεις:
    // αλλιώς ένα θέμα με μία επείγουσα αναφορά θα εμφάνιζε και τις άλλες δέκα.
    if (fStatus === 'flagged') es = es.filter(e => prioOfKey(e.key));
    if (!es.length) continue;
    const ds = es.map(e => e.date).slice().sort();
    out.push({ ...t, es, first: ds[0], last: ds[ds.length - 1], people: new Set(es.map(e => e.who)).size });
  }
  return out;
}

// ── Απόδοση ──────────────────────────────────────────────────────────────────
const narrowed = () => fQuery || fFrom || fTo || fReporter !== 'all';

function entryHTML(e) {
  return '<div class="entry"><div class="ehead"><b>' + esc(e.who) + '</b>' +
    '<time class="mono" datetime="' + e.date + '">' + fmt(e.date) + '</time>' +
    '<span>' + ago(e.date) + '</span>' +
    (e.page ? '<span class="mono">' + esc(e.page) + '</span>' : '') + '</div>' +
    '<p class="quote">' + esc(e.message) + '</p>' +
    (e.shot && D.thumbs[e.shot]
      ? '<figure class="shot"><img loading="lazy" alt="Στιγμιότυπο από ' + esc(e.who) + '" src="' + D.thumbs[e.shot] + '"><figcaption>Στιγμιότυπο που επισύναψε ο χρήστης</figcaption></figure>'
      : '') + triageHTML(e) + '</div>';
}

function topicHTML(t, withTheme) {
  const es = fSort === 'recent'
    ? t.es.slice().sort((a, b) => b.date.localeCompare(a.date))
    : t.es.slice().sort((a, b) => a.date.localeCompare(b.date));
  const span = t.first === t.last ? fmt(t.first) : 'από ' + fmt(t.first) + ' έως ' + fmt(t.last);
  const lv = topicPrio(t);
  return '<details class="card" data-slug="' + esc(t.slug) + '" style="--sc:var(' + SC[t.status] + ')"' +
    (lv ? ' data-prio="' + lv + '"' : '') +
    (narrowed() && es.length <= 4 ? ' open' : '') +
    '><summary><span class="t-label">' + esc(t.label) + '</span>' +
    (lv ? '<span class="prio-flag" title="Η ισχυρότερη σημαία που έχει καταχώρηση αυτού του θέματος">' +
      esc(D.prioLabels[lv].short + ' ' + D.prioLabels[lv].label) + '</span>' : '') +
    (withTheme ? '<span class="chip">' + esc(D.themes[t.theme]) + '</span>' : '') +
    '<span class="t-status">' + esc(D.statuses[t.status]) + '</span>' +
    '<span class="t-meta mono">' + t.people + ' άτομα · ' + es.length + ' αναφ.</span>' +
    '<time class="t-date mono" datetime="' + t.last + '" title="' + span + '">' + fmt(t.last) + '</time>' +
    '</summary><div class="body">' +
    (t.note ? '<p class="note"><b>Σημείωση:</b> ' + esc(t.note) + '</p>' : '') +
    es.map(entryHTML).join('') + '</div></details>';
}

// ── Ο διαλογέας μιας καταχώρησης ─────────────────────────────────────────────
// Κρέμεται κάτω από κάθε σχόλιο, και στα θέματα και στα αδιαλογάριαστα: η
// διαλογή γίνεται εκεί που διαβάζεις τα λόγια του χρήστη, όχι σε άλλη οθόνη.
let newTopicFor = null;

const topicOptions = () => D.themeOrder.map(th => {
  const os = Object.keys(TM).filter(sl => TM[sl].theme === th)
    .sort((a, b) => TM[a].label.localeCompare(TM[b].label, 'el'))
    .map(sl => '<option value="' + esc(sl) + '">' + esc(TM[sl].label) + '</option>').join('');
  return os ? '<optgroup label="' + esc(D.themes[th]) + '">' + os + '</optgroup>' : '';
}).join('');

function triageHTML(e) {
  const ts = effTopics(e.key) || [];
  const lv = prioOfKey(e.key);
  const rec = S[e.key];
  const btn = (l, label) => '<button type="button" data-eprio="' + esc(e.key) + '" data-l="' + l +
    '" aria-pressed="' + (lv === l) + '">' + esc(label) + '</button>';
  // Το «νέο θέμα» ανοίγει μέσα στην ίδια καταχώρηση: μια καινούργια αναφορά
  // συχνά δεν χωράει σε κανένα υπάρχον θέμα, και χωρίς αυτό η διαλογή θα
  // κολλούσε ξανά στο να ανοίξει κανείς το script.
  const form = newTopicFor === e.key
    ? '<div class="tri-new"><input type="text" data-tnew-label="' + esc(e.key) +
        '" placeholder="Τίτλος νέου θέματος" maxlength="160">' +
      '<select data-tnew-theme="' + esc(e.key) + '">' +
        D.themeOrder.map(th => '<option value="' + esc(th) + '">' + esc(D.themes[th]) + '</option>').join('') +
      '</select>' +
      '<button type="button" data-tnew-ok="' + esc(e.key) + '">Δημιουργία</button>' +
      '<button type="button" data-tnew-cancel="' + esc(e.key) + '">Άκυρο</button></div>'
    : '';
  return '<div class="tri">' +
    '<div class="tri-row"><span class="tri-h">Θέμα</span>' +
    (ts.length
      ? ts.map(sl => '<span class="tchip">' + esc(TM[sl] ? TM[sl].label : sl) +
          '<button type="button" title="Αφαίρεση από το θέμα" data-tdel="' + esc(e.key) +
          '" data-slug="' + esc(sl) + '">×</button></span>').join('')
      : '<span class="tri-none">αταξινόμητη</span>') +
    '<select data-tadd="' + esc(e.key) + '">' +
      '<option value="">+ Κατάταξη σε θέμα…</option>' +
      '<option value="__new__">+ Νέο θέμα…</option>' + topicOptions() + '</select>' +
    '</div>' + form +
    '<div class="tri-row"><span class="tri-h">Προτεραιότητα</span>' +
    btn(1, D.prioLabels[1].short + ' ' + D.prioLabels[1].label) +
    btn(2, D.prioLabels[2].short + ' ' + D.prioLabels[2].label) +
    btn(3, D.prioLabels[3].short + ' ' + D.prioLabels[3].label) +
    btn(0, 'Καμία') +
    (rec ? '<span class="tri-by">' + esc(rec.by || 'διαχειριστής') + ' · ' +
      fmt((rec.at || '').slice(0, 10)) + '</span>' : '') +
    '</div></div>';
}

// Κλειδώνει τον διαλογέα όσο ταξιδεύει το αίτημα, ώστε δύο γρήγορα κλικ να μη
// στείλουν δύο αντικρουόμενες εκδοχές της ίδιας καταχώρησης.
async function withBusy(el, fn) {
  const box = el.closest('.tri');
  const lock = box.querySelectorAll('button, select, input');
  lock.forEach(x => { x.disabled = true; });
  try {
    await fn();
    sync(); render();
  } catch {
    lock.forEach(x => { x.disabled = false; });
    if (!box.querySelector('.tri-err')) {
      const w = document.createElement('span');
      w.className = 'tri-err';
      w.textContent = 'Δεν αποθηκεύτηκε — δοκιμάστε ξανά.';
      box.appendChild(w);
    }
  }
}

const list = document.getElementById('list');

list.addEventListener('click', ev => {
  // Ο διαλογέας ζει μέσα σε <summary>/<details>: χωρίς preventDefault το κλικ
  // ανεβαίνει και κλείνει την κάρτα κάτω από το δάχτυλο.
  const pr = ev.target.closest('[data-eprio]');
  if (pr) {
    ev.preventDefault();
    const key = pr.dataset.eprio;
    return withBusy(pr, () => saveTriage(key, effTopics(key) || [], Number(pr.dataset.l)));
  }
  const del = ev.target.closest('[data-tdel]');
  if (del) {
    ev.preventDefault();
    const key = del.dataset.tdel;
    return withBusy(del, () => saveTriage(key,
      (effTopics(key) || []).filter(x => x !== del.dataset.slug), prioOfKey(key)));
  }
  const ok = ev.target.closest('[data-tnew-ok]');
  if (ok) {
    ev.preventDefault();
    const key = ok.dataset.tnewOk;
    const box = ok.closest('.tri');
    const label = box.querySelector('[data-tnew-label]').value.trim();
    const theme = box.querySelector('[data-tnew-theme]').value;
    if (!label) return;
    return withBusy(ok, async () => {
      const slug = await createTopic(label, theme);
      newTopicFor = null;
      await saveTriage(key, [...(effTopics(key) || []), slug], prioOfKey(key));
    });
  }
  const cancel = ev.target.closest('[data-tnew-cancel]');
  if (cancel) {
    ev.preventDefault();
    newTopicFor = null;
    render();
  }
});

list.addEventListener('change', ev => {
  const sel = ev.target.closest('[data-tadd]');
  if (!sel) return;
  const key = sel.dataset.tadd;
  const v = sel.value;
  if (!v) return;
  if (v === '__new__') {
    newTopicFor = key;
    render();
    list.querySelector('.tri-new input')?.focus();
    return;
  }
  const cur = effTopics(key) || [];
  // Ήδη εκεί: μηδενίζουμε το select και δεν ενοχλούμε τον διακομιστή.
  if (cur.includes(v)) { sel.value = ''; return; }
  withBusy(sel, () => saveTriage(key, [...cur, v], prioOfKey(key)));
});

function render() {
  const shown = visibleTopics().sort(sortFn());
  // Τα αδιαλογάριαστα δεν ανήκουν σε περιοχή, οπότε φεύγουν μόλις φιλτράρεις κατά περιοχή.
  const un = ((fStatus === 'all' || fStatus === 'untriaged' || fStatus === 'flagged') && fTheme === 'all')
    ? UN.filter(e => entryPass(e, false) && (fStatus !== 'flagged' || prioOfKey(e.key)))
        .sort((a, b) => fSort === 'oldest' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date))
    : [];
  const reports = shown.reduce((n, t) => n + t.es.length, 0);

  const parts = [];
  if (shown.length) parts.push(shown.length + (shown.length === 1 ? ' θέμα' : ' θέματα'));
  if (reports) parts.push(reports + (reports === 1 ? ' αναφορά' : ' αναφορές'));
  if (un.length) parts.push(un.length + ' αδιαλογάριαστα');
  document.getElementById('count').textContent = parts.join(' · ') || 'κανένα αποτέλεσμα';

  const out = [];
  if (un.length) {
    out.push('<div class="theme-h"><h3>Αδιαλογάριαστα</h3><span class="mono">' + un.length + '</span></div>' +
      '<p class="untriaged-note">Καταχωρήσεις που δεν έχουν μπει ακόμη στη διαλογή του <code>scripts/feedback-report.mjs</code>. ' +
      'Εμφανίζονται αυτούσιες ώστε τίποτα καινούργιο να μη χάνεται μεταξύ δύο διαλογών.</p><div class="cards">' +
      '<div class="card" data-slug="__untriaged__" style="--sc:var(--kyanos)"><div class="body">' +
      un.map(entryHTML).join('') + '</div></div></div>');
  }

  if (fSort === 'demand') {
    for (const th of D.themeOrder) {
      const ts = shown.filter(t => t.theme === th);
      if (!ts.length) continue;
      out.push('<div class="theme-h"><h3>' + esc(D.themes[th]) + '</h3><span class="mono">' + ts.length + '</span></div><div class="cards">');
      out.push(ts.map(t => topicHTML(t, false)).join(''));
      out.push('</div>');
    }
  } else if (shown.length) {
    // Εκτός θεματικής ταξινόμησης η ομαδοποίηση θα έσπαγε τη σειρά, οπότε η
    // περιοχή μετακομίζει σε ετικέτα πάνω σε κάθε κάρτα.
    out.push('<div class="theme-h"><h3>' + esc((SORTS.find(x => x[0] === fSort) || SORTS[0])[1]) +
      '</h3><span class="mono">' + shown.length + '</span></div><div class="cards">');
    out.push(shown.map(t => topicHTML(t, true)).join(''));
    out.push('</div>');
  }

  // Κάθε βάψιμο ξαναγράφει όλο το #list. Χωρίς αυτό, η κάρτα που μόλις
  // διαλογούσες κλείνει μόλις πατήσεις οτιδήποτε μέσα της.
  const wasOpen = new Set([...list.querySelectorAll('details.card[open]')]
    .map(d => d.dataset.slug).filter(Boolean));
  list.innerHTML = out.join('') ||
    '<p class="empty">Κανένα θέμα δεν ταιριάζει με αυτά τα φίλτρα.</p>';
  if (wasOpen.size) {
    list.querySelectorAll('details.card').forEach(d => {
      if (wasOpen.has(d.dataset.slug)) d.open = true;
    });
  }
  renderStats();
}

sync();
render();
</script></body></html>`;

fs.writeFileSync(OUT_HTML, html);
console.log(`Γράφτηκε ${path.relative(ROOT, OUT_HTML)}`);
console.log(`  ${(html.length / 1024 / 1024).toFixed(1)}MB συνολικά, εκ των οποίων ${(shotBytes / 1024 / 1024).toFixed(1)}MB στιγμιότυπα`);
