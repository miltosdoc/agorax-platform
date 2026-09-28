/**
 * Every word of the landing tour, in both languages, side by side.
 *
 * It lives here rather than in the locale dictionaries because it is
 * long-form editorial copy read as one piece, like the explainers in
 * HowPollsWork and CommunityConstitution. Wherever a scene shows a piece of
 * the app (a label, a receipt line, a constitution article), the words are
 * the app's own, so the tour never promises a screen that looks different.
 */
import type { HeroCopy } from './HeroAssembly';
import type { NoiseCopy } from './NoiseToOrder';
import type { KindsCopy } from './VoteKindsDemo';
import type { ToolsCopy } from './CommunityTools';
import type { FilmCopy } from './ProcessFilm';
import type { RulesCopy } from './RulesDemo';
import type { ChainCopy } from './SealedChainDemo';

export type Lang = 'el' | 'en';

export interface LiveCopy {
  eyebrow: string;
  title: string;
  titleEm: string;
  lede: string;
  more: string;
}

export interface EndCopy {
  title: string;
  titleEm: string;
  lede: string;
  register: string;
  browse: string;
  story: string;
  how: string;
  fine: string;
  source: string;
}

export interface TourCopy {
  chapters: string[];
  stats: [string, string, string, string];
  hero: HeroCopy;
  noise: NoiseCopy;
  kinds: KindsCopy;
  tools: ToolsCopy;
  film: FilmCopy;
  rules: RulesCopy;
  chain: ChainCopy;
  live: LiveCopy;
  end: EndCopy;
}

const pct = (lang: Lang, n: number) => n.toLocaleString(lang === 'el' ? 'el-GR' : 'en-GB', { maximumFractionDigits: 1 });

/** A fixed receipt for the film; the ballot-box chapter makes real ones. */
const FILM_RECEIPT = 'ced292a7f86f55a4b607dde55db7421207f3f46f0b8a02b17d7bc43cda5ad0a4';

