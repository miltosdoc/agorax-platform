/**
 * The user guide (/walkthrough), in both languages side by side.
 *
 * Each step is a short film of "shots": a caption, the element the pointer
 * presses on the mock screen (data-g in GuideScreens), and how long it holds.
 * The mock screens take their button labels from the app's own locale keys,
 * so only the story and the sample content live here.
 */

export type Lang = 'el' | 'en';
export type StepId = 'join' | 'communities' | 'forum' | 'new' | 'codraft' | 'vote' | 'result' | 'more';

export interface Shot {
  caption: string;
  /** data-g of the element the pointer presses; none = no pointer. */
  target?: string;
  ms: number;
}

export interface Step {
  id: StepId;
  title: string;
  /** Path shown in the mock address bar. */
  path: string;
  shots: Shot[];
  /** The written version, under the player. */
  text: string;
  link: { label: string; href: string };
}

/** Sample content the mock screens show. */
export interface Samples {
  welcome: string;
  general: string;
  communities: { name: string; meta: string; kind: 'autonomous' | 'managed' }[];
  members: string;
  newCommunity: string;
  communityName: string;
  topics: { t: string; n: number }[];
  reply: string;
  replyBy: string;
  idea: string;
  question: string;
  durations: [string, string, string];
  proposal: string;
  amendment: string;
  amendmentBy: string;
  candidates: [string, string];
  electionTitle: string;
  receipt: string;
  constTitle: string;
  constItem: string;
  verifyQ: string;
  verifyChecks: [string, string, string];
  verifyOk: string;
  media: { podcast: string; video: string };
  meeting: string;
  surveys: string;
  push: string;
}

export interface GuideCopy {
  eyebrow: string;
  title: string;
  lede: string;
  length: string;
  play: string;
  pause: string;
  prev: string;
  next: string;
  replay: string;
  stepOf: (i: number, n: number) => string;
  writtenTitle: string;
  ctaTitle: string;
  ctaText: string;
  register: string;
  faq: string;
  votes: string;
  steps: Step[];
  samples: Samples;
}

