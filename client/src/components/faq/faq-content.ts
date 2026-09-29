/**
 * The FAQ, grouped by topic, in both languages side by side.
 *
 * Every answer opens with a one- or two-sentence short answer (shown in bold,
 * so a reader who scans gets the point), then the details. It lives here
 * rather than in the locale dictionaries because it is long-form copy read
 * as one piece, like the landing tour's. The ballot-box answers reuse the
 * faq.q15_* keys, which the /verify page shows too, so the two never drift.
 *
 * Every claim is checked against the code: the vote kinds and their default
 * terms (shared/proposal-kinds.ts), the amendment override at 70%
 * (server/utils/ai-merger.ts), who may start a meeting
 * (server/routers/livekit.ts). The sortition answer shows faq.q11_*, written
 * with the sortition code; this file only adds its short answer.
 */

export type Lang = 'el' | 'en';
export type TopicId = 'basics' | 'votes' | 'security' | 'communities' | 'tools' | 'polls' | 'account';

export interface FaqItem {
  id: string;
  q: string;
  short: string;
  body?: string[];
  bullets?: string[];
  /** Numbered points from faq.q15_p{n}_title/_body, shared with /verify. */
  points?: number[];
  /** Close with the faq.q15_summary one-liner. */
  summary?: boolean;
  /** Question and details from locale keys another page or session owns. */
  keys?: { q: string; body: string };
  links?: { label: string; href: string }[];
}

export interface FaqTopic {
  id: TopicId;
  title: string;
  blurb: string;
  items: FaqItem[];
}

export interface FaqCopy {
  eyebrow: string;
  title: string;
  lede: string;
  search: string;
  clear: string;
  found: (n: number) => string;
  none: string;
  popular: string;
  popularIds: string[];
  more: string;
  topics: FaqTopic[];
  stillTitle: string;
  stillText: string;
  guide: string;
  how: string;
  top: string;
}