const el: TourCopy = {
  chapters: ['Αρχή', 'Το πρόβλημα', 'Ψηφοφορίες', 'Η κοινότητα', 'Από την ιδέα στην απόφαση', 'Αυτοδιοίκηση', 'Η κάλπη', 'Σήμερα'],
  stats: ['μέλη', 'κοινότητες', 'ψηφοφορίες', 'αποφάσεις'],
  hero: {
    eyebrow: 'AgoraX · μια σύντομη περιήγηση',
    title: ['Συζητάμε.', 'Ψηφίζουμε.', 'Αποφασίζουμε.'],
    lede: 'Η AgoraX είναι ο τόπος όπου ένας σύλλογος, μια γειτονιά ή μια ομάδα συζητά, ψηφίζει και αποφασίζει. Forum, ψηφοφορίες, δημοσκοπήσεις, βιβλιοθήκη, βίντεο και podcast, όλα σε ένα μέρος, με μια κάλπη που μπορεί να ελέγξει ο καθένας.',
    tour: 'Ξεκινήστε την περιήγηση',
    register: 'Εγγραφή',
    signIn: 'Σύνδεση',
    stamp: 'Διαμόρφωσε το μέλλον',
    caption: (n) => `Κάθε τελεία είναι ένα μέλος της AgoraX: ${n} σήμερα.`,
    scroll: 'κύλιση',
  },
  noise: {
    eyebrow: '01 · Το πρόβλημα',
    beats: [
      {
        title: 'Ψηφίζουμε μία φορά',
        titleEm: 'στα τέσσερα χρόνια.',
        body: 'Μια κάλπη, ένας σταυρός, και μετά αναμονή. Στο ενδιάμεσο, όσοι αποφασίζουν για τη γειτονιά, τον σύλλογο ή την πόλη σπάνια ρωτούν.',
      },
      {
        title: 'Στο ενδιάμεσο,',
        titleEm: 'θόρυβος.',
        body: 'Σχόλια, likes, θυμωμένα κεφαλαία, μηνύματα που χάνονται σε δέκα ομάδες. Ακούγεται όποιος φωνάζει πιο δυνατά, και στο τέλος δεν αποφασίζεται τίποτα.',
      },
      {
        title: 'Η AgoraX βάζει',
        titleEm: 'τάξη.',
        body: 'Η συζήτηση γίνεται σε ένα μέρος, καταλήγει σε ψηφοφορία, και η απόφαση μένει γραμμένη στο Σύνταγμα της κοινότητας, για όποιον τη χρειαστεί.',
      },
    ],
    counters: ['4 χρόνια · 48 μήνες · 1 ψήφος', 'σχόλια · 0 αποφάσεις', 'συζήτηση → ψηφοφορία → απόφαση'],
    shouts: ['Ντροπή!', '+1', 'ΛΑΘΟΣ', '???', 'Όλοι ίδιοι', '!!!', 'Γιατί;', 'Συμφωνώ', 'ΑΙΣΧΟΣ', '−1', 'Ξυπνήστε', '…'],
    groups: ['Συζητάμε', 'Ψηφίζουμε', 'Αποφασίζουμε'],
  },
  kinds: {
    eyebrow: '02 · Ψηφοφορίες',
    title: 'Κάθε απόφαση',
    titleEm: 'με τη σωστή ψηφοφορία.',
    lede: 'Μια απλή απόφαση, μια αλλαγή στο καταστατικό, η εκλογή του ταμία, μια γρήγορη ερώτηση στα μέλη: καθεμία έχει τους δικούς της κανόνες για πλειοψηφία, διάρκεια και απαρτία, και κάθε κοινότητα τους προσαρμόζει. Διαλέξτε είδος και ψηφίστε.',
    kinds: {
      decision: {
        tab: 'Απόφαση',
        question: 'Να φυτευτούν 30 δέντρα στην πλατεία της γειτονιάς;',
        options: ['Υπέρ', 'Κατά', 'Αποχή'],
        counts: [41, 29, 12],
        rule: 'Εγκρίνεται με απλή πλειοψηφία: πάνω από τα μισά «Υπέρ» και «Κατά».',
      },
      statute: {
        tab: 'Καταστατικό',
        question: 'Η γενική συνέλευση να γίνεται δύο φορές τον χρόνο (αλλαγή του άρθρου 7);',
        options: ['Υπέρ', 'Κατά', 'Αποχή'],
        counts: [44, 22, 9],
        rule: 'Θέλει τουλάχιστον τα 2/3 και διαρκεί τουλάχιστον 3 ημέρες.',
      },
      election: {
        tab: 'Εκλογή',
        question: 'Ποιος θα είναι ταμίας του συλλόγου;',
        options: ['Μαρία Κ.', 'Νίκος Π.', 'Ελένη Σ.', 'Λευκό'],
        counts: [24, 21, 9, 3],
        added: [2],
        addedNote: 'Πριν ανοίξει η κάλπη, τα μέλη δήλωσαν υποψηφιότητα ή πρότειναν κάποιον.',
        rule: 'Πρώτα οι υποψηφιότητες, μετά η κάλπη. Εκλέγεται όποιος πάρει τις περισσότερες ψήφους.',
      },
      poll: {
        tab: 'Δημοσκόπηση',
        question: 'Ποια μέρα σας βολεύει για τη συνέλευση;',
        options: ['Τρίτη απόγευμα', 'Πέμπτη απόγευμα', 'Σάββατο πρωί', 'Καμία από τις παραπάνω'],
        counts: [14, 19, 11, 2],
        added: [2],
        addedNote: 'Τα μέλη πρόσθεσαν όσες απαντήσεις έλειπαν πριν ανοίξει η δημοσκόπηση.',
        rule: 'Τα μέλη προσθέτουν απαντήσεις. Δεν δεσμεύει κανέναν: δείχνει μόνο τι απάντησαν.',
      },
    },
    pick: 'Πατήστε μια επιλογή για να ψηφίσετε.',
    again: 'Ψηφίστε ξανά',
    added: 'πρόταση μέλους',
    passes: (p) => `Εγκρίνεται: ${pct('el', p)}% «Υπέρ».`,
    fails: (p) => `Δεν εγκρίνεται: ${pct('el', p)}% «Υπέρ».`,
    failsNeeds: 'Χρειάζονται τουλάχιστον τα 2/3.',
    elected: (n) => `Εκλέγεται: ${n}`,
    pollNote: 'Η δημοσκόπηση δεν αποφασίζει τίποτα: δείχνει μόνο τι απάντησαν τα μέλη.',
    abstainNote: 'Οι αποχές δεν μετράνε στην πλειοψηφία.',
    footer: 'Παράδειγμα με φανταστικά νούμερα. Στην πραγματική ψηφοφορία η ψήφος σας είναι μυστική και παίρνετε απόδειξη.',
  },
  tools: {
    eyebrow: '03 · Η κοινότητα',
    title: 'Όλα όσα χρειάζεται',
    titleEm: 'μια κοινότητα.',
    lede: 'Κάθε κοινότητα στην AgoraX έχει το δικό της forum, ψηφοφορίες, βιβλιοθήκη, βιντεοκλήσεις και Σύνταγμα. Δημόσια ή μόνο για τα μέλη: το αποφασίζει η ίδια.',
    tools: {
      forum: { t: 'Forum', d: 'Θέματα, απαντήσεις και «Χρήσιμο» για τις καλές ιδέες. Όταν μια συζήτηση ωριμάσει, με ένα κουμπί γίνεται ψηφοφορία: η ΤΝ διαβάζει όλο το νήμα και γράφει την πρόταση.' },
      library: { t: 'Βιβλιοθήκη', d: 'Ήχος, βίντεο, έγγραφα και κάρτες Anki για τα μέλη, με τα σημαντικά καρφιτσωμένα στην κορυφή. Μένουν μέσα στην κοινότητα, όχι στη γενική ροή.' },
      media: { t: 'Podcast & βίντεο', d: 'Για κάθε ψηφοφορία η AgoraX γράφει σενάριο για podcast 3–5 λεπτών και βίντεο 45 δευτερολέπτων. Το φτιάχνετε με το NotebookLM ή όποιο εργαλείο θέλετε, το ανεβάζετε, και φαίνεται στη ροή και στα social.' },
      meetings: { t: 'Βιντεοκλήσεις', d: 'Συναντήσεις της κοινότητας στους δικούς μας διακομιστές, με σειρά ομιλητών, πρόσκληση στο ημερολόγιο και ειδοποίηση σε όλα τα μέλη.' },
      polls: { t: 'Δημοσκοπήσεις', d: 'Γράφετε τι θέλετε να μάθετε και η ΤΝ φτιάχνει ουδέτερο ερωτηματολόγιο, που το ελέγχει ένας δεύτερος έλεγχος για καθοδηγητικές ερωτήσεις. Απαντά ανώνυμο πάνελ, και κάθε αποτέλεσμα έχει σελίδα μεθοδολογίας.' },
    },
    community: 'Κοινότητα «Η γειτονιά μας»',
    members: '48 μέλη · αυτόνομη',
    tabs: ['Forum', 'Ψηφοφορίες', 'Σύνταγμα', 'Βιβλιοθήκη', 'Μέλη'],
    platformTabs: ['Podcasts', 'Βίντεο', 'Δημοσκοπήσεις'],
    forum: {
      topics: [
        { t: 'Πού να γίνει φέτος η γιορτή της γειτονιάς;', n: '14 απαντήσεις · 9 βαθμοί', pinned: true },
        { t: 'Ιδέες για το άδειο οικόπεδο στη γωνία', n: '23 απαντήσεις · 17 βαθμοί' },
        { t: 'Ποιος μπορεί να βοηθήσει με τα ποδήλατα των παιδιών;', n: '6 απαντήσεις · 4 βαθμοί' },
      ],
      reply: 'Να γίνει μικρό πάρκο με παγκάκια; Σκιά υπάρχει ήδη από τη μουριά.',
      promote: 'Γίνε πρόταση',
    },
    library: {
      items: [
        { t: 'Πώς λειτουργεί η πλατφόρμα', kind: 'video', pinned: true },
        { t: 'Το καταστατικό του συλλόγου', kind: 'doc', pinned: true },
        { t: 'Ομιλία για το πράσινο στη γειτονιά', kind: 'audio' },
        { t: 'Κάρτες εκμάθησης: το νέο καταστατικό', kind: 'deck' },
      ],
      pinned: 'Καρφιτσωμένο',
      note: 'Ορατά μόνο εδώ, ποτέ στη γενική ροή.',
    },
    media: {
      script: 'Σενάριο podcast · 2 φωνές · 4 λεπτά',
      ready: 'έτοιμο',
      podcast: 'Podcast: «30 δέντρα για την πλατεία»',
      teaser: 'Βίντεο 45 δευτερολέπτων για τα social',
      featured: 'Προτεινόμενο: φαίνεται στη ροή της AgoraX',
      share: 'Facebook, X, WhatsApp, Viber',
    },
    meetings: {
      live: 'Συνάντηση κοινότητας · σε εξέλιξη',
      queue: 'Σειρά ομιλητών: ΝΠ, ΕΣ',
      calendar: 'Προσθήκη στο ημερολόγιο',
      notified: 'Ειδοποιήθηκαν 48 μέλη',
      recording: 'Στους δικούς μας διακομιστές · η ηχογράφηση είναι κλειστή',
    },
    polls: {
      question: 'Θα χρησιμοποιούσατε νέους ποδηλατοδρόμους στη γειτονιά;',
      review: 'Έλεγχος μεθοδολογίας: ουδέτερη διατύπωση, ισορροπημένη κλίμακα',
      answers: [
        ['Σίγουρα ναι', 38, 34],
        ['Μάλλον ναι', 27, 29],
        ['Μάλλον όχι', 19, 21],
        ['Σίγουρα όχι', 16, 16],
      ],
      raw: 'Χωρίς στάθμιση',
      weighted: 'Με στάθμιση',
      tier: 'Πιστοποιημένη',
      method: 'Σελίδα μεθοδολογίας',
    },
  },
  film: {
    eyebrow: '04 · Από την ιδέα στην απόφαση',
    title: 'Από μια ιδέα',
    titleEm: 'σε απόφαση.',
    steps: [
      { t: 'Περιγράψτε', d: 'Γράψτε με απλά λόγια τι θέλετε να ψηφιστεί, ή φέρτε μια συζήτηση από το forum. Η ΤΝ συμπληρώνει τη φόρμα: είδος, ερώτηση, διάρκεια, επιλογές. Εσείς ελέγχετε και διορθώνετε.' },
      { t: 'Συνδιαμορφώστε', d: 'Τα μέλη προτείνουν βελτιώσεις ή αντιπροτάσεις. Όσες δέχεται ο συντάκτης μπαίνουν στο κείμενο· όσες απορρίψει, μπαίνουν αν τις στηρίξει το 70%. Βιάζεστε; Η άμεση ψηφοφορία είναι η προεπιλογή.' },
      { t: 'Ψηφίστε μυστικά', d: 'Η ψήφος σφραγίζεται στη συσκευή σας πριν φύγει. Ο διακομιστής την υπογράφει χωρίς να τη δει, και δεν μπορεί να τη συνδέσει μαζί σας.' },
      { t: 'Αποφασίστε', d: 'Στο ψηφοδέλτιο μπαίνουν και οι αντιπροτάσεις, και πάντα η επιλογή «Καμία αλλαγή». Ό,τι εγκρίνεται γράφεται στο Σύνταγμα της κοινότητας.' },
      { t: 'Επαληθεύστε', d: 'Χωρίς λογαριασμό, ο καθένας ελέγχει ότι η ψήφος του μετρήθηκε και ότι κανείς δεν πείραξε την κάλπη. Ούτε εμείς.' },
    ],
    kinds: ['Απόφαση', 'Καταστατικό', 'Εκλογή', 'Δημοσκόπηση'],
    typed: 'Να φυτέψουμε δέντρα στην πλατεία της γειτονιάς πριν έρθει το καλοκαίρι',
    aiFill: 'Συμπλήρωση με AI',
    aiNote: 'Το AI συμπληρώνει τα πεδία — ελέγξτε και διορθώστε πριν την υποβολή.',
    fTitle: 'Ερώτηση',
    fTitleVal: 'Να φυτευτούν 20 δέντρα στην πλατεία της γειτονιάς;',
    fDuration: 'Διάρκεια ψηφοφορίας',
    durations: ['1 ημέρα', '3 ημέρες', '7 ημέρες'],
    fOptions: 'Επιλογές',
    options: ['Υπέρ', 'Κατά', 'Αποχή'],
    amText: ['Να φυτευτούν', '20', '30', 'δέντρα στην πλατεία της γειτονιάς,', 'με σύστημα ποτίσματος στάγδην.'],
    amBy: 'Βελτίωση από Ε.Κ.: «Χωράνε 30, αν φυτευτούν και στην πλευρά του σχολείου.»',
    amAccept: 'Ο συντάκτης αποδέχεται',
    amReject: 'Απορρίφθηκε: «Πότισμα στάγδην»',
    ovrTitle: 'Τροπολογία «Πότισμα στάγδην» · στήριξη μελών',
    ovrNote: 'Ο συντάκτης την απέρριψε, αλλά τη στηρίζει το 74%, πάνω από το όριο του 70%. Μπαίνει στο κείμενο.',
    ballotTitle: 'Μυστική ψήφος',
    blind: 'Η ψήφος κλείνεται σε «φάκελο» στη συσκευή σας',
    sign: 'Ο διακομιστής υπογράφει τον φάκελο χωρίς να τον ανοίξει',
    unblind: 'Ο φάκελος ανοίγει· η υπογραφή μένει πάνω στην ψήφο',
    cast: 'Η ψήφος πέφτει στην κάλπη χωρίς όνομα',
    delay: 'σε τυχαία στιγμή, μέσα σε 2–3 λεπτά',
    receipt: 'Η απόδειξή σας',
    receiptNote: 'Η επιλογή σας δεν εμφανίζεται εδώ, σκόπιμα: έτσι κανείς δεν μπορεί να σας ζητήσει να αποδείξετε τι ψηφίσατε.',
    receiptHash: FILM_RECEIPT,
    resultTitle: 'Αποτέλεσμα · 3 επιλογές',
    ballot: ['Τελικό κείμενο', 'Αντιπρόταση: πάρκο τσέπης', 'Καμία αλλαγή'],
    passed: 'Εγκρίθηκε',
    constTitle: 'Σύνταγμα της κοινότητας · Μέρος Β — Αποφάσεις',
    constItem: 'Να φυτευτούν 30 δέντρα στην πλατεία της γειτονιάς, με σύστημα ποτίσματος στάγδην.',
    verifyTitle: 'Επαλήθευση ψήφου',
    q1: 'Μετρήθηκε η ψήφος μου;',
    a1: 'Ναι — η ψήφος σου είναι στην κάλπη και μετρήθηκε.',
    q2: 'Είναι ακέραιη η κάλπη;',
    checks: [
      'Καμία ψήφος δεν άλλαξε ούτε σβήστηκε',
      'Ταιριάζει με όσα δημοσιεύσαμε δημόσια στο GitHub',
      'Η ώρα και το περιεχόμενο είναι κλειδωμένα στο Bitcoin',
    ],
    verdict: 'Η κάλπη είναι ακέραιη',
  },
  rules: {
    eyebrow: '05 · Αυτοδιοίκηση',
    title: 'Οι κανόνες ανήκουν',
    titleEm: 'σε όλα τα μέλη.',
    lede: 'Μια αυτόνομη κοινότητα δεν έχει διαχειριστές. Ποιος μπαίνει, ποιος βλέπει τι, πόση συμμετοχή χρειάζεται μια ψηφοφορία: κάθε κανόνας είναι μια ψηφοφορία που δεν κλείνει ποτέ. Αλλάζετε ή αποσύρετε την ψήφο σας όποτε θέλετε, και ο κανόνας ακολουθεί την πλειοψηφία.',
    points: [
      'Επικρατεί η επιλογή με τις περισσότερες ψήφους· σε ισοπαλία μένει η τρέχουσα τιμή.',
      'Ούτε ο ιδρυτής δεν μπορεί να αλλάξει μόνος του έναν κανόνα.',
      'Το Σύνταγμα της κοινότητας ξαναγράφεται μόνο του από τους ισχύοντες κανόνες και τις αποφάσεις που πέρασαν.',
      'Προτιμάτε ομάδα διαχειριστών; Μια κοινότητα μπορεί να είναι και διαχειριζόμενη.',
    ],
    community: 'Κοινότητα «Η γειτονιά μας»',
    autonomous: 'αυτόνομη · χωρίς διαχειριστές',
    setting: 'Πολιτική εγγραφής',
    current: 'Τρέχουσα',
    options: { open: 'Ανοιχτή', approval: 'Έγκριση', invite_only: 'Μόνο με πρόσκληση' },
    you: 'Εσείς',
    vote: 'Ψηφίστε',
    yourVote: 'Η ψήφος σας',
    withdraw: 'Αποσύρετε την ψήφο σας',
    nudge: 'Ένα άλλο μέλος αλλάζει γνώμη',
    tie: 'Ισοπαλία: μένει η τρέχουσα τιμή.',
    lead: (o) => `Προηγείται: ${o}.`,
    flipped: (o) => `Η πλειοψηφία άλλαξε. Ο κανόνας είναι τώρα: ${o}.`,
    constTitle: 'Σύνταγμα · Μέρος Α — Κανόνες',
    art1Title: 'Διακυβέρνηση',
    art1: 'Η κοινότητα είναι αυτόνομη: δεν έχει διαχειριστές. Οι κανόνες της αλλάζουν μόνο με ψηφοφορία των μελών.',
    art2Title: 'Μέλη',
    articles: {
      open: 'Οποιοσδήποτε μπορεί να γίνει μέλος.',
      approval: 'Η ένταξη νέων μελών χρειάζεται έγκριση.',
      invite_only: 'Νέα μέλη εντάσσονται μόνο με πρόσκληση.',
    },
    fingerprint: 'Αποτύπωμα',
  },
  chain: {
    eyebrow: '06 · Η κάλπη',
    title: 'Μια κάλπη που δεν πειράζεται.',
    titleEm: 'Ούτε από εμάς.',
    lede: 'Κάθε ψήφος «δένεται» με την προηγούμενη, σαν κρίκοι σε αλυσίδα. Αν κάποιος αλλάξει έστω και μία, φαίνεται αμέσως. Δοκιμάστε το: πατήστε μια ψήφο για να την αλλάξετε κρυφά.',
    layers: [
      { t: 'Μια αλυσίδα από ψήφους', d: 'Κάθε ψήφος παίρνει ένα αποτύπωμα που εξαρτάται και από την προηγούμενη. Αλλάζει μία; Το αποτύπωμά της δεν ταιριάζει πια.' },
      { t: 'Δημόσια στο GitHub', d: 'Κάθε δέκα λεπτά αναρτούμε το αποτύπωμα όλης της κάλπης στο GitHub, δημόσια και με ημερομηνία. Σαν ανακοίνωση σε πίνακα που δεν μπορούμε να ξεκολλήσουμε.' },
      { t: 'Σφραγίδα στο blockchain', d: 'Το ίδιο αποτύπωμα γράφεται στο blockchain του Bitcoin, που δεν το ελέγχει κανείς, ούτε εμείς. Σαν σφραγίδα συμβολαιογράφου που δεν σβήνει.' },
    ],
    secret: 'Και η ψήφος σας μένει μυστική: ο διακομιστής δεν μπορεί να τη συνδέσει μαζί σας, και η απόδειξη που παίρνετε δεν δείχνει τι ψηφίσατε. Με αυτήν ελέγχετε, χωρίς λογαριασμό, ότι μετρήθηκε.',
    box: 'Η κάλπη μιας ψηφοφορίας',
    example: 'παράδειγμα · υπολογίζεται ζωντανά',
    choice: { yes: 'Υπέρ', no: 'Κατά', abstain: 'Αποχή' },
    prev: 'δεμένη με',
    seal: 'αποτύπωμα',
    tamper: 'Αλλάξτε μια ψήφο κρυφά',
    tamperHint: 'Πατήστε για να αλλάξετε αυτή την ψήφο',
    cover: 'Κρύψτε το: ξαναφτιάξτε όλα τα αποτυπώματα',
    reset: 'Επαναφορά',
    castTitle: 'Ψηφίστε κι εσείς:',
    receiptTitle: 'Η απόδειξή σας',
    receiptNote: 'Η επιλογή σας δεν εμφανίζεται εδώ, σκόπιμα: έτσι κανείς δεν μπορεί να σας ζητήσει να αποδείξετε τι ψηφίσατε.',
    published: 'Αναρτήθηκε στο GitHub',
    now: 'Η κάλπη τώρα',
    bitcoin: 'Blockchain',
    bitcoinValue: 'Bitcoin ✓',
    verdictOk: 'Η κάλπη είναι ακέραιη',
    verdictBroken: 'Κάποια ψήφος άλλαξε',
    verdictMoved: 'Δεν ταιριάζει με όσα αναρτήθηκαν',
    explainOk: 'Όλα τα αποτυπώματα ταιριάζουν, και αυτό που αναρτήθηκε στο GitHub βρίσκεται ακόμη μέσα στην κάλπη.',
    explainBroken: 'Η ψήφος που αλλάξατε δεν ταιριάζει πια με το αποτύπωμά της, και ο έλεγχος το βρίσκει αμέσως. Δοκιμάστε να το κρύψετε.',
    explainMoved: 'Τώρα η αλυσίδα μοιάζει σωστή, αλλά το αποτύπωμα που αναρτήθηκε στο GitHub και σφραγίστηκε στο blockchain δεν υπάρχει πια μέσα της. Η αλλαγή φαίνεται σε όλους.',
    verifyLink: 'Ελέγξτε μια πραγματική κάλπη',
    fine: 'Τεχνικά: κάθε αποτύπωμα είναι SHA-256, υπολογισμένο εδώ με την ίδια συνταγή που χρησιμοποιεί ο διακομιστής. Η σφραγίδα στο Bitcoin γίνεται μέσω OpenTimestamps.',
  },
  live: {
    eyebrow: '07 · Σήμερα στην AgoraX',
    title: 'Αληθινές κοινότητες,',
    titleEm: 'αληθινές αποφάσεις.',
    lede: 'Οι πιο πρόσφατες δημόσιες ψηφοφορίες, όπως είναι αυτή τη στιγμή.',
    more: 'Όλες οι ψηφοφορίες',
  },
  end: {
    title: 'Η επόμενη απόφαση',
    titleEm: 'της κοινότητάς σας.',
    lede: 'Φτιάξτε τη δική σας κοινότητα ή μπείτε σε μια υπάρχουσα. Στην αρχή όλα μένουν απλά: μια ερώτηση, μια ψηφοφορία. Τα υπόλοιπα είναι εκεί όταν τα χρειαστείτε.',
    register: 'Εγγραφή',
    browse: 'Δείτε τις ψηφοφορίες',
    story: 'Μια ιστορία από την αρχή ως το τέλος',
    how: 'Όλες οι λεπτομέρειες',
    fine: 'Πιλοτική λειτουργία: οι ψηφοφορίες είναι συμβουλευτικές και δεν έχουν νομική δέσμευση.',
    source: 'Ανοιχτός κώδικας στο GitHub',
  },
};

