import { useTranslation } from "@/hooks/use-translation";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import { Separator } from "@/components/ui/separator";
import { LEGAL_NOTICE_VERSION } from "@shared/legal-notice-version";

/**
 * Privacy Notice — Art. 13 transparency.
 *
 * Canonical truth lives in docs/compliance/PRIVACY_NOTICE.md. This page
 * mirrors it. Every claim made here MUST match what the code does — if
 * the code changes, this page changes. Out-of-date privacy notices that
 * assert controls the code does not implement are textbook GDPR
 * negligence (see docs/compliance/GDPR_FORMALIZATION_BRIEF.md).
 *
 * Bilingual (el / en) — switches on the active locale.
 */

const LAST_UPDATED = LEGAL_NOTICE_VERSION;

export default function PrivacyPage() {
  const { locale } = useTranslation();
  const isEnglish = locale === "en";

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow pt-16 pb-16 sm:pb-6">
        <div className="container mx-auto px-4 max-w-4xl">
          <h1 className="text-3xl font-bold mb-2">
            {isEnglish ? "Privacy Notice" : "Ενημέρωση για την Επεξεργασία Δεδομένων"}
          </h1>
          <p className="text-sm text-muted-foreground mb-8">
            {isEnglish ? `Version ${LAST_UPDATED}` : `Έκδοση ${LAST_UPDATED}`}
          </p>

          <div className="space-y-8 text-muted-foreground leading-relaxed">
            {isEnglish ? <EnglishContent /> : <GreekContent />}

            <Separator />

            <div className="bg-muted p-6 rounded-lg mt-8 text-sm">
              <p className="text-muted-foreground">
                {isEnglish
                  ? `Last updated: ${LAST_UPDATED}. Signed-in members see an in-app notice of material changes. Recorded consent versions are separate.`
                  : `Τελευταία ενημέρωση: ${LAST_UPDATED}. Τα συνδεδεμένα μέλη βλέπουν ενημέρωση μέσα στην εφαρμογή για ουσιαστικές αλλαγές. Οι καταγεγραμμένες εκδόσεις συγκατάθεσης είναι χωριστές.`}
              </p>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function GreekContent() {
  return (
    <>
      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">1. Υπεύθυνος επεξεργασίας</h2>
        <p className="mb-3">
          <strong className="text-foreground">Η πλατφόρμα Αγορά</strong> (Σουηδία).
          Εποπτική αρχή: <strong className="text-foreground">Σουηδική Αρχή Προστασίας
          Δεδομένων (IMY)</strong> —{" "}
          <a href="https://www.imy.se" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
            imy.se
          </a>
          . Έχετε δικαίωμα καταγγελίας απευθείας στην IMY.
        </p>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">2. Τι δεδομένα συλλέγουμε</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong className="text-foreground">Στοιχεία λογαριασμού:</strong> όνομα χρήστη, email,
            ονοματεπώνυμο, κωδικός (scrypt-hashed, μη αναστρέψιμος).
          </li>
          <li>
            <strong className="text-foreground">Ταυτοποίηση Gov.gr (προαιρετική):</strong> hash του ΑΦΜ,
            hash του κωδικού δήλωσης, ονοματεπώνυμο, δήμος και ΤΚ από την Υπεύθυνη Δήλωση.
          </li>
          <li>
            <strong className="text-foreground">Πολιτικές απόψεις (ειδική κατηγορία — Άρθρο 9 ΓΚΠΔ):</strong>{" "}
            ψήφοι, προτάσεις, τροπολογίες, σχόλια στην διαβούλευση.
          </li>
          <li>
            <strong className="text-foreground">Άμυνα κατά κατάχρησης:</strong> διεύθυνση IP, αναγνωριστικό
            συσκευής, ιστορικό συνδέσεων — Άρθρο 6(1)(στ).
          </li>
          <li>
            <strong className="text-foreground">Συγκατάθεση:</strong> έκδοση κειμένου, hash κειμένου, γλώσσα,
            χρόνος αποδοχής — Άρθρο 7 ΓΚΠΔ.
          </li>
          <li>
            <strong className="text-foreground">Αναφορές περιεχομένου:</strong> σύνδεσμος περιεχομένου,
            εξήγηση και στοιχεία που παρέχετε, όνομα και email επικοινωνίας, αριθμός αναφοράς,
            ιστορικό εξέτασης και αποφάσεων, αποτελέσματα αποστολής email και hash του ιδιωτικού
            κλειδιού παρακολούθησης. Στην ειδική κατηγορία αναφορών πιθανής σεξουαλικής κακοποίησης
            παιδιών μπορείτε να παραλείψετε όνομα και email. Η διαδικασία λειτουργεί χωρίς λογαριασμό.
            Υποβάλετε μόνο τα απαραίτητα στοιχεία· μη στέλνετε παράνομο υλικό ή περιττά ευαίσθητα δεδομένα.
          </li>
        </ul>
        <p className="mt-3">
          <strong className="text-foreground">Δεν αποθηκεύουμε:</strong> τον αριθμό αστυνομικής
          ταυτότητας, ονόματα γονέων, διεύθυνση πέραν δήμου, ημερομηνία ή τόπο γέννησης, τηλέφωνο, ακριβείς
          συντεταγμένες GPS. Το <strong>ίδιο το αρχείο PDF της Υπεύθυνης Δήλωσης δεν αποθηκεύεται</strong> —
          διαβάζεται στη μνήμη, εξάγονται τα παραπάνω hashes και απορρίπτεται.
        </p>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          3. Ανωνυμία ψήφου
        </h2>
        <ul className="list-disc pl-6 space-y-2 mb-3">
          <li>
            <strong className="text-foreground">Η ψήφος σας στις ψηφοφορίες των προτάσεων είναι ανώνυμη.</strong>{" "}
            Καταγράφεται με ένα τυχαίο token που δημιουργείτε στον φυλλομετρητή σας και που ο server υπογράφει
            τυφλά (βλέπει μόνο το τυφλωμένο token, ποτέ το πρωτότυπο). Αποθηκεύεται χωρίς αναφορά στην
            ταυτότητά σας, οπότε η επιλογή σας δεν μπορεί να ανακτηθεί από τη βάση δεδομένων. Μία ψήφος ανά
            μέλος ανά πρόταση, χωρίς δυνατότητα αλλαγής.
          </li>
          <li>
            <strong className="text-foreground">Καταγράφεται ότι συμμετείχατε,</strong> δηλαδή ότι πήρατε
            token για την πρόταση, ώστε κανείς να μην ψηφίσει δύο φορές. Σε μικρές ψηφοφορίες, η συμμετοχή
            μαζί με το αποτέλεσμα μπορεί να επιτρέψει συμπεράσματα.
          </li>
          <li>
            <strong className="text-foreground">Τα αιτήματα ψήφου δεν καταγράφονται</strong> σε αρχεία
            καταγραφής, ούτε της εφαρμογής ούτε του web server, ώστε η IP και η ώρα της υπογραφής του token να
            μην μπορούν να συνδεθούν με την IP και την ώρα της ψήφου. Το ίδιο ισχύει για την εγγραφή στο πάνελ
            δημοσκοπήσεων και τις απαντήσεις σε δημοσκοπήσεις.
          </li>
        </ul>
        <p className="mb-3">
          <strong className="text-foreground">Όριο:</strong> την πλατφόρμα τη λειτουργεί ένας φορέας, χωρίς
          ανεξάρτητη εφορευτική επιτροπή. Η ανωνυμία σάς προστατεύει αν διαρρεύσει ή διαβαστεί η βάση
          δεδομένων· δεν σας προστατεύει από διαχειριστή του server που θα ενεργούσε κακόβουλα και θα άλλαζε
          τη ρύθμιση ή τον κώδικα ώστε να συνδέει μελλοντικές ψήφους με ψηφοφόρους.
        </p>
        <p className="mb-3">
          Δύο παλαιότερες προτάσεις (#15 και #16) είχαν ψευδώνυμη ψηφοφορία, στην οποία η ψήφος αποθηκεύτηκε
          μαζί με την ταυτότητα. Νέες ψευδώνυμες ψηφοφορίες δεν δημιουργούνται.
        </p>
        <p>
          Κρατάμε τοπικά στον φυλλομετρητή σας ένα receipt (token + υπογραφή) ώστε να μπορείτε να
          επαληθεύσετε αργότερα ότι η ψήφος σας μετρήθηκε — αλλά κανείς άλλος δεν μπορεί να συνδέσει το
          receipt αυτό με εσάς.
        </p>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">4. Νομικές βάσεις επεξεργασίας</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong className="text-foreground">Άρθρο 6(1)(β):</strong> σύμβαση — εγγραφή και αυθεντικοποίηση.
          </li>
          <li>
            <strong className="text-foreground">Άρθρο 6(1)(στ):</strong> έννομο συμφέρον — άμυνα κατά
            κατάχρησης (IP, fingerprint, ιστορικό).
          </li>
          <li>
            <strong className="text-foreground">Άρθρο 9(2)(α):</strong> ρητή συγκατάθεση — επεξεργασία
            πολιτικών απόψεων. Έχετε δικαίωμα ανάκλησης ανά πάσα στιγμή χωρίς να επηρεάσει τη νομιμότητα
            προηγούμενης επεξεργασίας.
          </li>
          <li>
            <strong className="text-foreground">Άρθρο 9(2)(δ):</strong> καρβ-άουτ μη κερδοσκοπικής
            ένωσης — επικουρική βάση για την επεξεργασία πολιτικών απόψεων μελών.
          </li>
          <li>
            <strong className="text-foreground">Άρθρο 6(1)(γ):</strong> εξέταση αναφορών παράνομου
            περιεχομένου και ενημέρωση για αποφάσεις, για συμμόρφωση με τις σχετικές νομικές υποχρεώσεις.
          </li>
        </ul>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">5. Με ποιους μοιραζόμαστε τα δεδομένα σας</h2>
        <ul className="list-disc pl-6 space-y-2 mb-3">
          <li>
            <strong className="text-foreground">Πάροχος φιλοξενίας (VPS):</strong> ως εκτελών την
            επεξεργασία, υπό σύμβαση Άρθρου 28 ΓΚΠΔ.
          </li>
          <li>
            <strong className="text-foreground">Google OAuth (προαιρετικό):</strong> εάν επιλέξετε σύνδεση
            μέσω Google, μοιράζεστε email, όνομα, provider id. Δείτε τους όρους της Google.
          </li>
          <li>
            <strong className="text-foreground">Αναφορές περιεχομένου:</strong> ο φάκελος είναι
            διαθέσιμος στη διαχείριση για ανθρώπινη εξέταση. Η ιδιωτική παρακολούθηση παρέχει
            κατάσταση και απόφαση μόνο με τον αριθμό αναφοράς και το ιδιωτικό κλειδί.
            Τα στοιχεία επικοινωνίας και το κείμενο της αναφοράς δεν δημοσιεύονται ούτε
            διαβιβάζονται στον συντάκτη του αναφερόμενου περιεχομένου από αυτή τη διαδικασία.
          </li>
          <li>
            <strong className="text-foreground">Πάροχος email:</strong> όταν έχει ρυθμιστεί η αποστολή,
            λαμβάνει τη διεύθυνση παραλήπτη και την επιβεβαίωση ή ενημέρωση της υπόθεσης.
            Η αναφορά αποθηκεύεται ακόμη και αν το email δεν μπορεί να αποσταλεί.
          </li>
          <li>
            <strong className="text-foreground">Καμία μεταφορά εκτός ΕΟΧ.</strong>
          </li>
          <li>
            <strong className="text-foreground">Πάροχος τεχνητής νοημοσύνης:</strong> ως εκτελών την
            επεξεργασία, υπό σύμβαση Άρθρου 28 ΓΚΠΔ, σε ιδιωτικό endpoint εντός ΕΟΧ. Στέλνεται το
            κείμενο της πρότασης ή της τροπολογίας για έλεγχο ποιότητας και σύνθεση του τελικού
            κειμένου, καθώς και οι περιγραφές δημοσκοπήσεων για τη σύνταξη ερωτηματολογίου — ποτέ
            το όνομά σας, το email σας ή οι ψήφοι σας. Η χρήση δημόσιων υπηρεσιών AI (π.χ.
            OpenRouter) παραμένει απαγορευμένη από τον κώδικα.
          </li>
        </ul>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">6. Πόσο καιρό κρατάμε τα δεδομένα σας</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>Λογαριασμός και ταυτοποίηση: όσο είναι ενεργός ο λογαριασμός, +30 ημέρες.</li>
          <li>Προτάσεις, σχόλια, ψήφοι: επ' αόριστον (ιστορικό αρχείο της συνέλευσης).</li>
          <li>Συγκατάθεση: επ' αόριστον (αρχείο audit — απόδειξη νομιμότητας).</li>
          <li>IP / αναγνωριστικά συσκευής: 12 μήνες κυλιόμενα.</li>
          <li>Αιτήματα διαγραφής: επ' αόριστον (αρχείο συμμόρφωσης).</li>
          <li>Αναφορές περιεχομένου: όσο απαιτείται για εξέταση, επανεξέταση και τυχόν νομικές αξιώσεις. Η διαχείριση επανεξετάζει περιοδικά την ανάγκη διατήρησης· η διαγραφή δεν είναι αυτόματη.</li>
        </ul>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">7. Τα δικαιώματά σας — και πώς να τα ασκήσετε</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong className="text-foreground">Πρόσβαση (Άρθρο 15):</strong>{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">GET /api/user/data-export</code> —
            κατεβάστε ένα JSON αρχείο με όλα τα δεδομένα σας.
          </li>
          <li>
            <strong className="text-foreground">Διόρθωση (Άρθρο 16):</strong> επικοινωνία με τη διαχείριση.
          </li>
          <li>
            <strong className="text-foreground">Διαγραφή (Άρθρο 17):</strong>{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">POST /api/user/erasure-request</code> —
            επεξεργάζεται χειροκίνητα εντός 30 ημερών. Λόγω της αλυσίδας hash των ψήφων, η διαγραφή
            πολιτικών απόψεων από ενεργές ψηφοφορίες αναβάλλεται μέχρι το κλείσιμό τους· τα υπόλοιπα
            προσωπικά δεδομένα διαγράφονται άμεσα.
          </li>
          <li>
            <strong className="text-foreground">Φορητότητα (Άρθρο 20):</strong> ίδιο endpoint με την πρόσβαση
            — αναγνώσιμη μηχανικά μορφή.
          </li>
          <li>
            <strong className="text-foreground">Ανάκληση συγκατάθεσης (Άρθρο 7(3)):</strong>{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">POST /api/user/consent/withdraw</code>.
          </li>
          <li>
            <strong className="text-foreground">Καταγγελία:</strong> IMY — imy.se.
          </li>
        </ul>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">8. Ασφάλεια</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>Κωδικοί κρυπτογραφούνται με scrypt + ανά-εγγραφή salt.</li>
          <li>
            Το SALT_KEY για το hashing του ΑΦΜ φορτώνεται από περιβάλλον και είναι υποχρεωτικό — η
            εφαρμογή δεν εκκινεί χωρίς αυτό. Το salted hash του ΑΦΜ είναι ψευδώνυμο, όχι ανώνυμο.
          </li>
          <li>Rate limiting σε όλα τα ευαίσθητα endpoints (auth, ψηφοφορία, αιτήματα διαγραφής).</li>
          <li>Έλεγχος αλυσίδας hash για τις ψήφους (tamper-evidence).</li>
          <li>CSRF προστασία (double-submit token) και CORS allowlist.</li>
          <li>HTTPS παντού· cookies SameSite=Lax, HttpOnly όπου εφαρμόζεται.</li>
        </ul>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">9. Cookies</h2>
        <p>
          Χρησιμοποιούμε μόνο απαραίτητα cookies: session αυθεντικοποίησης, CSRF token, προτίμηση γλώσσας.
          Καμία υπηρεσία analytics ή tracking τρίτων (Google Analytics, Facebook Pixel, κ.λπ.).
        </p>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">10. Επικοινωνία</h2>
        <p>
          Για κάθε ερώτημα προστασίας δεδομένων ή για άσκηση δικαιώματος που δεν καλύπτεται από τα
          endpoints στην ενότητα 7, επικοινωνήστε με τη διαχείριση μέσω της πλατφόρμας.
        </p>
      </section>
    </>
  );
}

function EnglishContent() {
  return (
    <>
      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">1. Controller</h2>
        <p className="mb-3">
          <strong className="text-foreground">The Agora platform</strong> (Sweden).
          Supervisory authority:{" "}
          <strong className="text-foreground">Swedish Authority for Privacy Protection (IMY)</strong> —{" "}
          <a href="https://www.imy.se" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
            imy.se
          </a>
          . You have the right to lodge a complaint directly with IMY.
        </p>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">2. What data we collect</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong className="text-foreground">Account:</strong> username, email, full name, password
            (scrypt-hashed, non-reversible).
          </li>
          <li>
            <strong className="text-foreground">Gov.gr verification (optional):</strong> salted AFM hash,
            salted doc-code hash, first/last name, municipality, postcode from the Solemn Declaration.
          </li>
          <li>
            <strong className="text-foreground">Political opinions (special category — Art. 9 GDPR):</strong>{" "}
            votes, proposals, amendments, deliberation comments.
          </li>
          <li>
            <strong className="text-foreground">Abuse defense:</strong> IP address, device fingerprint,
            login history — Art. 6(1)(f).
          </li>
          <li>
            <strong className="text-foreground">Consent record:</strong> notice version, text hash, locale,
            acceptance timestamp — Art. 7 GDPR.
          </li>
          <li>
            <strong className="text-foreground">Content notices:</strong> content link, explanation
            and evidence you provide, contact name and email, reference, review and decision history,
            email delivery results and a hash of the private tracking key. Name and email may be
            omitted for the specific category of suspected child sexual abuse. No account is required.
            Provide only necessary information; do not send illegal material or unnecessary sensitive data.
          </li>
        </ul>
        <p className="mt-3">
          <strong className="text-foreground">We do NOT store:</strong> your ID-card number, parents'
          names, street address beyond municipality, date or place of birth, phone, precise GPS
          coordinates. The{" "}
          <strong>Solemn Declaration PDF itself is not retained</strong> — it is processed in memory, the
          hashes above are extracted, and the file is discarded.
        </p>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          3. Vote anonymity
        </h2>
        <ul className="list-disc pl-6 space-y-2 mb-3">
          <li>
            <strong className="text-foreground">Your vote in proposal ballots is anonymous.</strong> It is
            recorded with a random token you generate in your browser and the server signs blindly (it sees
            only the blinded token, never the original). It is stored without any reference to your identity,
            so your choice cannot be recovered from the database. One vote per member per proposal, with no
            re-voting.
          </li>
          <li>
            <strong className="text-foreground">The fact that you took part is recorded,</strong> that is,
            that you obtained a token for the proposal, so nobody can vote twice. In small ballots,
            participation together with the result can allow inferences.
          </li>
          <li>
            <strong className="text-foreground">Voting requests are not logged,</strong> neither by the
            application nor by the web server, so the IP address and time of the token signature cannot be
            matched with the IP address and time of the vote. The same applies to joining the polling panel
            and answering surveys.
          </li>
        </ul>
        <p className="mb-3">
          <strong className="text-foreground">Limit:</strong> one operator runs the platform, with no
          independent election committee. Anonymity protects you if the database leaks or is read; it does
          not protect you from a server administrator acting in bad faith who changed the configuration or
          the code to link future votes to voters.
        </p>
        <p className="mb-3">
          Two older proposals (#15 and #16) used pseudonymous voting, in which the vote was stored with the
          voter&apos;s identity. No new pseudonymous ballots are created.
        </p>
        <p>
          We keep a local receipt (token + signature) in your browser so you can verify later that your vote
          was counted — but nobody else can tie that receipt back to you.
        </p>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">4. Lawful bases for processing</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong className="text-foreground">Art. 6(1)(b):</strong> contract — registration and
            authentication.
          </li>
          <li>
            <strong className="text-foreground">Art. 6(1)(f):</strong> legitimate interest — abuse defense
            (IP, fingerprint, activity log).
          </li>
          <li>
            <strong className="text-foreground">Art. 9(2)(a):</strong> explicit consent — processing of
            political opinions. You may withdraw at any time without affecting the lawfulness of prior
            processing.
          </li>
          <li>
            <strong className="text-foreground">Art. 9(2)(d):</strong> not-for-profit association carve-out
            — secondary basis for processing members' political opinions.
          </li>
          <li>
            <strong className="text-foreground">Art. 6(1)(c):</strong> reviewing illegal-content
            notices and communicating decisions to comply with the relevant legal obligations.
          </li>
        </ul>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">5. Who we share your data with</h2>
        <ul className="list-disc pl-6 space-y-2 mb-3">
          <li>
            <strong className="text-foreground">Hosting provider (VPS):</strong> as a data processor under
            an Art. 28 GDPR data-processing agreement.
          </li>
          <li>
            <strong className="text-foreground">Google OAuth (optional):</strong> if you sign in via
            Google, you share email, name, provider id. See Google's terms.
          </li>
          <li>
            <strong className="text-foreground">Content notices:</strong> administrators access
            the case for human review. Private tracking provides status and decision only with
            the reference and private key. Contact details and the notice text are not published
            or forwarded to the reported content's author through this workflow.
          </li>
          <li>
            <strong className="text-foreground">Email provider:</strong> when sending is configured,
            receives the recipient address and case acknowledgement or update. The notice is
            saved even if email cannot be sent.
          </li>
          <li>
            <strong className="text-foreground">No transfers outside the EEA.</strong>
          </li>
          <li>
            <strong className="text-foreground">AI provider:</strong> as a data processor under an
            Art. 28 GDPR agreement, on a private endpoint inside the EEA. What is sent is the text of
            a proposal or amendment (quality check, final-text synthesis) and poll descriptions
            (questionnaire drafting) — never your name, your email, or your votes. Use of public AI
            services (e.g. OpenRouter) remains blocked in code.
          </li>
        </ul>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">6. How long we keep your data</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>Account and verification data: while the account is active, plus 30 days.</li>
          <li>Proposals, comments, votes: indefinite (historical record of the assembly).</li>
          <li>Consent record: indefinite (audit trail — proof of lawfulness).</li>
          <li>IP / device fingerprints: 12 months rolling.</li>
          <li>Erasure requests: indefinite (compliance record).</li>
          <li>Content notices: as needed for handling, review and any legal claims. Administrators periodically review the need to retain them; deletion is not automatic.</li>
        </ul>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">7. Your rights — and how to exercise them</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong className="text-foreground">Access (Art. 15):</strong>{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">GET /api/user/data-export</code> —
            download a JSON file with everything we hold about you.
          </li>
          <li>
            <strong className="text-foreground">Rectify (Art. 16):</strong> contact admin.
          </li>
          <li>
            <strong className="text-foreground">Erasure (Art. 17):</strong>{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">POST /api/user/erasure-request</code> —
            processed manually within 30 days. Because of the vote hash chain, erasure of political-opinion
            data from active votes is deferred until those votes close; all other personal data is erased
            immediately.
          </li>
          <li>
            <strong className="text-foreground">Portability (Art. 20):</strong> same endpoint as access —
            machine-readable JSON.
          </li>
          <li>
            <strong className="text-foreground">Withdraw consent (Art. 7(3)):</strong>{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">POST /api/user/consent/withdraw</code>.
          </li>
          <li>
            <strong className="text-foreground">Complain:</strong> IMY — imy.se.
          </li>
        </ul>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">8. Security</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>Passwords are hashed with scrypt + per-record salt.</li>
          <li>
            The AFM-hashing SALT_KEY is loaded from environment and is mandatory — the application will
            not start without it. The salted AFM hash is pseudonymous, not anonymous.
          </li>
          <li>Rate limiting on all sensitive endpoints (auth, voting, erasure requests).</li>
          <li>Tamper-evident vote hash chain.</li>
          <li>CSRF protection (double-submit token) and CORS allowlist.</li>
          <li>HTTPS everywhere; cookies are SameSite=Lax, HttpOnly where applicable.</li>
        </ul>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">9. Cookies</h2>
        <p>
          We use only essential cookies: authentication session, CSRF token, language preference. No
          third-party analytics or tracking (Google Analytics, Facebook Pixel, etc.).
        </p>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">10. Contact</h2>
        <p>
          For any data-protection question or to exercise a right not covered by the endpoints in
          section 7, contact the administrators through the platform.
        </p>
      </section>
    </>
  );
}