const el: FaqCopy = {
  eyebrow: 'Βοήθεια',
  title: 'Συχνές ερωτήσεις',
  lede: 'Η σύντομη απάντηση είναι πάντα πρώτη, με έντονα γράμματα. Ανοίξτε μια ερώτηση για τις λεπτομέρειες ή ψάξτε μια λέξη.',
  search: 'Ψάξτε, π.χ. μυστική ψήφος, κοινότητα, δεδομένα…',
  clear: 'Καθαρισμός',
  found: (n) => (n === 1 ? '1 ερώτηση' : `${n} ερωτήσεις`),
  none: 'Δεν βρέθηκε ερώτηση με αυτές τις λέξεις. Δοκιμάστε κάτι πιο γενικό ή γράψτε μας.',
  popular: 'Αυτά ρωτάνε πιο συχνά',
  popularIds: ['secret', 'new-vote', 'free'],
  more: 'Περισσότερα',
  topics: [
    {
      id: 'basics',
      title: 'Τα βασικά',
      blurb: 'Τι είναι η Αγορά και πώς ξεκινάτε.',
      items: [
        {
          id: 'what',
          q: 'Τι είναι η Αγορά;',
          short: 'Ένα μέρος όπου μια κοινότητα συζητά, ψηφίζει και αποφασίζει μαζί, με μυστική ψήφο που μπορεί να ελέγξει ο καθένας.',
          body: [
            'Φτιάχνετε ή μπαίνετε σε μια κοινότητα: σύλλογο, γειτονιά, συνέλευση, ομάδα. Εκεί υπάρχουν forum για συζήτηση, ψηφοφορίες, βιβλιοθήκη, βιντεοκλήσεις και το Σύνταγμα της κοινότητας.',
            'Ένα θέμα πηγαίνει είτε κατευθείαν σε ψηφοφορία είτε πρώτα σε συνδιαμόρφωση, όπου τα μέλη βελτιώνουν το κείμενο. Με τις δημοσκοπήσεις μετράτε τη γνώμη των μελών, ανώνυμα.',
          ],
        },
        {
          id: 'start',
          q: 'Πώς ξεκινάω;',
          short: 'Εγγραφείτε με Google ή με email. Μπαίνετε αυτόματα στη Γενική Κοινότητα και μπορείτε αμέσως να ψηφίσετε ή να ξεκινήσετε μια ψηφοφορία.',
          body: ['Από τις «Κοινότητες» βρίσκετε κι άλλες κοινότητες ή φτιάχνετε τη δική σας. Ο Οδηγός χρήσης δείχνει όλη τη διαδρομή, βήμα βήμα.'],
          links: [
            { label: 'Εγγραφή', href: '/auth?tab=register' },
            { label: 'Οδηγός χρήσης', href: '/walkthrough' },
          ],
        },
        {
          id: 'free',
          q: 'Είναι δωρεάν;',
          short: 'Ναι. Εγγραφή, κοινότητες, συζητήσεις και ψηφοφορίες δεν κοστίζουν τίποτα.',
          body: ['Η Αγορά είναι ανοιχτός κώδικας. Αν θέλετε να τη στηρίξετε, υπάρχει δωρεά μέσω GitHub Sponsors στη σελίδα Υποστήριξη.'],
          links: [{ label: 'Υποστήριξη', href: '/support' }],
        },
        {
          id: 'different',
          q: 'Σε τι διαφέρει από μια ομάδα στο Facebook ή ένα Google Form;',
          short: 'Η συζήτηση καταλήγει σε απόφαση, η ψήφος είναι μυστική και επαληθεύσιμη, και οι κανόνες ανήκουν στα μέλη.',
          bullets: [
            'Μία ψήφος ανά μέλος, και κανείς δεν βλέπει τι ψήφισε ο καθένας, ούτε εμείς.',
            'Όποιος θέλει ελέγχει ότι η κάλπη δεν πειράχτηκε, χωρίς λογαριασμό.',
            'Οι αντίθετες ιδέες δεν χάνονται: οι αντιπροτάσεις που βρίσκουν στήριξη μπαίνουν στο ψηφοδέλτιο.',
            'Ό,τι αποφασίζεται μένει γραμμένο στο Σύνταγμα της κοινότητας.',
          ],
        },
        {
          id: 'app',
          q: 'Υπάρχει εφαρμογή για κινητό;',
          short: 'Ναι, για Android: την κατεβάζετε από το κάτω μέρος κάθε σελίδας. Σε iPhone η Αγορά δουλεύει κανονικά από τον browser.',
          body: ['Με την εφαρμογή, ή με ενεργές ειδοποιήσεις στον browser, μαθαίνετε αμέσως όταν ανοίγει μια ψηφοφορία ή μια συνάντηση.'],
        },
      ],
    },
    {
      id: 'votes',
      title: 'Ψηφοφορίες',
      blurb: 'Πώς ξεκινάτε μια ψηφοφορία και πώς μετράει.',
      items: [
        {
          id: 'new-vote',
          q: 'Πώς ξεκινάω μια ψηφοφορία;',
          short: 'Πατήστε «Νέο +», διαλέξτε τι ψηφίζετε, γράψτε την ιδέα σας με απλά λόγια και αφήστε το AI να συμπληρώσει τη φόρμα. Ελέγχετε τα πεδία και πατάτε «Έναρξη ψηφοφορίας».',
          body: [
            'Διαλέγετε την κοινότητα και πόσο θα διαρκέσει η ψηφοφορία, μέσα στα όρια της κοινότητας. Στις «Περισσότερες ρυθμίσεις» βρίσκονται η συνδιαμόρφωση, η κατηγορία και η εικόνα. Αν δεν είστε έτοιμοι, την κρατάτε ως προσχέδιο.',
          ],
          links: [{ label: 'Δείτε το στον Οδηγό χρήσης', href: '/walkthrough' }],
        },
        {
          id: 'kinds',
          q: 'Τι είδη ψηφοφορίας υπάρχουν;',
          short: 'Τέσσερα: απόφαση, καταστατικό, εκλογή και δημοσκόπηση κοινότητας. Το καθένα έχει τους δικούς του κανόνες.',
          bullets: [
            'Απόφαση: η κοινότητα εγκρίνει ή απορρίπτει. Περνά με απλή πλειοψηφία, δηλαδή με πάνω από τα μισά «Υποστήριξη» και «Αντίθεση».',
            'Καταστατικό: έγκριση ή αλλαγή κανονισμού. Θέλει τουλάχιστον τα 2/3 και διαρκεί τουλάχιστον 3 ημέρες.',
            'Εκλογή: επιλογή προσώπου για μια θέση. Πρώτα τα μέλη δηλώνουν υποψηφιότητα ή προτείνουν κάποιον, μετά ανοίγει η κάλπη. Εκλέγεται όποιος πάρει τις περισσότερες ψήφους.',
            'Δημοσκόπηση κοινότητας: η γνώμη των μελών, χωρίς δέσμευση. Τα μέλη μπορούν να προσθέσουν απαντήσεις που λείπουν.',
          ],
          body: ['Αυτές είναι οι προεπιλογές. Κάθε κοινότητα ορίζει για κάθε είδος αν επιτρέπεται, πόσο διαρκεί, τι πλειοψηφία χρειάζεται και ποια απαρτία.'],
        },
        {
          id: 'codraft',
          q: 'Τι είναι η συνδιαμόρφωση;',
          short: 'Μια προαιρετική φάση πριν από την κάλπη, όπου τα μέλη βελτιώνουν μαζί το κείμενο. Η προεπιλογή είναι η άμεση ψηφοφορία.',
          bullets: [
            'Κάθε μέλος προτείνει βελτίωση ή αντιπρόταση και ψηφίζει ⬆/⬇ τις προτάσεις των άλλων.',
            'Ο συντάκτης δέχεται ή απορρίπτει κάθε βελτίωση· όσες δεχτεί μπαίνουν στο κείμενο.',
            'Μια βελτίωση που απέρριψε μπαίνει παρ’ όλα αυτά, αν τη στηρίζει τουλάχιστον το 70% όσων την ψήφισαν.',
            'Οι αντιπροτάσεις που βρίσκουν στήριξη μπαίνουν στο ψηφοδέλτιο ως εναλλακτικές, δίπλα στο τελικό κείμενο και στο «Καμία αλλαγή».',
            'Σε εκλογή η φάση αυτή μαζεύει υποψηφιότητες, σε δημοσκόπηση απαντήσεις.',
          ],
        },
        {
          id: 'ai',
          q: 'Τι κάνει η τεχνητή νοημοσύνη;',
          short: 'Βοηθάει, δεν αποφασίζει. Συμπληρώνει τη φόρμα από την περιγραφή σας, συνθέτει το τελικό κείμενο από τις βελτιώσεις και γράφει σενάρια για podcast και βίντεο.',
          body: [
            'Πριν μια πρόταση μπει σε συνδιαμόρφωση, ένας αυτόματος έλεγχος κοιτάζει αν είναι σαφής και σχετική με την κοινότητα. Σταματά περιεχόμενο που παραβιάζει τους Όρους Χρήσης, όπως βία, μίσος ή προσωπικά δεδομένα τρίτων, και επιστρέφει στον συντάκτη κείμενα που δεν βγάζουν νόημα.',
            'Όλα αυτά γίνονται μέσω παρόχου με σύμβαση επεξεργασίας δεδομένων, όχι μέσω δημόσιων υπηρεσιών AI.',
          ],
        },
        {
          id: 'result',
          q: 'Πότε και πώς βγαίνει το αποτέλεσμα;',
          short: 'Μόλις λήξει η ψηφοφορία. Αν η κοινότητα έχει ορίσει απαρτία, πρέπει να ψηφίσει τουλάχιστον τόσο ποσοστό των μελών για να μετρήσει.',
          body: [
            'Οι αποχές δεν μετράνε στην πλειοψηφία. Ό,τι εγκρίνεται γράφεται αυτόματα στο Σύνταγμα της κοινότητας. Η δημοσκόπηση δεν εγκρίνεται ούτε απορρίπτεται: δείχνει μόνο τι απάντησαν τα μέλη.',
          ],
        },
        {
          id: 'change',
          q: 'Μπορώ να αλλάξω την ψήφο μου;',
          short: 'Στην ανώνυμη ψηφοφορία, που είναι η προεπιλογή, όχι. Η ψήφος δεν συνδέεται μαζί σας, άρα κανείς δεν μπορεί να τη βρει για να την αλλάξει.',
          body: ['Γι’ αυτό σας ζητάμε επιβεβαίωση πριν την καταθέσετε. Σε ψηφοφορία με ονομαστική ψήφο μπορείτε να την αλλάξετε μέχρι να λήξει.'],
        },
      ],
    },
    {
      id: 'security',
      title: 'Ασφάλεια & μυστικότητα',
      blurb: 'Γιατί η ψήφος σας μένει μυστική και η κάλπη δεν πειράζεται.',
      items: [
        {
          id: 'secret',
          q: 'Είναι μυστική η ψήφος μου;',
          short: 'Ναι. Κανείς δεν μπορεί να συνδέσει την ψήφο με εσάς, ούτε εμείς που φιλοξενούμε την πλατφόρμα.',
          points: [1, 2],
        },
        {
          id: 'intact',
          q: 'Πώς ξέρω ότι η κάλπη δεν πειράχτηκε;',
          short: 'Κάθε ψήφος «δένεται» με την προηγούμενη, το αποτύπωμα της κάλπης δημοσιεύεται κάθε 10 λεπτά στο GitHub και σφραγίζεται στο blockchain του Bitcoin.',
          points: [3, 5, 6],
          summary: true,
          links: [{ label: 'Ελέγξτε μια κάλπη', href: '/verify' }],
        },
        {
          id: 'receipt',
          q: 'Τι είναι η απόδειξη ψήφου;',
          short: 'Ένα αποτύπωμα που μένει στη συσκευή σας και αποδεικνύει ότι η ψήφος σας μετρήθηκε, χωρίς να δείχνει τι ψηφίσατε.',
          points: [4],
        },
        {
          id: 'verify',
          q: 'Πώς το ελέγχω μόνος μου;',
          short: 'Στη σελίδα Επαλήθευση, χωρίς λογαριασμό: με το αποτύπωμα της απόδειξής σας ή απλώς με τον αριθμό μιας ψηφοφορίας.',
          links: [{ label: 'Επαλήθευση', href: '/verify' }],
        },
      ],
    },
    {
      id: 'communities',
      title: 'Κοινότητες & κανόνες',
      blurb: 'Πώς οργανώνεται μια κοινότητα και ποιος ορίζει τους κανόνες.',
      items: [
        {
          id: 'community',
          q: 'Τι είναι οι κοινότητες;',
          short: 'Ομάδες με κοινό ενδιαφέρον, όπως μια γειτονιά, ένας σύλλογος ή μια συνέλευση, με δικό τους forum, ψηφοφορίες, βιβλιοθήκη και Σύνταγμα.',
          body: [
            'Κάθε κοινότητα αποφασίζει αν το περιεχόμενό της είναι δημόσιο ή μόνο για τα μέλη, και αν μπαίνει όποιος θέλει, με έγκριση ή μόνο με πρόσκληση. Οι ψήφοι μετράνε μόνο μέσα στην κοινότητα. Στη Γενική Κοινότητα είναι όλοι μέλη από την εγγραφή τους.',
          ],
          links: [{ label: 'Κοινότητες', href: '/communities' }],
        },
        {
          id: 'autonomous',
          q: 'Αυτόνομη ή διαχειριζόμενη κοινότητα;',
          short: 'Στην αυτόνομη δεν υπάρχουν διαχειριστές και οι κανόνες αλλάζουν μόνο με ψηφοφορία των μελών. Στη διαχειριζόμενη τους ορίζει μια ομάδα διαχειριστών.',
          bullets: [
            'Στην αυτόνομη κάθε κανόνας είναι μια ψηφοφορία που δεν κλείνει ποτέ: αλλάζετε ή αποσύρετε την ψήφο σας όποτε θέλετε.',
            'Επικρατεί η επιλογή με τις περισσότερες ψήφους· σε ισοπαλία μένει η τρέχουσα τιμή.',
            'Ούτε ο ιδρυτής δεν αλλάζει μόνος του έναν κανόνα· μόνο εκείνος όμως μπορεί να αλλάξει το είδος της κοινότητας.',
          ],
        },
        {
          id: 'constitution',
          q: 'Τι είναι το Σύνταγμα της κοινότητας;',
          short: 'Ένα κείμενο που γράφεται μόνο του: οι κανόνες που ισχύουν και οι αποφάσεις που πέρασαν, σε μία σελίδα.',
          body: ['Το βρίσκετε στην καρτέλα «Σύνταγμα» κάθε κοινότητας. Είναι μόνο για ανάγνωση και αλλάζει όταν αλλάζουν οι κανόνες ή περνά νέα απόφαση. Μπορείτε να το κατεβάσετε για εκτύπωση.'],
        },
        {
          id: 'sortition',
          q: '',
          short: 'Μόνο σε κοινότητες που το έχουν επιλέξει, και μόνο όταν τα μέλη στηρίζουν έντονα μια τροπολογία που απέρριψε ο συντάκτης. Τότε ένα σώμα μελών, που βγαίνει με κλήρο, γράφει το τελικό κείμενο.',
          keys: { q: 'faq.q11_title', body: 'faq.q11_answer' },
        },
      ],
    },
    {
      id: 'tools',
      title: 'Συζήτηση & περιεχόμενο',
      blurb: 'Forum, βιβλιοθήκη, podcast, βίντεο, συναντήσεις και ειδοποιήσεις.',
      items: [
        {
          id: 'forum',
          q: 'Πώς λειτουργεί το forum;',
          short: 'Ανοίγετε «Νέο θέμα», τα μέλη απαντούν και σημειώνουν «Χρήσιμο» τις καλές ιδέες. Όταν η συζήτηση ωριμάσει, με το «Γίνε πρόταση» γίνεται ψηφοφορία.',
          body: ['Με το «Γίνε πρόταση» η τεχνητή νοημοσύνη διαβάζει όλο το νήμα και ετοιμάζει το κείμενο, που το ελέγχετε πριν το υποβάλετε. Τα μέλη μπορούν να αναφέρουν ένα μήνυμα και να αποφασίσουν μαζί αν θα κρυφτεί.'],
        },
        {
          id: 'library',
          q: 'Τι είναι η βιβλιοθήκη;',
          short: 'Ο χώρος κάθε κοινότητας για ήχο, βίντεο, έγγραφα και κάρτες Anki. Ό,τι ανεβαίνει εκεί μένει μέσα στην κοινότητα.',
          body: ['Οι διαχειριστές καρφιτσώνουν τα σημαντικά στην κορυφή, π.χ. έναν οδηγό για τα νέα μέλη. Τα αρχεία δεν εμφανίζονται ποτέ στη γενική Ροή.'],
        },
        {
          id: 'media',
          q: 'Μπορώ να φτιάξω podcast ή βίντεο για μια ψηφοφορία;',
          short: 'Ναι. Στην καρτέλα «Media» κάθε ψηφοφορίας η Αγορά γράφει σενάριο για podcast 3–5 λεπτών και για βίντεο περίπου 45 δευτερολέπτων.',
          body: ['Το παράγετε με NotebookLM, ElevenLabs ή όποιο εργαλείο θέλετε, και ανεβάζετε MP3 ή MP4 έως 120 MB. Ο συντάκτης διαλέγει το προτεινόμενο, που εμφανίζεται στη Ροή της Αγοράς και μοιράζεται στα social με προεπισκόπηση.'],
        },
        {
          id: 'meetings',
          q: 'Γίνονται συναντήσεις σε πραγματικό χρόνο;',
          short: 'Ναι. Κάθε μέλος μπορεί να ξεκινήσει ή να προγραμματίσει βιντεοκλήση της κοινότητας, στους δικούς μας διακομιστές.',
          body: ['Υπάρχει σειρά ομιλητών, κουμπί «Προσθήκη στο ημερολόγιο» και ειδοποίηση σε όλα τα μέλη. Η ηχογράφηση είναι κλειστή από προεπιλογή. Τα κληρωτά σώματα έχουν τη δική τους ιδιωτική αίθουσα.'],
        },
        {
          id: 'feed',
          q: 'Τι είναι η Ροή;',
          short: 'Η αρχική σας σελίδα: νέες ψηφοφορίες, δημοσκοπήσεις και τα προτεινόμενα podcast και βίντεο, με τη σειρά που δημοσιεύτηκαν.',
          body: ['Φιλτράρετε ανά είδος, ακούτε ή βλέπετε απευθείας από την κάρτα, και μοιράζεστε όποια κάρτα θέλετε στα social.'],
        },
        {
          id: 'notify',
          q: 'Πώς μαθαίνω τι γίνεται;',
          short: 'Από το κουδούνι πάνω δεξιά. Αν ενεργοποιήσετε τις ειδοποιήσεις, τις παίρνετε και στο κινητό ή στον υπολογιστή, ακόμα κι όταν η Αγορά είναι κλειστή.',
          body: ['Ειδοποιείστε όταν ανοίγει μια ψηφοφορία στην κοινότητά σας, όταν έχετε μια τροπολογία να κρίνετε, όταν προγραμματίζεται συνάντηση ή όταν κληρωθείτε. Οι ειδοποιήσεις ταξιδεύουν κρυπτογραφημένες.'],
          links: [{ label: 'Ειδοποιήσεις', href: '/notifications' }],
        },
      ],
    },
    {
      id: 'polls',
      title: 'Δημοσκοπήσεις',
      blurb: 'Τα ερωτηματολόγια της πλατφόρμας και το ανώνυμο πάνελ.',
      items: [
        {
          id: 'polls',
          q: 'Τι είναι οι Δημοσκοπήσεις και το ανώνυμο πάνελ;',
          short: 'Γράφετε τι θέλετε να μάθετε και η Αγορά φτιάχνει ουδέτερο ερωτηματολόγιο· απαντά ένα ανώνυμο πάνελ μελών.',
          body: [
            'Ένας δεύτερος, αυτόματος έλεγχος ψάχνει καθοδηγητικές ερωτήσεις και ανισόρροπες κλίμακες. Στο πάνελ εγγράφεστε μία φορά, με «τυφλές υπογραφές», ώστε οι απαντήσεις σας να μη συνδέονται ποτέ με την ταυτότητά σας. Κάθε αποτέλεσμα έχει σελίδα μεθοδολογίας με δείγμα, στάθμιση και την ακριβή διατύπωση.',
            'Οι κοινοτικές δημοσκοπήσεις είναι ανεπίσημες· μόνο οι πιστοποιημένες δημοσιεύονται ως ευρήματα.',
          ],
          links: [{ label: 'Δημοσκοπήσεις', href: '/surveys' }],
        },
        {
          id: 'poll-kinds',
          q: 'Ποια η διαφορά από τη δημοσκόπηση κοινότητας;',
          short: 'Η δημοσκόπηση κοινότητας είναι ένα είδος ψηφοφορίας μέσα σε μια κοινότητα. Οι Δημοσκοπήσεις της πλατφόρμας είναι ερωτηματολόγια με ανώνυμο πάνελ και στάθμιση αποτελεσμάτων.',
        },
        {
          id: 'panel-device',
          q: 'Γιατί η ταυτότητα πάνελ ισχύει μόνο στη συσκευή όπου έκανα την εγγραφή;',
          short: 'Επειδή η εγγραφή είναι πραγματικά ανώνυμη: ούτε εμείς ξέρουμε ποια ταυτότητα πάνελ είναι δική σας, άρα δεν μπορούμε να σας τη στείλουμε αλλού.',
          body: ['Μπορείτε να τη μεταφέρετε μόνοι σας με κωδικό μεταφοράς από τη σελίδα Προφίλ. Αν καθαρίσετε τα δεδομένα του browser, η ταυτότητα χάνεται· αυτό είναι το κόστος της πραγματικής ανωνυμίας.'],
        },
      ],
    },
    {
      id: 'account',
      title: 'Λογαριασμός & δεδομένα',
      blurb: 'Τα δεδομένα σας, οι πόντοι και η επικοινωνία μαζί μας.',
      items: [
        {
          id: 'data',
          q: 'Πού αποθηκεύονται τα δεδομένα μου;',
          short: 'Στην Ευρώπη. Η πλατφόρμα τρέχει σε διακομιστή εντός ΕΟΧ και δεν μεταφέρει δεδομένα εκτός.',
          body: ['Ο πάροχος φιλοξενίας επεξεργάζεται τα δεδομένα με σύμβαση κατά το Άρθρο 28 του ΓΚΠΔ. Η σύνδεση με Google είναι προαιρετική. Οι ψήφοι σας δεν συνδέονται με το πρόσωπό σας, και οι απαντήσεις στις δημοσκοπήσεις αποθηκεύονται μόνο με ανώνυμο αναγνωριστικό.'],
          links: [{ label: 'Πολιτική απορρήτου', href: '/privacy' }],
        },
        {
          id: 'delete',
          q: 'Μπορώ να σβήσω τον λογαριασμό μου;',
          short: 'Ναι, όποτε θέλετε, από το Προφίλ σας. Για αντίγραφο των δεδομένων σας, γράψτε μας από την «Επικοινωνία».',
          body: ['Με τη διαγραφή, οι ψήφοι σας μένουν στην κάλπη αλλά αποσυνδέονται οριστικά από εσάς, ώστε να μη χαλάσει η καταμέτρηση.'],
        },
        {
          id: 'points',
          q: 'Τι είναι οι Δημοκρατικοί Πόντοι;',
          short: 'Ένα διαφανές ιστορικό της συμμετοχής σας: παίρνετε πόντους όταν ψηφίζετε, προτείνετε βελτιώσεις ή υπηρετείτε σε κληρωτό σώμα.',
          body: ['Δεν είναι κρυπτονόμισμα και δεν αγοράζονται ούτε ανταλλάσσονται. Δεν έχουν χρηματική αξία μέχρι η πλατφόρμα να έχει πραγματικά έσοδα. Το υπόλοιπο και τον πίνακα απόδοσης τα βρίσκετε στη σελίδα Πόντων.'],
          links: [{ label: 'Πόντοι', href: '/points' }],
        },
        {
          id: 'contact',
          q: 'Πώς επικοινωνώ μαζί σας;',
          short: 'Από την «Επικοινωνία» στο τέλος αυτής της σελίδας, που δουλεύει και χωρίς λογαριασμό. Μέσα στην εφαρμογή υπάρχει και το κουμπί «Σχόλια».',
          body: ['Για τεχνικά θέματα μπορείτε επίσης να ανοίξετε ένα issue στο αποθετήριο του έργου στο GitHub.'],
        },
      ],
    },
  ],
  stillTitle: 'Δεν βρήκατε την απάντηση;',
  stillText: 'Δείτε τον Οδηγό χρήσης ή γράψτε μας. Δεν χρειάζεται λογαριασμός.',
  guide: 'Οδηγός χρήσης',
  how: 'Πώς λειτουργεί αναλυτικά',
  top: 'Πάνω',
};

