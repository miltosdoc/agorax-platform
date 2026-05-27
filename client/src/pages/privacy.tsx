import { useTranslation } from "@/hooks/use-translation";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import { Separator } from "@/components/ui/separator";

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

const LAST_UPDATED = "2026-05-25";

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
                  ? `Last updated: ${LAST_UPDATED}. We will notify members of material changes by email and in-app banner.`
                  : `Τελευταία ενημέρωση: ${LAST_UPDATED}. Θα ενημερώσουμε τα μέλη για ουσιαστικές αλλαγές μέσω email και ενδοεφαρμογικού banner.`}
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
          <strong className="text-foreground">ΑΜΚΕ «Επανεκκίνηση Δημοκρατίας»</strong> (Ελλάδα). Εκπρόσωπος:
          Μίλτος Τριανταφύλλου. Εποπτική αρχή: <strong className="text-foreground">Αρχή Προστασίας
          Δεδομένων Προσωπικού Χαρακτήρα (ΑΠΔΠΧ)</strong> —{" "}
          <a href="https://www.dpa.gr" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
            dpa.gr
          </a>
          . Έχετε δικαίωμα καταγγελίας απευθείας στην ΑΠΔΠΧ.
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
          3. Σημαντική ειδοποίηση: οι ψήφοι ΔΕΝ είναι ανώνυμοι
        </h2>
        <p className="mb-3">
          Στην τρέχουσα έκδοση της πλατφόρμας, η αντιστοίχιση{" "}
          <strong className="text-foreground">ψήφος ↔ ταυτότητα</strong> είναι ανακτήσιμη από έναν διαχειριστή
          της βάσης δεδομένων. Η πλατφόρμα υποστηρίζει{" "}
          <strong className="text-foreground">συμβουλευτικές ψηφοφορίες μόνο</strong> — δεσμευτικές
          ψηφοφορίες δεν θα τρέχουν μέχρι την ολοκλήρωση κρυπτογραφικής ανωνυμοποίησης (client-side
          encryption, ανεξάρτητοι trustees, αναδιάρθρωση σχήματος ψηφοδελτίου).
        </p>
        <p>
          Αυτό αποτελεί <strong className="text-foreground">γνωστό αποδεκτό υπολειπόμενο κίνδυνο</strong>{" "}
          που αναγνωρίζετε με την ρητή συγκατάθεσή σας κατά την εγγραφή.
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
            <strong className="text-foreground">Καμία μεταφορά εκτός ΕΟΧ.</strong>
          </li>
          <li>
            <strong className="text-foreground">Καμία αποστολή σε εξωτερική υπηρεσία τεχνητής
            νοημοσύνης</strong> — το προηγούμενο σύστημα ποιοτικού ελέγχου που έστελνε προτάσεις σε
            OpenRouter αφαιρέθηκε ως μέρος της παρούσας αναθεώρησης.
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
            <strong className="text-foreground">Καταγγελία:</strong> ΑΠΔΠΧ — dpa.gr.
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
          endpoints στην ενότητα 7, στείλτε email στο{" "}
          <a href="mailto:info@agorax.gr" className="text-primary hover:underline">info@agorax.gr</a>.
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
          <strong className="text-foreground">AMKE "Restart Democracy"</strong> (Greece). Representative:
          Miltos Triantafyllou. Supervisory authority:{" "}
          <strong className="text-foreground">Hellenic Data Protection Authority (HDPA)</strong> —{" "}
          <a href="https://www.dpa.gr" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
            dpa.gr
          </a>
          . You have the right to lodge a complaint directly with the HDPA.
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
          3. Important notice: votes are NOT anonymous
        </h2>
        <p className="mb-3">
          In the current version of the platform, the{" "}
          <strong className="text-foreground">vote ↔ identity</strong> binding is reconstructable by a
          database administrator. The platform supports{" "}
          <strong className="text-foreground">consultative votes only</strong> — binding votes will not
          run until cryptographic anonymisation is complete (client-side encryption, independent
          off-server trustees, and a ballot-schema refactor).
        </p>
        <p>
          This is a <strong className="text-foreground">known accepted residual risk</strong> that you
          acknowledge by giving your explicit consent at registration.
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
            <strong className="text-foreground">No transfers outside the EEA.</strong>
          </li>
          <li>
            <strong className="text-foreground">No external AI processing.</strong> The previous LLM
            quality-gate that forwarded proposal text to OpenRouter has been removed as part of this
            audit.
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
            <strong className="text-foreground">Complain:</strong> HDPA — dpa.gr.
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
          section 7, email{" "}
          <a href="mailto:info@agorax.gr" className="text-primary hover:underline">info@agorax.gr</a>.
        </p>
      </section>
    </>
  );
}