const el: GuideCopy = {
  eyebrow: 'Οδηγός χρήσης',
  title: 'Η AgoraX σε 8 βήματα',
  lede: 'Από την εγγραφή μέχρι την πρώτη σας απόφαση. Ο οδηγός παίζει μόνος του σαν βίντεο· πατήστε ένα βήμα για να πάτε κατευθείαν εκεί.',
  length: 'περίπου 2 λεπτά',
  play: 'Αναπαραγωγή',
  pause: 'Παύση',
  prev: 'Προηγούμενο',
  next: 'Επόμενο',
  replay: 'Ξανά από την αρχή',
  stepOf: (i, n) => `Βήμα ${i} από ${n}`,
  writtenTitle: 'Τα ίδια βήματα, γραπτά',
  ctaTitle: 'Έτοιμοι;',
  ctaText: 'Η εγγραφή παίρνει ένα λεπτό. Αν κάτι δεν είναι σαφές, οι συχνές ερωτήσεις έχουν τις απαντήσεις.',
  register: 'Εγγραφή',
  faq: 'Συχνές ερωτήσεις',
  votes: 'Δείτε τις ψηφοφορίες',
  steps: [
    {
      id: 'join',
      title: 'Εγγραφείτε',
      path: '/auth?tab=register',
      shots: [
        { caption: 'Πατήστε «Εγγραφή με Google», ή γράψτε email και κωδικό.', target: 'google', ms: 3400 },
        { caption: 'Μπαίνετε αυτόματα στη Γενική Κοινότητα. Είστε μέσα.', target: 'welcome', ms: 3000 },
      ],
      text: 'Με Google ή με email και κωδικό, σε ένα λεπτό. Μετά την εγγραφή είστε μέλος της Γενικής Κοινότητας και μπορείτε να ψηφίσετε αμέσως.',
      link: { label: 'Εγγραφή', href: '/auth?tab=register' },
    },
    {
      id: 'communities',
      title: 'Βρείτε την κοινότητά σας',
      path: '/communities',
      shots: [
        { caption: 'Στις «Κοινότητες» βλέπετε τις δημόσιες κοινότητες. Πατήστε «Εγγραφή» σε όποια σας ενδιαφέρει.', target: 'join', ms: 3600 },
        { caption: 'Κάθε κοινότητα έχει forum, ψηφοφορίες, Σύνταγμα, βιβλιοθήκη και μέλη.', target: 'tabs', ms: 3200 },
        { caption: 'Ή φτιάξτε τη δική σας: αυτόνομη, όπου οι κανόνες ψηφίζονται, ή διαχειριζόμενη, με διαχειριστές.', target: 'create', ms: 3800 },
      ],
      text: 'Μια κοινότητα μπορεί να είναι σύλλογος, γειτονιά, συνέλευση ή ομάδα. Άλλες δέχονται όποιον θέλει, άλλες με έγκριση ή με πρόσκληση. Αν δεν υπάρχει η δική σας, τη φτιάχνετε και διαλέγετε αν θα είναι αυτόνομη ή διαχειριζόμενη.',
      link: { label: 'Κοινότητες', href: '/communities' },
    },
    {
      id: 'forum',
      title: 'Συζητήστε στο forum',
      path: '/communities/…',
      shots: [
        { caption: 'Ανοίξτε «Νέο θέμα» και γράψτε το ζήτημα με δικά σας λόγια.', target: 'new-topic', ms: 3200 },
        { caption: 'Τα μέλη απαντούν. Σημειώστε «Χρήσιμο» τις καλές ιδέες.', target: 'useful', ms: 3200 },
        { caption: 'Κατέληξε κάπου η συζήτηση; Με το «Γίνε πρόταση» η ΤΝ ετοιμάζει την ψηφοφορία από όλο το νήμα.', target: 'promote', ms: 4000 },
      ],
      text: 'Στο forum της κοινότητας τα θέματα συζητιούνται πριν γίνουν ψηφοφορίες. Οι καλές ιδέες ανεβαίνουν με το «Χρήσιμο», και μια ώριμη συζήτηση γίνεται πρόταση με ένα κουμπί.',
      link: { label: 'Κοινότητες', href: '/communities' },
    },
    {
      id: 'new',
      title: 'Ξεκινήστε μια ψηφοφορία',
      path: '/proposals/new',
      shots: [
        { caption: 'Πατήστε «Νέο +» πάνω δεξιά.', target: 'new', ms: 2600 },
        { caption: 'Διαλέξτε τι ψηφίζετε: απόφαση, καταστατικό, εκλογή ή δημοσκόπηση.', target: 'kind', ms: 3000 },
        { caption: 'Γράψτε την ιδέα με απλά λόγια και πατήστε «Συμπλήρωση με AI».', target: 'ai', ms: 4000 },
        { caption: 'Ελέγξτε τα πεδία, διαλέξτε πόσο θα διαρκέσει και πατήστε «Έναρξη ψηφοφορίας».', target: 'start', ms: 4000 },
      ],
      text: 'Το «Νέο +» ανοίγει τη φόρμα. Διαλέγετε το είδος, περιγράφετε την ιδέα σας και το AI συμπληρώνει ερώτημα, επιλογές και διάρκεια. Ελέγχετε, διορθώνετε και ξεκινάτε, ή την κρατάτε ως προσχέδιο.',
      link: { label: 'Νέα ψηφοφορία', href: '/proposals/new' },
    },
    {
      id: 'codraft',
      title: 'Βελτιώστε τη μαζί',
      path: '/proposals/…',
      shots: [
        { caption: 'Αν διαλέξατε συνδιαμόρφωση, τα μέλη προτείνουν βελτιώσεις και τις ψηφίζουν ⬆/⬇.', target: 'upvote', ms: 3600 },
        { caption: 'Ο συντάκτης δέχεται ή απορρίπτει· ό,τι δεχτεί μπαίνει στο κείμενο.', target: 'accept', ms: 3200 },
        { caption: 'Σε εκλογή, τα μέλη δηλώνουν υποψηφιότητα ή προτείνουν κάποιον.', target: 'stand', ms: 3600 },
      ],
      text: 'Η συνδιαμόρφωση είναι προαιρετική· η προεπιλογή είναι η άμεση ψηφοφορία. Όταν τη διαλέξετε, τα μέλη προτείνουν βελτιώσεις ή αντιπροτάσεις, και μια βελτίωση που απέρριψε ο συντάκτης μπαίνει παρ’ όλα αυτά αν τη στηρίζει το 70%. Σε εκλογή η φάση μαζεύει υποψηφιότητες, σε δημοσκόπηση απαντήσεις.',
      link: { label: 'Τι είναι η συνδιαμόρφωση', href: '/faq#q-codraft' },
    },
    {
      id: 'vote',
      title: 'Ψηφίστε',
      path: '/proposals/…',
      shots: [
        { caption: 'Διαλέξτε την επιλογή σας. Η ψήφος είναι ανώνυμη.', target: 'support', ms: 3000 },
        { caption: 'Επιβεβαιώστε: μετά την κατάθεση δεν αλλάζει.', target: 'confirm', ms: 3200 },
        { caption: 'Η ψήφος σφραγίζεται και ρίχνεται στην κάλπη μέσα σε 2–3 λεπτά, σε τυχαία στιγμή.', target: 'pending', ms: 3600 },
        { caption: 'Κρατάτε την απόδειξη: δείχνει ότι μετρήθηκε, όχι τι ψηφίσατε.', target: 'receipt', ms: 3600 },
      ],
      text: 'Η ψήφος σας κλείνεται σε «φάκελο» στη συσκευή σας, ο διακομιστής την υπογράφει χωρίς να τη δει, και ρίχνεται στην κάλπη χωρίς όνομα. Στο τέλος παίρνετε μια απόδειξη που δεν δείχνει τι ψηφίσατε.',
      link: { label: 'Είναι μυστική η ψήφος μου;', href: '/faq#q-secret' },
    },
    {
      id: 'result',
      title: 'Δείτε το αποτέλεσμα',
      path: '/proposals/…',
      shots: [
        { caption: 'Όταν λήξει, βλέπετε το αποτέλεσμα, μετρημένο με τον κανόνα της ψηφοφορίας.', target: 'passed', ms: 3200 },
        { caption: 'Ό,τι εγκρίνεται γράφεται στο Σύνταγμα της κοινότητας.', target: 'const', ms: 3200 },
        { caption: 'Στην «Επαλήθευση» ο καθένας ελέγχει ότι η κάλπη δεν πειράχτηκε, χωρίς λογαριασμό.', target: 'verified', ms: 3800 },
      ],
      text: 'Το αποτέλεσμα βγαίνει μόλις λήξει η ψηφοφορία. Οι αποφάσεις που περνούν μπαίνουν στο Σύνταγμα της κοινότητας, και στη σελίδα Επαλήθευση ελέγχετε ότι η ψήφος σας μετρήθηκε και ότι η κάλπη είναι ακέραιη.',
      link: { label: 'Επαλήθευση', href: '/verify' },
    },
    {
      id: 'more',
      title: 'Και ακόμα…',
      path: '/feed',
      shots: [
        { caption: 'Στη βιβλιοθήκη μοιράζεστε ήχο, βίντεο και έγγραφα με την κοινότητα.', target: 'library', ms: 3000 },
        { caption: 'Για κάθε ψηφοφορία η AgoraX γράφει σενάριο για podcast και βίντεο.', target: 'media', ms: 3000 },
        { caption: 'Βιντεοκλήσεις, δημοσκοπήσεις με ανώνυμο πάνελ και ειδοποιήσεις στο κινητό.', target: 'meet', ms: 3600 },
      ],
      text: 'Κάθε κοινότητα έχει βιβλιοθήκη και βιντεοκλήσεις. Το Media Studio γράφει σενάρια για podcast και βίντεο, οι Δημοσκοπήσεις μετρούν τη γνώμη με ανώνυμο πάνελ, και οι ειδοποιήσεις σας κρατούν ενήμερους και στο κινητό.',
      link: { label: 'Όλες οι απαντήσεις', href: '/faq' },
    },
  ],
  samples: {
    welcome: 'Καλώς ήρθατε! Είστε μέλος της Γενικής Κοινότητας.',
    general: 'Γενική Κοινότητα',
    communities: [
      { name: 'Σύλλογος γονέων 3ου Δημοτικού', meta: '64 μέλη', kind: 'autonomous' },
      { name: 'Η γειτονιά μας', meta: '128 μέλη', kind: 'managed' },
      { name: 'Ποδηλάτες της πόλης', meta: '41 μέλη', kind: 'autonomous' },
    ],
    members: '64 μέλη',
    newCommunity: 'Νέα κοινότητα',
    communityName: 'Όνομα κοινότητας',
    topics: [
      { t: 'Πού να γίνει φέτος η γιορτή της γειτονιάς;', n: 14 },
      { t: 'Ιδέες για το άδειο οικόπεδο στη γωνία', n: 23 },
      { t: 'Ποιος βοηθά με τα ποδήλατα των παιδιών;', n: 6 },
    ],
    reply: 'Να γίνει μικρό πάρκο με παγκάκια; Σκιά υπάρχει ήδη από τη μουριά.',
    replyBy: 'Ε.Κ.',
    idea: 'Να φυτέψουμε δέντρα στην πλατεία πριν έρθει το καλοκαίρι',
    question: 'Να φυτευτούν 30 δέντρα στην πλατεία;',
    durations: ['1 ημέρα', '3 ημέρες', '7 ημέρες'],
    proposal: 'Να φυτευτούν 30 δέντρα στην πλατεία της γειτονιάς.',
    amendment: 'Με σύστημα ποτίσματος στάγδην',
    amendmentBy: 'Ε.Κ.',
    candidates: ['Μαρία Κ.', 'Νίκος Π.'],
    electionTitle: 'Ταμίας του συλλόγου',
    receipt: 'ced292a7 f86f55a4 b607dde5 5db74212 07f3f46f 0b8a02b1 7d7bc43c da5ad0a4',
    constTitle: 'Σύνταγμα · Μέρος Β — Αποφάσεις',
    constItem: 'Να φυτευτούν 30 δέντρα στην πλατεία της γειτονιάς, με πότισμα στάγδην.',
    verifyQ: 'Είναι ακέραιη η κάλπη;',
    verifyChecks: [
      'Καμία ψήφος δεν άλλαξε ούτε σβήστηκε',
      'Ταιριάζει με όσα δημοσιεύσαμε δημόσια στο GitHub',
      'Η ώρα και το περιεχόμενο είναι κλειδωμένα στο Bitcoin',
    ],
    verifyOk: 'Η κάλπη είναι ακέραιη',
    media: { podcast: 'Podcast · 4 λεπτά', video: 'Βίντεο · 45 δευτερόλεπτα' },
    meeting: 'Συνάντηση κοινότητας · σε εξέλιξη',
    surveys: 'Ανώνυμο πάνελ',
    push: 'Άνοιξε ψηφοφορία στην κοινότητά σας',
  },
};