const en: FaqCopy = {
  eyebrow: 'Help',
  title: 'Frequently asked questions',
  lede: 'The short answer always comes first, in bold. Open a question for the details, or search for a word.',
  search: 'Search, e.g. secret ballot, community, data…',
  clear: 'Clear',
  found: (n) => (n === 1 ? '1 question' : `${n} questions`),
  none: 'No question matches those words. Try something more general, or write to us.',
  popular: 'Most asked',
  popularIds: ['secret', 'new-vote', 'free'],
  more: 'More',
  topics: [
    {
      id: 'basics',
      title: 'The basics',
      blurb: 'What Agora is and how to start.',
      items: [
        {
          id: 'what',
          q: 'What is Agora?',
          short: 'A place where a community discusses, votes and decides together, with a secret ballot anyone can check.',
          body: [
            'You start or join a community: an association, a neighbourhood, an assembly, a group. It has a forum for discussion, votes, a library, video calls and its own constitution.',
            'A topic goes either straight to a vote or first to co-drafting, where members improve the text. With polls you measure what members think, anonymously.',
          ],
        },
        {
          id: 'start',
          q: 'How do I start?',
          short: 'Sign up with Google or email. You join the General Community automatically and can vote or start a vote right away.',
          body: ['Under “Communities” you find other communities or start your own. The user guide shows the whole route, step by step.'],
          links: [
            { label: 'Sign up', href: '/auth?tab=register' },
            { label: 'User guide', href: '/walkthrough' },
          ],
        },
        {
          id: 'free',
          q: 'Is it free?',
          short: 'Yes. Signing up, communities, discussions and votes cost nothing.',
          body: ['Agora is open source. If you want to support it, you can donate through GitHub Sponsors on the Support page.'],
          links: [{ label: 'Support', href: '/support' }],
        },
        {
          id: 'different',
          q: 'How is it different from a Facebook group or a Google Form?',
          short: 'The discussion ends in a decision, the ballot is secret and verifiable, and the rules belong to the members.',
          bullets: [
            'One vote per member, and nobody sees how anyone voted, not even us.',
            'Anyone can check that the ballot box was not touched, without an account.',
            'Opposing ideas are not lost: counter-proposals that find support go on the ballot.',
            'Whatever is decided stays written in the community’s constitution.',
          ],
        },
        {
          id: 'app',
          q: 'Is there a mobile app?',
          short: 'Yes, for Android: download it from the bottom of any page. On an iPhone Agora works fine in the browser.',
          body: ['With the app, or with notifications turned on in the browser, you hear at once when a vote or a meeting opens.'],
        },
      ],
    },
    {
      id: 'votes',
      title: 'Votes',
      blurb: 'How to start a vote and how it is counted.',
      items: [
        {
          id: 'new-vote',
          q: 'How do I start a vote?',
          short: 'Press “New +”, choose what is being voted, describe your idea in plain words and let the AI fill in the form. Check the fields and press “Start vote”.',
          body: ['You pick the community and how long the vote runs, within the community’s limits. “More settings” holds co-drafting, the category and the picture. If you are not ready, keep it as a draft.'],
          links: [{ label: 'See it in the user guide', href: '/walkthrough' }],
        },
        {
          id: 'kinds',
          q: 'What kinds of vote are there?',
          short: 'Four: decision, statute, election and community poll. Each has its own rules.',
          bullets: [
            'Decision: the community approves or rejects. It passes by simple majority, more than half of Support and Oppose.',
            'Statute: adopting or changing a rulebook. It needs at least two thirds and runs for at least 3 days.',
            'Election: choosing a person for a role. First members stand or put someone forward, then the ballot opens. Whoever gets the most votes is elected.',
            'Community poll: what members think, binding no one. Members can add answers that are missing.',
          ],
          body: ['These are the defaults. Each community sets, for each kind, whether it is allowed, how long it runs, the majority it needs and the quorum.'],
        },
        {
          id: 'codraft',
          q: 'What is co-drafting?',
          short: 'An optional phase before the ballot where members improve the text together. The default is a direct vote.',
          bullets: [
            'Every member can suggest an improvement or a counter-proposal, and vote ⬆/⬇ on others’.',
            'The author accepts or rejects each improvement; the accepted ones go into the text.',
            'An improvement the author rejected still goes in if at least 70% of those who voted on it support it.',
            'Counter-proposals that find support go on the ballot as alternatives, next to the final text and “No change”.',
            'In an election this phase collects candidacies; in a poll, answers.',
          ],
        },
        {
          id: 'ai',
          q: 'What does the AI do?',
          short: 'It helps, it does not decide. It fills in the form from your description, merges the improvements into the final text and writes scripts for podcasts and videos.',
          body: [
            'Before a proposal goes to co-drafting, an automatic check looks at whether it is clear and relevant to the community. It stops content that breaks the Terms of Use, such as violence, hate or other people’s personal data, and returns texts that make no sense to the author.',
            'All of this runs through a provider under a data-processing agreement, not through public AI services.',
          ],
        },
        {
          id: 'result',
          q: 'When and how is the result decided?',
          short: 'As soon as the vote closes. If the community has set a quorum, at least that share of members must vote for it to count.',
          body: ['Abstentions do not count toward the majority. Whatever passes is written into the community’s constitution automatically. A poll neither passes nor fails: it only shows what members answered.'],
        },
        {
          id: 'change',
          q: 'Can I change my vote?',
          short: 'In an anonymous vote, which is the default, no. The ballot is not linked to you, so nobody can find it to change it.',
          body: ['That is why we ask you to confirm before you cast it. In a vote with named ballots you can change it until it closes.'],
        },
      ],
    },
    {
      id: 'security',
      title: 'Security & secrecy',
      blurb: 'Why your vote stays secret and the ballot box cannot be altered.',
      items: [
        {
          id: 'secret',
          q: 'Is my vote secret?',
          short: 'Yes. Nobody can link the ballot to you, not even us, who host the platform.',
          points: [1, 2],
        },
        {
          id: 'intact',
          q: 'How do I know the ballot box was not touched?',
          short: 'Every vote is tied to the one before it, the box’s fingerprint is published on GitHub every 10 minutes, and it is sealed in the Bitcoin blockchain.',
          points: [3, 5, 6],
          summary: true,
          links: [{ label: 'Check a ballot box', href: '/verify' }],
        },
        {
          id: 'receipt',
          q: 'What is a ballot receipt?',
          short: 'A fingerprint kept on your device that proves your vote was counted, without showing how you voted.',
          points: [4],
        },
        {
          id: 'verify',
          q: 'How do I check it myself?',
          short: 'On the Verify page, without an account: with the fingerprint from your receipt, or just with a vote’s number.',
          links: [{ label: 'Verify', href: '/verify' }],
        },
      ],
    },
    {
      id: 'communities',
      title: 'Communities & rules',
      blurb: 'How a community is organised and who sets its rules.',
      items: [
        {
          id: 'community',
          q: 'What are communities?',
          short: 'Groups with a shared interest, like a neighbourhood, an association or an assembly, each with its own forum, votes, library and constitution.',
          body: ['Each community decides whether its content is public or members-only, and whether anyone may join, by approval, or by invitation only. Votes count only inside the community. Everyone is a member of the General Community from sign-up.'],
          links: [{ label: 'Communities', href: '/communities' }],
        },
        {
          id: 'autonomous',
          q: 'Autonomous or managed community?',
          short: 'An autonomous community has no admins, and its rules change only by a vote of the members. A managed one has an admin team that sets them.',
          bullets: [
            'In an autonomous community every rule is a vote that never closes: change or withdraw your vote whenever you like.',
            'The option with the most votes wins; a tie keeps the current value.',
            'Not even the founder can change a rule alone, though only the founder can change the kind of community.',
          ],
        },
        {
          id: 'constitution',
          q: 'What is the community’s constitution?',
          short: 'A text that writes itself: the rules in force and the decisions that passed, on one page.',
          body: ['You find it in each community’s “Constitution” tab. It is read-only and changes when the rules change or a new decision passes. You can download it for printing.'],
        },
        {
          id: 'sortition',
          q: '',
          short: 'Only in communities that have chosen it, and only when members strongly back an amendment the author rejected. Then a body of members, drawn by lot, writes the final text.',
          keys: { q: 'faq.q11_title', body: 'faq.q11_answer' },
        },
      ],
    },
    {
      id: 'tools',
      title: 'Discussion & content',
      blurb: 'Forum, library, podcasts, videos, meetings and notifications.',
      items: [
        {
          id: 'forum',
          q: 'How does the forum work?',
          short: 'You open a “New topic”, members reply and mark the good ideas “Useful”. When the discussion is ready, “Make it a proposal” turns it into a vote.',
          body: ['With “Make it a proposal” the AI reads the whole thread and drafts the text, which you check before submitting. Members can report a message and decide together whether to hide it.'],
        },
        {
          id: 'library',
          q: 'What is the library?',
          short: 'Each community’s space for audio, video, documents and Anki decks. What is uploaded there stays inside the community.',
          body: ['Admins pin the important items on top, such as a guide for new members. The files never appear in the public feed.'],
        },
        {
          id: 'media',
          q: 'Can I make a podcast or video for a vote?',
          short: 'Yes. In each vote’s “Media” tab Agora writes a script for a 3–5 minute podcast and a video of about 45 seconds.',
          body: ['You produce it with NotebookLM, ElevenLabs or any tool you like, and upload an MP3 or MP4 of up to 120 MB. The author picks the featured one, which shows in the Agora feed and shares to social media with a preview.'],
        },
        {
          id: 'meetings',
          q: 'Are there live meetings?',
          short: 'Yes. Any member can start or schedule a community video call, on our own servers.',
          body: ['There is a speaking queue, an “Add to calendar” button and a notice to every member. Recording is off by default. Sortition bodies have their own private room.'],
        },
        {
          id: 'feed',
          q: 'What is the feed?',
          short: 'Your home page: new votes, polls and the featured podcasts and videos, in the order they were published.',
          body: ['Filter by type, listen or watch straight from the card, and share any card to social media.'],
        },
        {
          id: 'notify',
          q: 'How do I hear what is happening?',
          short: 'From the bell at the top right. Turn on notifications and you also get them on your phone or computer, even when Agora is closed.',
          body: ['You are notified when a vote opens in your community, when you have an amendment to judge, when a meeting is scheduled, or when you are drawn by lot. Notifications travel encrypted.'],
          links: [{ label: 'Notifications', href: '/notifications' }],
        },
      ],
    },
    {
      id: 'polls',
      title: 'Polls',
      blurb: 'The platform’s questionnaires and the anonymous panel.',
      items: [
        {
          id: 'polls',
          q: 'What are Polls and the anonymous panel?',
          short: 'You write what you want to learn and Agora drafts a neutral questionnaire; an anonymous panel of members answers.',
          body: [
            'A second, automatic check looks for leading questions and unbalanced scales. You join the panel once, with “blind signatures”, so your answers can never be linked to your identity. Every result has a methodology page with the sample, the weighting and the exact wording.',
            'Community polls are unofficial; only certified ones are published as findings.',
          ],
          links: [{ label: 'Polls', href: '/surveys' }],
        },
        {
          id: 'poll-kinds',
          q: 'How is that different from a community poll?',
          short: 'A community poll is a kind of vote inside one community. The platform’s Polls are questionnaires with an anonymous panel and weighted results.',
        },
        {
          id: 'panel-device',
          q: 'Why does my panel identity work only on the device where I joined?',
          short: 'Because joining is truly anonymous: not even we know which panel identity is yours, so we cannot send it anywhere else.',
          body: ['You can move it yourself with a transfer code from your Profile page. If you clear the browser’s data the identity is lost; that is the cost of real anonymity.'],
        },
      ],
    },
    {
      id: 'account',
      title: 'Account & data',
      blurb: 'Your data, your points, and how to reach us.',
      items: [
        {
          id: 'data',
          q: 'Where is my data stored?',
          short: 'In Europe. The platform runs on a server inside the EEA and transfers no data outside it.',
          body: ['The hosting provider processes the data under an Article 28 GDPR agreement. Signing in with Google is optional. Your votes are not linked to you, and your poll answers are stored only under an anonymous identifier.'],
          links: [{ label: 'Privacy policy', href: '/privacy' }],
        },
        {
          id: 'delete',
          q: 'Can I delete my account?',
          short: 'Yes, whenever you like, from your Profile. For a copy of your data, write to us through “Contact”.',
          body: ['When you delete it, your votes stay in the ballot box but are permanently unlinked from you, so the count is not broken.'],
        },
        {
          id: 'points',
          q: 'What are Democracy Points?',
          short: 'A transparent record of your participation: you earn points for voting, suggesting improvements or serving on a sortition body.',
          body: ['They are not a cryptocurrency and cannot be bought or traded. They have no monetary value until the platform has real revenue. Your balance and the earning table are on the Points page.'],
          links: [{ label: 'Points', href: '/points' }],
        },
        {
          id: 'contact',
          q: 'How do I contact you?',
          short: 'Through “Contact” at the end of this page, which works without an account. Inside the app there is also the “Feedback” button.',
          body: ['For technical matters you can also open an issue in the project’s GitHub repository.'],
        },
      ],
    },
  ],
  stillTitle: 'Didn’t find your answer?',
  stillText: 'See the user guide, or write to us. No account needed.',
  guide: 'User guide',
  how: 'How it works in detail',
  top: 'Top',
};

export const FAQ_COPY: Record<Lang, FaqCopy> = { el, en };
