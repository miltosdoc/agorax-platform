import { useTranslation } from "@/hooks/use-translation";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import { Separator } from "@/components/ui/separator";

/**
 * Terms of Service.
 *
 * Bilingual (el / en). Aligned with the current implementation:
 *  - Proposal flow goes draft → review → ... → voting → decided/archived.
 *  - LLM quality gate is local-only (was external OpenRouter, removed in
 *    the GDPR pass — proposals now always route to sortition human review).
 *  - Source is CC-BY-NC-4.0 (see LICENSE) — non-commercial reuse.
 *  - Privacy details live in /privacy, not here.
 */

const LAST_UPDATED = "2026-05-25";

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
                  ? `Last updated: ${LAST_UPDATED}. Continued use after material updates constitutes acceptance.`
                  : `Τελευταία ενημέρωση: ${LAST_UPDATED}. Η συνεχιζόμενη χρήση μετά από ουσιαστικές αλλαγές συνιστά αποδοχή.`}
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
          Η AgoraX είναι μια κλειστή πλατφόρμα διαβουλευτικής δημοκρατίας της ΑΜΚΕ «Επανεκκίνηση
          Δημοκρατίας» (Ελλάδα). Επιτρέπει σε επαληθευμένα μέλη να υποβάλλουν προτάσεις, να καταθέτουν
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
        </ul>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">3. Υποβολή προτάσεων και τροπολογιών</h2>
        <p className="mb-3">
          Οι προτάσεις ακολουθούν τη δομή <em>ερώτημα + λύση</em>. Κάθε πρόταση περνά από έλεγχο
          ποιότητας πριν προχωρήσει στη φάση τροπολογιών και ψηφοφορίας.
        </p>
        <p>
          <strong className="text-foreground">Σημείωση:</strong> ο αυτόματος έλεγχος AI είναι προσωρινά
          ανενεργός — όλες οι προτάσεις δρομολογούνται σε κληρωτό σώμα για ανθρώπινη αξιολόγηση. Καμία
          πρόταση ή κείμενο δεν αποστέλλεται σε εξωτερική υπηρεσία τεχνητής νοημοσύνης.
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
          <li>Μηχανική παρέμβαση (bots, scraping χωρίς άδεια).</li>
          <li>Προσπάθεια επαναπροσδιορισμού (re-identification) ψηφοφόρων.</li>
        </ul>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">7. Νομική ισχύς αποτελεσμάτων</h2>
        <p>
          <strong className="text-foreground">Οι ψηφοφορίες είναι συμβουλευτικές</strong> — δεν παράγουν
          δεσμευτικές νομικές πράξεις. Αποτελούν έκφραση της συλλογικής βούλησης των μελών της ΑΜΚΕ και
          τροφοδοτούν τη συζήτηση των οργάνων της.
        </p>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">8. Προστασία προσωπικών δεδομένων</h2>
        <p>
          Η επεξεργασία προσωπικών δεδομένων διέπεται από την{" "}
          <a href="/privacy" className="text-primary hover:underline">Ενημέρωση Προστασίας Δεδομένων</a>{" "}
          μας, η οποία αποτελεί αναπόσπαστο μέρος των παρόντων όρων. Μην χρησιμοποιήσετε την πλατφόρμα
          εάν δεν συμφωνείτε με την Ενημέρωση.
        </p>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">9. Πνευματική ιδιοκτησία και άδεια</h2>
        <p>
          Ο κώδικας της πλατφόρμας AgoraX, η τεκμηρίωση και τα σχήματα δεδομένων διατίθενται με την άδεια{" "}
          <strong className="text-foreground">CC-BY-NC-4.0</strong> (Creative Commons Attribution-NonCommercial)
          — δείτε το αρχείο LICENSE στο αποθετήριο. Επιτρέπεται η μη εμπορική επαναχρησιμοποίηση με
          αναφορά. Οι προτάσεις και τα σχόλια των μελών παραμένουν διανοητική ιδιοκτησία των μελών αλλά
          παραχωρούνται στην ΑΜΚΕ άδεια προβολής και αρχειοθέτησης για τους σκοπούς της πλατφόρμας.
        </p>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">10. Τροποποίηση των όρων</h2>
        <p>
          Μπορεί να ενημερώνουμε τους παρόντες όρους περιοδικά. Ουσιαστικές αλλαγές κοινοποιούνται μέσω
          email και ενδοεφαρμογικού banner. Η συνεχιζόμενη χρήση μετά την αλλαγή συνιστά αποδοχή.
        </p>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">11. Επικοινωνία</h2>
        <p>
          Για ερωτήσεις σχετικά με τους όρους χρήσης, στείλτε email στο{" "}
          <a href="mailto:info@agorax.gr" className="text-primary hover:underline">info@agorax.gr</a>.
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
          AgoraX is a closed deliberative-democracy platform operated by AMKE "Restart Democracy"
          (Greece). It allows verified members to submit proposals, file amendments, participate in
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
        </ul>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">3. Proposals and amendments</h2>
        <p className="mb-3">
          Proposals follow a <em>question + solution</em> structure. Each proposal passes a quality check
          before moving to the amendment phase and the vote.
        </p>
        <p>
          <strong className="text-foreground">Note:</strong> the automated AI quality check is
          temporarily disabled — all proposals route to a sortition body for human review. No proposal
          text leaves the instance to any external AI service.
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
          <li>Automated interaction (bots, unauthorised scraping).</li>
          <li>Attempting to re-identify other voters.</li>
        </ul>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">7. Legal status of outcomes</h2>
        <p>
          <strong className="text-foreground">Votes are consultative</strong> — they do not produce
          binding legal acts. They express the collective will of the AMKE's members and feed into the
          deliberation of its bodies.
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
          The AgoraX source code, documentation, and data schemas are licensed under{" "}
          <strong className="text-foreground">CC-BY-NC-4.0</strong> (Creative Commons
          Attribution-NonCommercial) — see the LICENSE file in the repository. Non-commercial reuse is
          permitted with attribution. Member proposals and comments remain the members' intellectual
          property; by submitting, you grant the AMKE a license to display and archive them for the
          purposes of the platform.
        </p>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">10. Changes to these terms</h2>
        <p>
          We may update these terms from time to time. Material changes are communicated by email and
          in-app banner. Continued use after a change constitutes acceptance.
        </p>
      </section>

      <Separator />

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">11. Contact</h2>
        <p>
          For questions about these terms, email{" "}
          <a href="mailto:info@agorax.gr" className="text-primary hover:underline">info@agorax.gr</a>.
        </p>
      </section>
    </>
  );
}
