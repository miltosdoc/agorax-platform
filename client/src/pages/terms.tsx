import { useTranslation } from "@/hooks/use-translation";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import { Separator } from "@/components/ui/separator";
import { LEGAL_NOTICE_VERSION } from "@shared/legal-notice-version";

/**
 * Terms of Service.
 *
 * Bilingual (el / en). Aligned with the current implementation:
 *  - Proposal flow goes draft → review → ... → voting → decided/archived.
 *  - The submit gate is local-only and checks §6 abuse, not proposal
 *    quality; the quality score is advisory and never blocks. §3 and §6
 *    must keep matching server/utils/llm-validation.ts — the gate may only
 *    block on grounds stated here.
 *  - Source is CC-BY-NC-4.0 (see LICENSE) — non-commercial reuse.
 *  - Privacy details live in /privacy, not here.
 */

const LAST_UPDATED = LEGAL_NOTICE_VERSION;

export default function TermsPage() {
  const { locale } = useTranslation();
  const isEnglish = locale === "en";

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow pt-16 pb-16 sm:pb-6">
        <div className="container mx-auto px-4 max-w-4xl">
          <h1 className="text-3xl font-bold mb-2">
            {isEnglish ? "Terms of Service" : "Όροι Χρήσης"}
          </h1>
          <p className="text-sm text-muted-foreground mb-8">
            {isEnglish ? `Version ${LAST_UPDATED}` : `Έκδοση ${LAST_UPDATED}`}
          </p>

          <div className="space-y-8 text-muted-foreground leading-relaxed">
            {isEnglish ? <EnglishTerms /> : <GreekTerms />}

            <Separator />

            <div className="bg-muted p-6 rounded-lg mt-8 text-sm">
              <p>
                {isEnglish
                  ? `Last updated: ${LAST_UPDATED}. This date identifies the version published on this page.`
                  : `Τελευταία ενημέρωση: ${LAST_UPDATED}. Η ημερομηνία προσδιορίζει την έκδοση που δημοσιεύεται σε αυτή τη σελίδα.`}
              </p>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function GreekTerms() {
  return (
    <>
      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">1. Περιγραφή υπηρεσίας</h2>
        <p>
          Η Αγορά είναι μια κλειστή πλατφόρμα διαβουλευτικής δημοκρατίας (Σουηδία). Επιτρέπει σε
          επαληθευμένα μέλη να υποβάλλουν προτάσεις, να καταθέτουν
          τροπολογίες, να συμμετέχουν σε διαβούλευση, σε κληρωτά σώματα κρίσης, και να ψηφίζουν
          συμβουλευτικά για το τελικό κείμενο μιας πρότασης.
        </p>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">2. Δικαιώματα και υποχρεώσεις χρηστών</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>Δικαίωμα υποβολής προτάσεων σε κοινότητες όπου είστε μέλος.</li>
          <li>Δικαίωμα κατάθεσης τροπολογιών (βελτίωση, προσθήκη, αφαίρεση, αντιπρόταση).</li>
          <li>Δικαίωμα ψήφου σε συμβουλευτικές ψηφοφορίες της κοινότητάς σας.</li>
          <li>Δικαίωμα δήλωσης ενδιαφέροντος για κληρωτό σώμα.</li>
          <li>Δικαίωμα προαιρετικής ταυτοποίησης μέσω Gov.gr.</li>
          <li>Υποχρέωση μη μεταβίβασης των στοιχείων σύνδεσής σας — ένα μέλος, ένας λογαριασμός.</li>
          <li>Υποχρέωση τήρησης κοσμιότητας στις διαβουλεύσεις.</li>
          <li>Υποχρέωση τήρησης της ισχύουσας νομοθεσίας και σεβασμού των δικαιωμάτων τρίτων στο περιεχόμενο που υποβάλλετε.</li>
        </ul>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">3. Υποβολή προτάσεων και τροπολογιών</h2>
        <p className="mb-3">
          Οι προτάσεις ακολουθούν τη δομή <em>ερώτημα + λύση</em>. Το πεδίο της λύσης μπορεί να
          μείνει ανοιχτό: μια πρόταση που θέτει ερώτημα και αφήνει την απάντηση στη διαβούλευση
          είναι πλήρως αποδεκτή.
        </p>
        <p className="mb-3">
          Κάθε πρόταση περνά από αυτόματο έλεγχο πριν δημοσιευθεί. Ο έλεγχος αυτός μπορεί να
          σταματήσει μια πρόταση <strong className="text-foreground">μόνο</strong> για παραβίαση της
          παραγράφου 6 παρακάτω. Δεν κρίνει αν μια πρόταση είναι ρεαλιστική, ολοκληρωμένη,
          τεκμηριωμένη ή πολιτικά ορθή — αυτά τα κρίνει η κοινότητα στη διαβούλευση και στην κάλπη.
        </p>
        <p>
          Ο έλεγχος αποδίδει και μια συμβουλευτική βαθμολογία σαφήνειας, ορατή σε εσάς και στην
          κοινότητα. <strong className="text-foreground">Η βαθμολογία δεν εμποδίζει ποτέ τη
          δημοσίευση</strong>, με μοναδική εξαίρεση κείμενο που δεν διαβάζεται καθόλου. Αν διαφωνείτε
          με μια απόφαση, μπορείτε να ζητήσετε επαναξιολόγηση από τη σελίδα της πρότασης. Καμία
          πρόταση δεν αποστέλλεται σε εξωτερική υπηρεσία τεχνητής νοημοσύνης.
        </p>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">4. Κοινότητες</h2>
        <p>
          Κάθε κοινότητα έχει δικούς της κανόνες (κατώφλι ποιότητας τροπολογιών, μέγεθος κληρωτού
          σώματος, χρόνος απόκρισης, ποσοστό ελάχιστης συμμετοχής). Οι κανόνες είναι ορατοί στις ρυθμίσεις
          της κοινότητας και ισχύουν διαφανώς για όλα τα μέλη.
        </p>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">5. Κληρωτό σώμα</h2>
        <p>
          Μέλη που δηλώνουν ενδιαφέρον επιλέγονται με κλήρωση. Η συμμετοχή συνεπάγεται την υποχρέωση να
          αξιολογήσετε τις προτάσεις/τροπολογίες εντός του χρόνου απόκρισης της κοινότητας. Η μη
          απόκριση εντός της προθεσμίας καταγράφεται.
        </p>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">6. Απαγορευμένες πράξεις</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>Δημιουργία πολλαπλών λογαριασμών (ένα μέλος = ένας λογαριασμός).</li>
          <li>Παράκαμψη του rate limiting ή των ελέγχων ασφαλείας.</li>
          <li>Υποβολή προτάσεων που υποκινούν βία, μίσος ή παράνομες πράξεις.</li>
          <li>
            Δημοσίευση προσωπικών δεδομένων τρίτου προσώπου (τηλέφωνο, διεύθυνση, ΑΦΜ, ΑΜΚΑ,
            προσωπικό e-mail) χωρίς τη συγκατάθεσή του.
          </li>
          <li>Διαφημιστικό, ασύνδετο ή ακατάληπτο περιεχόμενο.</li>
          <li>Μηχανική παρέμβαση (bots, scraping χωρίς άδεια).</li>
          <li>Προσπάθεια επαναπροσδιορισμού (re-identification) ψηφοφόρων.</li>
        </ul>
        <p className="mt-4">
          Ο κατάλογος αυτός είναι <strong className="text-foreground">εξαντλητικός αποκλειστικά
          ως προς τους λόγους του αυτόματου ελέγχου</strong> της παραγράφου 3: ο έλεγχος αυτός δεν
          επιτρέπεται να μπλοκάρει πρόταση για λόγο που δεν αναφέρεται εδώ. Δεν περιορίζει την
          ανθρώπινη εξέταση παράνομου περιεχομένου ή τις υποχρεώσεις της πλατφόρμας βάσει νόμου,
          όπως περιγράφονται στην παράγραφο 13. Η νόμιμη άσκηση κριτικής — και οξείας — σε πρόσωπα
          με δημόσιο αξίωμα, σε κόμματα, στον δήμο ή σε οποιονδήποτε θεσμό επιτρέπεται. Η διαφωνία
          ή η ενόχληση που προκαλεί μια άποψη δεν αρκεί από μόνη της για την αφαίρεσή της.
        </p>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">7. Νομική ισχύς αποτελεσμάτων</h2>
        <p>
          <strong className="text-foreground">Οι ψηφοφορίες είναι συμβουλευτικές</strong> — δεν παράγουν
          δεσμευτικές νομικές πράξεις. Αποτελούν έκφραση της συλλογικής βούλησης των μελών της
          πλατφόρμας και τροφοδοτούν τη συλλογική συζήτηση. Η αποδοχή μιας πρότασης από τα μέλη
          δεν την καθιστά επίσημη θέση της πλατφόρμας.
        </p>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">8. Προστασία προσωπικών δεδομένων</h2>
        <p>
          Η επεξεργασία προσωπικών δεδομένων διέπεται από την{" "}
          <a href="/privacy" className="text-primary hover:underline">Ενημέρωση για την Επεξεργασία Δεδομένων</a>{" "}
          μας, η οποία αποτελεί αναπόσπαστο μέρος των παρόντων όρων. Μην χρησιμοποιήσετε την πλατφόρμα
          εάν δεν συμφωνείτε με την Ενημέρωση.
        </p>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">9. Πνευματική ιδιοκτησία και άδεια</h2>
        <p>
          Ο κώδικας της πλατφόρμας Αγορά, η τεκμηρίωση και τα σχήματα δεδομένων διατίθενται με την άδεια{" "}
          <strong className="text-foreground">CC-BY-NC-4.0</strong> (Creative Commons Attribution-NonCommercial)
          — δείτε το αρχείο LICENSE στο αποθετήριο. Επιτρέπεται η μη εμπορική επαναχρησιμοποίηση με
          αναφορά. Οι προτάσεις και τα σχόλια των μελών παραμένουν διανοητική ιδιοκτησία των μελών αλλά
          παραχωρείται στην πλατφόρμα άδεια προβολής και αρχειοθέτησης για τους σκοπούς της.
        </p>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">10. Τροποποίηση των όρων</h2>
        <p>
          Μπορεί να ενημερώνουμε τους παρόντες όρους περιοδικά. Οι αλλαγές δημοσιεύονται σε αυτή
          τη σελίδα με νέα ημερομηνία έκδοσης. Για τις ουσιαστικές αλλαγές εμφανίζεται ενημέρωση
          στα συνδεδεμένα μέλη μέσα στην εφαρμογή. Το κλείσιμο της ενημέρωσης δεν καταγράφεται
          ως συγκατάθεση ή αποδοχή των όρων. Τυχόν συγκατάθεση που απαιτεί ο νόμος ζητείται χωριστά.
        </p>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">11. Επικοινωνία</h2>
        <p>
          Για ερωτήσεις σχετικά με τους όρους χρήσης, επικοινωνήστε με τη διαχείριση μέσω της
          πλατφόρμας.
        </p>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">12. Περιεχόμενο χρηστών και ευθύνη της πλατφόρμας</h2>
        <p className="mb-3">
          Οι προτάσεις, τροπολογίες, σχόλια και αναρτήσεις των χρηστών εκφράζουν τις απόψεις των
          συντακτών τους. Κάθε συντάκτης είναι υπεύθυνος για το περιεχόμενο που υποβάλλει και για
          τα δικαιώματα που απαιτούνται για τη δημοσίευσή του. Η φιλοξενία, η προβολή, η αξιολόγηση
          ή η ψήφισή του δεν σημαίνει ότι η πλατφόρμα το υιοθετεί ή επιβεβαιώνει την ακρίβεια ή τη
          νομιμότητά του.
        </p>
        <p className="mb-3">
          Περιεχόμενο που συντάσσει και δημοσιεύει η ίδια η πλατφόρμα ως επίσημη ανακοίνωση ή θέση
          διακρίνεται από το περιεχόμενο χρηστών. Η χρήση τεχνητής νοημοσύνης για τη σύνταξη τέτοιου
          περιεχομένου δεν αίρει την ευθύνη της πλατφόρμας για τη δημοσίευσή του. Όταν χρήστης
          υποβάλλει κείμενο που δημιουργήθηκε με τεχνητή νοημοσύνη, εξακολουθεί να έχει τις ίδιες
          υποχρεώσεις ως συντάκτης. Αυτόματες βαθμολογίες ή βοηθητικά αποτελέσματα δεν αποτελούν
          επίσημη θέση ή εγγύηση ακρίβειας.
        </p>
        <p>
          Η ευθύνη της πλατφόρμας κρίνεται από την ισχύουσα νομοθεσία και τον ρόλο της σε κάθε
          περίπτωση. Οι παρόντες όροι δεν αποκλείουν υποχρεωτικές νομικές ευθύνες ή δικαιώματα
          χρηστών και δεν παρέχουν γενική απαλλαγή από την ευθύνη για παράνομο περιεχόμενο.
        </p>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">13. Αναφορές περιεχομένου και ανθρώπινη εξέταση</h2>
        <p className="mb-3">
          Οποιοσδήποτε μπορεί να αναφέρει περιεχόμενο που θεωρεί παράνομο μέσω της δημόσιας{" "}
          <a href="/report-content" className="text-primary hover:underline">φόρμας αναφοράς περιεχομένου</a>,
          χωρίς λογαριασμό ή συμμετοχή στην κοινότητα. Αναφέρετε τον ακριβή σύνδεσμο ή τη θέση
          του περιεχομένου, εξηγήστε γιατί το θεωρείτε παράνομο και προσθέστε τυχόν στοιχεία που
          βοηθούν την εξέταση. Η διαφωνία με μια πολιτική άποψη δεν αποτελεί από μόνη της λόγο
          αναφοράς ως παράνομης.
        </p>
        <p className="mb-3">
          Οι αναφορές εξετάζονται από άνθρωπο. Η εξέταση λαμβάνει υπόψη το περιεχόμενο, το πλαίσιο,
          τα διαθέσιμα στοιχεία και τα δικαιώματα των εμπλεκομένων, συμπεριλαμβανομένης της
          ελευθερίας έκφρασης. Όταν η πλατφόρμα αποκτήσει γνώση παράνομου περιεχομένου, ενεργεί
          χωρίς αδικαιολόγητη καθυστέρηση για την αφαίρεση ή τον αποκλεισμό πρόσβασης σε αυτό,
          σύμφωνα με τον νόμο. Οι νόμιμες υποχρεώσεις της πλατφόρμας δεν εξαρτώνται από ψηφοφορία
          της κοινότητας. Η υποβολή αναφοράς δεν αποκρύπτει αυτόματα το περιεχόμενο.
        </p>
        <p className="mb-3">
          Η απόφαση καταγράφεται με αιτιολόγηση, η οποία εξηγεί τα βασικά πραγματικά περιστατικά,
          τη νομική ή συμβατική βάση και τυχόν περιορισμό που επιβλήθηκε. Η ενημέρωση του αναφέροντος
          και του συντάκτη γίνεται μέσω διαθέσιμων στοιχείων επικοινωνίας και της πλατφόρμας,
          με την επιφύλαξη νόμιμων περιορισμών. Κρατήστε τον αριθμό αναφοράς και το ιδιωτικό
          κλειδί πρόσβασης που παρέχει η φόρμα για να παρακολουθείτε τη συγκεκριμένη υπόθεση.
        </p>
        <p>
          Αν διαφωνείτε με απόφαση σχετικά με αναφορά ή περιορισμό του περιεχομένου σας, μπορείτε
          να ζητήσετε ανθρώπινη επανεξέταση από την ίδια{" "}
          <a href="/report-content" className="text-primary hover:underline">φόρμα</a>, αναφέροντας
          τον αριθμό αναφοράς και τους λόγους της διαφωνίας σας ή νέα στοιχεία. Η δυνατότητα αυτή
          δεν περιορίζει άλλα μέσα προσφυγής που προβλέπει ο νόμος. Η διαδικασία της παρούσας
          παραγράφου είναι χωριστή από τον αυτόματο έλεγχο προτάσεων της παραγράφου 3.
        </p>
      </section>
    </>
  );
}

function EnglishTerms() {
  return (
    <>
      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">1. Service description</h2>
        <p>
          Agora is a closed deliberative-democracy platform (Sweden). It allows verified members to submit proposals, file amendments, participate in
          deliberation, serve on sortition (randomly selected) review bodies, and vote consultatively on
          a proposal's final text.
        </p>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">2. User rights and obligations</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>Right to submit proposals in communities where you are a member.</li>
          <li>Right to file amendments (improvement, addition, removal, counter-proposal).</li>
          <li>Right to vote in your community's consultative votes.</li>
          <li>Right to volunteer for a sortition body.</li>
          <li>Right to optional Gov.gr identity verification.</li>
          <li>Obligation not to share your credentials — one member, one account.</li>
          <li>Obligation to keep deliberation civil.</li>
          <li>Obligation to comply with applicable law and respect others' rights in the content you submit.</li>
        </ul>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">3. Proposals and amendments</h2>
        <p className="mb-3">
          Proposals follow a <em>question + solution</em> structure. The solution field may be left
          open: a proposal that poses a question and leaves the answer to deliberation is entirely
          acceptable.
        </p>
        <p className="mb-3">
          Every proposal passes an automated check before publication. That check may stop a proposal
          <strong className="text-foreground"> only</strong> for a breach of section 6 below. It does
          not judge whether a proposal is realistic, complete, well-argued or politically sound —
          the community judges those, in deliberation and at the ballot.
        </p>
        <p>
          The check also produces an advisory clarity score, visible to you and to the community.
          <strong className="text-foreground"> The score never blocks publication</strong>, with the
          single exception of text that cannot be read at all. If you disagree with a decision you may
          request re-evaluation from the proposal page. No proposal text is sent to any external AI
          service.
        </p>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">4. Communities</h2>
        <p>
          Each community has its own rules (amendment-quality threshold, sortition body size, response
          window, minimum participation). The rules are visible in the community settings and apply
          transparently to all members.
        </p>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">5. Sortition body</h2>
        <p>
          Volunteers are randomly selected. Selection carries the obligation to evaluate the assigned
          proposals/amendments within the community's response window. Failure to respond within the
          window is recorded.
        </p>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">6. Prohibited acts</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>Creating multiple accounts (one member = one account).</li>
          <li>Bypassing rate limiting or security controls.</li>
          <li>Submitting proposals that incite violence, hate, or illegal acts.</li>
          <li>
            Publishing a third party's personal data (phone number, address, tax or social-security
            number, private e-mail) without their consent.
          </li>
          <li>Advertising, disconnected or unintelligible content.</li>
          <li>Automated interaction (bots, unauthorised scraping).</li>
          <li>Attempting to re-identify other voters.</li>
        </ul>
        <p className="mt-4">
          This list is <strong className="text-foreground">exhaustive only for the grounds of the
          automated check</strong> in section 3: that check may not block a proposal on any ground
          not stated here. It does not limit human review of illegal content or the platform's
          statutory duties, as described in section 13. Lawful criticism — including harsh
          criticism — of public office holders, parties, the municipality or any institution is
          allowed. Disagreement or offence caused by an opinion alone is not sufficient grounds
          for its removal.
        </p>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">7. Legal status of outcomes</h2>
        <p>
          <strong className="text-foreground">Votes are consultative</strong> — they do not produce
          binding legal acts. They express the collective will of the platform's members and feed into
          the community's deliberation. Members' approval of a proposal does not make it an official
          platform position.
        </p>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">8. Data protection</h2>
        <p>
          Personal-data processing is governed by our{" "}
          <a href="/privacy" className="text-primary hover:underline">Privacy Notice</a>, which is an
          integral part of these terms. Do not use the platform if you do not agree with the Notice.
        </p>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">9. Intellectual property and license</h2>
        <p>
          The Agora source code, documentation, and data schemas are licensed under{" "}
          <strong className="text-foreground">CC-BY-NC-4.0</strong> (Creative Commons
          Attribution-NonCommercial) — see the LICENSE file in the repository. Non-commercial reuse is
          permitted with attribution. Member proposals and comments remain the members' intellectual
          property; by submitting, you grant the platform a license to display and archive them for
          its purposes.
        </p>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">10. Changes to these terms</h2>
        <p>
          We may update these terms from time to time. Changes are published on this page with a new
          version date. Signed-in members see an in-app notice of material changes. Dismissing that
          notice does not record consent or acceptance of these terms. Any consent required by law
          is requested separately.
        </p>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">11. Contact</h2>
        <p>
          For questions about these terms, contact the administrators through the platform.
        </p>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">12. User content and platform responsibility</h2>
        <p className="mb-3">
          Users' proposals, amendments, comments and posts express their authors' views. Each author
          is responsible for the content they submit and for obtaining the rights needed to publish
          it. Hosting, displaying, evaluating or voting on content does not mean that the platform
          endorses it or confirms its accuracy or legality.
        </p>
        <p className="mb-3">
          Content authored and published by the platform as an official announcement or position is
          distinct from user content. Using artificial intelligence to draft that content does not
          remove the platform's responsibility for publishing it. A user submitting AI-generated
          text retains the same obligations as its author. Automated scores or supporting outputs
          are not official positions or guarantees of accuracy.
        </p>
        <p>
          The platform's liability depends on applicable law and its role in each case. These terms
          do not exclude mandatory legal responsibilities or user rights and do not provide blanket
          immunity for illegal content.
        </p>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">13. Content notices and human review</h2>
        <p className="mb-3">
          Anyone may report content they believe is illegal through the public{" "}
          <a href="/report-content" className="text-primary hover:underline">content reporting form</a>,
          without an account or community membership. Identify the exact link or location of the
          content, explain why you believe it is illegal and include any evidence that helps its
          review. Disagreement with a political opinion alone is not grounds for reporting it as
          illegal.
        </p>
        <p className="mb-3">
          A human reviews notices, considering the content, its context, available evidence and the
          rights of those involved, including freedom of expression. When the platform becomes aware
          of illegal content, it acts without undue delay to remove it or disable access in
          accordance with the law. The platform's statutory duties do not depend on a community vote.
          Submitting a notice does not automatically hide the content.
        </p>
        <p className="mb-3">
          The decision is recorded with reasons explaining the main facts, its legal or contractual
          basis and any restriction imposed. The reporter and author are informed through available
          contact details and the platform, subject to lawful restrictions. Keep the reference number
          and private access key provided by the form to follow the case.
        </p>
        <p>
          If you disagree with a decision about a notice or a restriction on your content, you may
          request human review through the same{" "}
          <a href="/report-content" className="text-primary hover:underline">form</a>, quoting the
          reference number and explaining your disagreement or providing new evidence. This option
          does not limit other remedies available under the law. The process in this section is
          separate from the automated proposal check in section 3.
        </p>
      </section>
    </>
  );
}
