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
  'author-sets-duration': ['Ο συγγραφέας να ορίζει τη διάρκεια διαβούλευσης και ψηφοφορίας', 'PHASE', 'open',
    'Το πιο πολυζητημένο αίτημα του αρχείου.'],
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

// ── Load ─────────────────────────────────────────────────────────────────────
const entries = fs.readdirSync(DIR)
  .filter(f => f.endsWith('.json'))
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
  const slugs = TRIAGE[e.key];
  if (!slugs) { untriaged.push(e); continue; }
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