const en: GuideCopy = {
  eyebrow: 'User guide',
  title: 'AgoraX in 8 steps',
  lede: 'From signing up to your first decision. The guide plays by itself like a video; tap a step to jump straight there.',
  length: 'about 2 minutes',
  play: 'Play',
  pause: 'Pause',
  prev: 'Previous',
  next: 'Next',
  replay: 'Play again',
  stepOf: (i, n) => `Step ${i} of ${n}`,
  writtenTitle: 'The same steps, in writing',
  ctaTitle: 'Ready?',
  ctaText: 'Signing up takes a minute. If anything is unclear, the FAQ has the answers.',
  register: 'Sign up',
  faq: 'FAQ',
  votes: 'See the votes',
  steps: [
    {
      id: 'join',
      title: 'Sign up',
      path: '/auth?tab=register',
      shots: [
        { caption: 'Press “Sign up with Google”, or type an email and password.', target: 'google', ms: 3400 },
        { caption: 'You join the General Community automatically. You are in.', target: 'welcome', ms: 3000 },
      ],
      text: 'With Google, or with email and a password, in a minute. After signing up you are a member of the General Community and can vote right away.',
      link: { label: 'Sign up', href: '/auth?tab=register' },
    },
    {
      id: 'communities',
      title: 'Find your community',
      path: '/communities',
      shots: [
        { caption: 'Under “Communities” you see the public communities. Press “Join” on one you like.', target: 'join', ms: 3600 },
        { caption: 'Every community has a forum, votes, a constitution, a library and members.', target: 'tabs', ms: 3200 },
        { caption: 'Or start your own: autonomous, where the rules are voted on, or managed, with admins.', target: 'create', ms: 3800 },
      ],
      text: 'A community can be an association, a neighbourhood, an assembly or a group. Some let anyone join, others need approval or an invitation. If yours does not exist, you start it and choose whether it is autonomous or managed.',
      link: { label: 'Communities', href: '/communities' },
    },
    {
      id: 'forum',
      title: 'Talk it over in the forum',
      path: '/communities/…',
      shots: [
        { caption: 'Open a “New topic” and write the issue in your own words.', target: 'new-topic', ms: 3200 },
        { caption: 'Members reply. Mark the good ideas “Useful”.', target: 'useful', ms: 3200 },
        { caption: 'Has the discussion landed somewhere? “Make it a proposal” and the AI drafts the vote from the whole thread.', target: 'promote', ms: 4000 },
      ],
      text: 'In the community forum, topics are discussed before they become votes. Good ideas rise with “Useful”, and a discussion that is ready becomes a proposal with one button.',
      link: { label: 'Communities', href: '/communities' },
    },
    {
      id: 'new',
      title: 'Start a vote',
      path: '/proposals/new',
      shots: [
        { caption: 'Press “New +” at the top right.', target: 'new', ms: 2600 },
        { caption: 'Choose what is being voted: a decision, a statute, an election or a poll.', target: 'kind', ms: 3000 },
        { caption: 'Describe the idea in plain words and press “Fill in with AI”.', target: 'ai', ms: 4000 },
        { caption: 'Check the fields, choose how long it runs and press “Start vote”.', target: 'start', ms: 4000 },
      ],
      text: '“New +” opens the form. You choose the kind, describe your idea, and the AI fills in the question, the options and the duration. You check, correct and start it, or keep it as a draft.',
      link: { label: 'New vote', href: '/proposals/new' },
    },
    {
      id: 'codraft',
      title: 'Improve it together',
      path: '/proposals/…',
      shots: [
        { caption: 'If you chose co-drafting, members suggest improvements and vote on them ⬆/⬇.', target: 'upvote', ms: 3600 },
        { caption: 'The author accepts or rejects; what they accept goes into the text.', target: 'accept', ms: 3200 },
        { caption: 'In an election, members stand as candidates or put someone forward.', target: 'stand', ms: 3600 },
      ],
      text: 'Co-drafting is optional; a direct vote is the default. When you choose it, members suggest improvements or counter-proposals, and an improvement the author rejected still goes in if 70% support it. In an election the phase collects candidacies; in a poll, answers.',
      link: { label: 'What is co-drafting', href: '/faq#q-codraft' },
    },
    {
      id: 'vote',
      title: 'Vote',
      path: '/proposals/…',
      shots: [
        { caption: 'Choose your option. The ballot is anonymous.', target: 'support', ms: 3000 },
        { caption: 'Confirm: once cast, it cannot change.', target: 'confirm', ms: 3200 },
        { caption: 'Your ballot is sealed and drops into the box within 2–3 minutes, at a random moment.', target: 'pending', ms: 3600 },
        { caption: 'Keep the receipt: it shows your vote was counted, not how you voted.', target: 'receipt', ms: 3600 },
      ],
      text: 'Your ballot is sealed in an “envelope” on your device, the server signs it without seeing it, and it drops into the box with no name on it. At the end you get a receipt that does not show how you voted.',
      link: { label: 'Is my vote secret?', href: '/faq#q-secret' },
    },
    {
      id: 'result',
      title: 'See the result',
      path: '/proposals/…',
      shots: [
        { caption: 'When it closes, you see the result, counted by the vote’s own rule.', target: 'passed', ms: 3200 },
        { caption: 'Whatever passes is written into the community’s constitution.', target: 'const', ms: 3200 },
        { caption: 'On “Verify” anyone can check the ballot box was not touched, without an account.', target: 'verified', ms: 3800 },
      ],
      text: 'The result is decided as soon as the vote closes. Decisions that pass go into the community’s constitution, and on the Verify page you check that your vote was counted and that the ballot box is intact.',
      link: { label: 'Verify', href: '/verify' },
    },
    {
      id: 'more',
      title: 'And more…',
      path: '/feed',
      shots: [
        { caption: 'In the library you share audio, video and documents with the community.', target: 'library', ms: 3000 },
        { caption: 'For every vote AgoraX writes a script for a podcast and a video.', target: 'media', ms: 3000 },
        { caption: 'Video calls, polls with an anonymous panel, and notifications on your phone.', target: 'meet', ms: 3600 },
      ],
      text: 'Every community has a library and video calls. The Media Studio writes scripts for podcasts and videos, Polls measure opinion with an anonymous panel, and notifications keep you up to date on your phone too.',
      link: { label: 'All the answers', href: '/faq' },
    },
  ],
  samples: {
    welcome: 'Welcome! You are a member of the General Community.',
    general: 'General Community',
    communities: [
      { name: 'Parents of the 3rd Primary School', meta: '64 members', kind: 'autonomous' },
      { name: 'Our neighbourhood', meta: '128 members', kind: 'managed' },
      { name: 'City cyclists', meta: '41 members', kind: 'autonomous' },
    ],
    members: '64 members',
    newCommunity: 'New community',
    communityName: 'Community name',
    topics: [
      { t: 'Where should this year’s street party be?', n: 14 },
      { t: 'Ideas for the empty lot on the corner', n: 23 },
      { t: 'Who can help with the children’s bikes?', n: 6 },
    ],
    reply: 'A small park with benches? The mulberry tree already gives shade.',
    replyBy: 'E.K.',
    idea: 'Let’s plant trees in the square before summer comes',
    question: 'Should we plant 30 trees in the square?',
    durations: ['1 day', '3 days', '7 days'],
    proposal: 'Thirty trees shall be planted in the neighbourhood square.',
    amendment: 'With drip irrigation',
    amendmentBy: 'E.K.',
    candidates: ['Maria K.', 'Nikos P.'],
    electionTitle: 'Treasurer of the association',
    receipt: 'ced292a7 f86f55a4 b607dde5 5db74212 07f3f46f 0b8a02b1 7d7bc43c da5ad0a4',
    constTitle: 'Constitution · Part B — Decisions',
    constItem: 'Thirty trees shall be planted in the neighbourhood square, with drip irrigation.',
    verifyQ: 'Is the ballot box intact?',
    verifyChecks: [
      'No vote was changed or deleted',
      'Matches what we published publicly on GitHub',
      'Its time and content are locked into Bitcoin',
    ],
    verifyOk: 'The ballot box is intact',
    media: { podcast: 'Podcast · 4 minutes', video: 'Video · 45 seconds' },
    meeting: 'Community meeting · live',
    surveys: 'Anonymous panel',
    push: 'A vote opened in your community',
  },
};

export const GUIDE_COPY: Record<Lang, GuideCopy> = { el, en };