const en: TourCopy = {
  chapters: ['Start', 'The problem', 'Votes', 'The community', 'From idea to decision', 'Self-government', 'The ballot box', 'Today'],
  stats: ['members', 'communities', 'votes', 'decisions'],
  hero: {
    eyebrow: 'AgoraX · a short tour',
    title: ['Discuss.', 'Vote.', 'Decide.'],
    lede: 'AgoraX is where an association, a neighbourhood or a group discusses, votes and decides. Forum, votes, polls, library, video and podcasts, all in one place, with a ballot box anyone can check.',
    tour: 'Take the tour',
    register: 'Join',
    signIn: 'Sign in',
    stamp: 'Shape the future',
    caption: (n) => `Every dot is an AgoraX member: ${n} today.`,
    scroll: 'scroll',
  },
  noise: {
    eyebrow: '01 · The problem',
    beats: [
      {
        title: 'We vote once',
        titleEm: 'every four years.',
        body: 'One ballot, one cross, then waiting. In between, those who decide for the neighbourhood, the association or the city rarely ask.',
      },
      {
        title: 'In between,',
        titleEm: 'noise.',
        body: 'Comments, likes, angry capitals, messages lost across ten group chats. The loudest voice gets heard, and in the end nothing is decided.',
      },
      {
        title: 'AgoraX brings',
        titleEm: 'order.',
        body: 'The discussion happens in one place, ends in a vote, and the decision stays written in the community’s constitution for anyone who needs it.',
      },
    ],
    counters: ['4 years · 48 months · 1 vote', 'comments · 0 decisions', 'discussion → vote → decision'],
    shouts: ['Shame!', '+1', 'WRONG', '???', 'All the same', '!!!', 'Why?', 'Agreed', 'DISGRACE', '−1', 'Wake up', '…'],
    groups: ['We discuss', 'We vote', 'We decide'],
  },
  kinds: {
    eyebrow: '02 · Votes',
    title: 'The right vote',
    titleEm: 'for every decision.',
    lede: 'A simple decision, a change to the statute, electing a treasurer, a quick question to members: each has its own rules for majority, duration and quorum, and every community can adjust them. Pick a kind and vote.',
    kinds: {
      decision: {
        tab: 'Decision',
        question: 'Should we plant 30 trees in the neighbourhood square?',
        options: ['For', 'Against', 'Abstain'],
        counts: [41, 29, 12],
        rule: 'Passes by simple majority: more than half of For and Against.',
      },
      statute: {
        tab: 'Statute',
        question: 'Hold the general assembly twice a year (amending article 7)?',
        options: ['For', 'Against', 'Abstain'],
        counts: [44, 22, 9],
        rule: 'Needs at least two thirds and runs for at least 3 days.',
      },
      election: {
        tab: 'Election',
        question: 'Who should be the association’s treasurer?',
        options: ['Maria K.', 'Nikos P.', 'Eleni S.', 'Blank'],
        counts: [24, 21, 9, 3],
        added: [2],
        addedNote: 'Before the ballot opened, members stood as candidates or put someone forward.',
        rule: 'Candidacies first, then the ballot. Whoever gets the most votes is elected.',
      },
      poll: {
        tab: 'Poll',
        question: 'Which day suits you for the assembly?',
        options: ['Tuesday evening', 'Thursday evening', 'Saturday morning', 'None of the above'],
        counts: [14, 19, 11, 2],
        added: [2],
        addedNote: 'Members added the answers that were missing before the poll opened.',
        rule: 'Members add answers. It binds no one: it only shows what they said.',
      },
    },
    pick: 'Tap an option to vote.',
    again: 'Vote again',
    added: 'added by a member',
    passes: (p) => `Passes: ${pct('en', p)}% For.`,
    fails: (p) => `Does not pass: ${pct('en', p)}% For.`,
    failsNeeds: 'It needs at least two thirds.',
    elected: (n) => `Elected: ${n}`,
    pollNote: 'A poll decides nothing: it only shows what members answered.',
    abstainNote: 'Abstentions do not count toward the majority.',
    footer: 'An example with made-up numbers. In a real vote your ballot is secret and you get a receipt.',
  },
  tools: {
    eyebrow: '03 · The community',
    title: 'Everything',
    titleEm: 'a community needs.',
    lede: 'Every community on AgoraX has its own forum, votes, library, video calls and constitution. Public or members-only: the community decides.',
    tools: {
      forum: { t: 'Forum', d: 'Topics, replies and “Useful” for the good ideas. When a discussion is ready, one button turns it into a vote: the AI reads the whole thread and drafts the proposal.' },
      library: { t: 'Library', d: 'Audio, video, documents and Anki decks for members, with the important ones pinned on top. They stay inside the community, never in the public feed.' },
      media: { t: 'Podcasts & video', d: 'For every vote AgoraX writes a script for a 3–5 minute podcast and a 45-second video. You produce it with NotebookLM or any tool you like, upload it, and it shows in the feed and on social media.' },
      meetings: { t: 'Video calls', d: 'Community meetings on our own servers, with a speaking queue, a calendar invite and a notice to every member.' },
      polls: { t: 'Polls', d: 'You write what you want to learn and the AI drafts a neutral questionnaire, which a second check screens for leading questions. An anonymous panel answers, and every result has a methodology page.' },
    },
    community: 'Community “Our neighbourhood”',
    members: '48 members · autonomous',
    tabs: ['Forum', 'Votes', 'Constitution', 'Library', 'Members'],
    platformTabs: ['Podcasts', 'Videos', 'Polls'],
    forum: {
      topics: [
        { t: 'Where should this year’s street party be?', n: '14 replies · 9 points', pinned: true },
        { t: 'Ideas for the empty lot on the corner', n: '23 replies · 17 points' },
        { t: 'Who can help with the children’s bikes?', n: '6 replies · 4 points' },
      ],
      reply: 'A small park with benches? The mulberry tree already gives shade.',
      promote: 'Make it a proposal',
    },
    library: {
      items: [
        { t: 'How the platform works', kind: 'video', pinned: true },
        { t: 'The association’s statute', kind: 'doc', pinned: true },
        { t: 'A talk on greening the neighbourhood', kind: 'audio' },
        { t: 'Flashcards: the new statute', kind: 'deck' },
      ],
      pinned: 'Pinned',
      note: 'Visible only here, never in the public feed.',
    },
    media: {
      script: 'Podcast script · 2 voices · 4 minutes',
      ready: 'ready',
      podcast: 'Podcast: “Thirty trees for the square”',
      teaser: '45-second video for social media',
      featured: 'Featured: shows in the AgoraX feed',
      share: 'Facebook, X, WhatsApp, Viber',
    },
    meetings: {
      live: 'Community meeting · live',
      queue: 'Speaking queue: NP, ES',
      calendar: 'Add to calendar',
      notified: '48 members notified',
      recording: 'On our own servers · recording is off',
    },
    polls: {
      question: 'Would you use new bike lanes in the neighbourhood?',
      review: 'Methodology check: neutral wording, balanced scale',
      answers: [
        ['Definitely yes', 38, 34],
        ['Probably yes', 27, 29],
        ['Probably not', 19, 21],
        ['Definitely not', 16, 16],
      ],
      raw: 'Unweighted',
      weighted: 'Weighted',
      tier: 'Certified',
      method: 'Methodology page',
    },
  },
  film: {
    eyebrow: '04 · From idea to decision',
    title: 'From an idea',
    titleEm: 'to a decision.',
    steps: [
      { t: 'Describe', d: 'Write in plain words what you want put to a vote, or bring over a discussion from the forum. The AI fills in the form: kind, question, duration, options. You check it and correct it.' },
      { t: 'Co-draft', d: 'Members suggest improvements or counter-proposals. Those the author accepts go into the text; those rejected go in anyway if 70% support them. In a hurry? A direct vote is the default.' },
      { t: 'Vote in secret', d: 'Your ballot is sealed on your device before it leaves. The server signs it without seeing it, and cannot link it to you.' },
      { t: 'Decide', d: 'Counter-proposals stand on the ballot too, and “No change” is always an option. Whatever passes is written into the community’s constitution.' },
      { t: 'Verify', d: 'Without an account, anyone can check that their vote was counted and that nobody touched the ballot box. Not even us.' },
    ],
    kinds: ['Decision', 'Statute', 'Election', 'Poll'],
    typed: 'Let’s plant trees in the neighbourhood square before summer comes',
    aiFill: 'Fill in with AI',
    aiNote: 'The AI fills the fields below — review and edit before submitting.',
    fTitle: 'Question',
    fTitleVal: 'Should we plant 20 trees in the neighbourhood square?',
    fDuration: 'Voting period',
    durations: ['1 day', '3 days', '7 days'],
    fOptions: 'Options',
    options: ['For', 'Against', 'Abstain'],
    amText: ['Plant', '20', '30', 'trees in the neighbourhood square,', 'with drip irrigation.'],
    amBy: 'Improvement by E.K.: “Thirty fit if we also plant along the school side.”',
    amAccept: 'The author accepts',
    amReject: 'Rejected: “Drip irrigation”',
    ovrTitle: 'Amendment “Drip irrigation” · member support',
    ovrNote: 'The author rejected it, but 74% support it, above the 70% line. It goes into the text.',
    ballotTitle: 'Secret ballot',
    blind: 'Your ballot is sealed in an “envelope” on your device',
    sign: 'The server signs the envelope without opening it',
    unblind: 'The envelope opens; the signature stays on the ballot',
    cast: 'The ballot drops into the box with no name on it',
    delay: 'at a random moment within 2–3 minutes',
    receipt: 'Your receipt',
    receiptNote: 'Your choice is deliberately not shown here, so nobody can ask you to prove how you voted.',
    receiptHash: FILM_RECEIPT,
    resultTitle: 'Result · 3 options',
    ballot: ['Final text', 'Counter-proposal: a pocket park', 'No change'],
    passed: 'Approved',
    constTitle: 'Community constitution · Part B — Decisions',
    constItem: 'Thirty trees shall be planted in the neighbourhood square, with drip irrigation.',
    verifyTitle: 'Verify a vote',
    q1: 'Was my vote counted?',
    a1: 'Yes — your vote is in the ballot box and was counted.',
    q2: 'Is the ballot box intact?',
    checks: [
      'No vote was changed or deleted',
      'Matches what we published publicly on GitHub',
      'Its time and content are locked into Bitcoin',
    ],
    verdict: 'The ballot box is intact',
  },
  rules: {
    eyebrow: '05 · Self-government',
    title: 'The rules belong',
    titleEm: 'to every member.',
    lede: 'An autonomous community has no admins. Who can join, who sees what, how much turnout a vote needs: every rule is a vote that never closes. Change or withdraw your vote whenever you like, and the rule follows the majority.',
    points: [
      'The option with the most votes wins; a tie keeps the current value.',
      'Not even the founder can change a rule alone.',
      'The community’s constitution rewrites itself from the rules in force and the decisions that passed.',
      'Prefer an admin team? A community can be managed instead.',
    ],
    community: 'Community “Our neighbourhood”',
    autonomous: 'autonomous · no admins',
    setting: 'Join policy',
    current: 'Current',
    options: { open: 'Open', approval: 'Approval', invite_only: 'Invite only' },
    you: 'You',
    vote: 'Vote',
    yourVote: 'Your vote',
    withdraw: 'Withdraw your vote',
    nudge: 'Another member changes their mind',
    tie: 'A tie: the current value stays.',
    lead: (o) => `Leading: ${o}.`,
    flipped: (o) => `The majority moved. The rule is now: ${o}.`,
    constTitle: 'Constitution · Part A — Rules',
    art1Title: 'Governance',
    art1: 'The community is autonomous: it has no admins. Its rules change only by a vote of the members.',
    art2Title: 'Membership',
    articles: {
      open: 'Anyone may join.',
      approval: 'New members need approval to join.',
      invite_only: 'New members join by invitation only.',
    },
    fingerprint: 'Fingerprint',
  },
  chain: {
    eyebrow: '06 · The ballot box',
    title: 'A ballot box nobody can alter.',
    titleEm: 'Not even us.',
    lede: 'Every vote is tied to the one before it, like links in a chain. Change even one and it shows at once. Try it: tap a vote to change it quietly.',
    layers: [
      { t: 'A chain of votes', d: 'Each vote gets a fingerprint that also depends on the one before. Change one, and its fingerprint no longer matches.' },
      { t: 'Public on GitHub', d: 'Every ten minutes we post the fingerprint of the whole box on GitHub, publicly and dated. Like a notice pinned to a board we cannot take down.' },
      { t: 'Sealed on the blockchain', d: 'The same fingerprint is written into the Bitcoin blockchain, which nobody controls, including us. Like a notary’s stamp that never fades.' },
    ],
    secret: 'And your vote stays secret: the server cannot link it to you, and the receipt you get does not show how you voted. With it you can check, without an account, that your vote was counted.',
    box: 'The ballot box of one vote',
    example: 'example · computed live',
    choice: { yes: 'For', no: 'Against', abstain: 'Abstain' },
    prev: 'tied to',
    seal: 'fingerprint',
    tamper: 'Quietly change a vote',
    tamperHint: 'Tap to change this vote',
    cover: 'Cover it up: redo every fingerprint',
    reset: 'Reset',
    castTitle: 'Cast a vote yourself:',
    receiptTitle: 'Your receipt',
    receiptNote: 'Your choice is deliberately not shown here, so nobody can ask you to prove how you voted.',
    published: 'Posted on GitHub',
    now: 'The box now',
    bitcoin: 'Blockchain',
    bitcoinValue: 'Bitcoin ✓',
    verdictOk: 'The ballot box is intact',
    verdictBroken: 'A vote was changed',
    verdictMoved: 'Does not match what was posted',
    explainOk: 'Every fingerprint matches, and the one posted on GitHub is still inside the box.',
    explainBroken: 'The vote you changed no longer matches its fingerprint, and the check finds it at once. Try covering it up.',
    explainMoved: 'Now the chain looks right, but the fingerprint posted on GitHub and sealed on the blockchain is no longer inside it. The change shows to everyone.',
    verifyLink: 'Check a real ballot box',
    fine: 'Technically: each fingerprint is a SHA-256 hash, computed here with the same recipe the server uses. The Bitcoin seal is made through OpenTimestamps.',
  },
  live: {
    eyebrow: '07 · Today on AgoraX',
    title: 'Real communities,',
    titleEm: 'real decisions.',
    lede: 'The latest public votes, as they stand right now.',
    more: 'All votes',
  },
  end: {
    title: 'Your community’s',
    titleEm: 'next decision.',
    lede: 'Start your own community or join one that exists. At first everything stays simple: one question, one vote. The rest is there when you need it.',
    register: 'Join',
    browse: 'See the votes',
    story: 'A story from start to finish',
    how: 'All the details',
    fine: 'Pilot: votes are consultative and not legally binding.',
    source: 'Open source on GitHub',
  },
};

export const TOUR_COPY: Record<Lang, TourCopy> = { el, en };
