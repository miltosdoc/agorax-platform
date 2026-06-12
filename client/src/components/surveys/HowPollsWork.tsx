/**
 * «Πώς λειτουργεί;» — the user-facing explainer for the polling module.
 * Lives behind a small help button that opens a dialog, so it never
 * crowds the surveys page. Plain language; the technical version is in
 * docs/POLLING.md.
 */
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { HelpCircle } from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';

export interface Section { title: { el: string; en: string }; body: { el: string; en: string } }

export const POLL_HOW_SECTIONS: Section[] = [
  {
    title: { el: "Τι είναι οι δημοσκοπήσεις του AgoraX;", en: "What are AgoraX polls?" },
    body: { el: "Ένα ανοιχτό εργαλείο μέτρησης της κοινής γνώμης: οποιοδήποτε μέλος περιγράφει με απλά λόγια τι θέλει να μάθει, το σύστημα χτίζει ουδέτερο ερωτηματολόγιο, και το ανώνυμο πάνελ απαντά. Κάθε αποτέλεσμα συνοδεύεται από πλήρη σελίδα μεθοδολογίας — δείγμα, στάθμιση, ακριβής διατύπωση. Η διαφάνεια δεν είναι υποσημείωση· είναι το προϊόν.", en: "An open public-opinion measurement tool: any member describes in plain words what they want to learn, the system builds a neutral questionnaire, and the anonymous panel answers. Every result ships with a full methodology page — sample, weighting, exact wording. Transparency is not a footnote; it is the product." },
  },
  {
    title: { el: "Πώς δημιουργώ δημοσκόπηση;", en: "How do I create a poll?" },
    body: { el: "Πάτησε «Νέα δημοσκόπηση» και γράψε την πρόθεσή σου, π.χ. «θέλω να μάθω αν οι κάτοικοι θα χρησιμοποιούσαν νέους ποδηλατοδρόμους». Το σύστημα συντάσσει τις ερωτήσεις με κανόνες μεθοδολογίας (όχι καθοδηγητικές ερωτήσεις, ισορροπημένες κλίμακες) και ένας ανεξάρτητος αυτόματος έλεγχος σημειώνει προβλήματα. Μετά είναι δικό σου: επεξεργάζεσαι τίτλο, ερωτήσεις και επιλογές πριν τη δημοσίευση. Όταν τη κλείσεις, τα αποτελέσματα και η μεθοδολογία παγώνουν.", en: "Tap “New poll” and write your intent, e.g. “I want to know whether residents would use new bike lanes”. The system drafts the questions under methodology rules (no leading questions, balanced scales) and an independent automated review flags problems. Then it is yours: edit the title, questions and options before publishing. When you close it, the results and methodology freeze." },
  },
  {
    title: { el: "Τι είναι το ανώνυμο πάνελ;", en: "What is the anonymous panel?" },
    body: { el: "Για να απαντήσεις σε δημοσκοπήσεις γίνεσαι μέλος του πάνελ — μία φορά. Κατά την εγγραφή δίνεις ένα σύντομο δημογραφικό προφίλ (ηλικία, περιφέρεια, μόρφωση κ.λπ.) που χρησιμεύει αποκλειστικά για στατιστική στάθμιση. Η εγγραφή γίνεται με «τυφλές υπογραφές»: ο διακομιστής επιβεβαιώνει ότι είσαι πραγματικό μέλος, αλλά δεν μπορεί να συνδέσει την ταυτότητά σου με την ταυτότητα πάνελ. Οι απαντήσεις σου δεν συνδέονται ΠΟΤΕ με το όνομά σου — ούτε εμείς δεν μπορούμε να τις βρούμε.", en: "To answer polls you join the panel — once. At enrollment you provide a short demographic profile (age, region, education etc.) used solely for statistical weighting. Enrollment uses “blind signatures”: the server confirms you are a real member but cannot link your identity to your panel identity. Your answers are NEVER connected to your name — not even we can find them." },
  },
  {
    title: { el: "Γιατί η ταυτότητα πάνελ «ζει» στη συσκευή μου;", en: "Why does my panel identity “live” on my device?" },
    body: { el: "Ακριβώς επειδή δεν ξέρουμε ποια ταυτότητα πάνελ είναι δική σου, δεν μπορούμε και να σου τη «στείλουμε» σε άλλη συσκευή. Αποθηκεύεται στον browser/εφαρμογή όπου έκανες την εγγραφή. Αν καθαρίσεις τα δεδομένα του browser, η ταυτότητα χάνεται — αυτό είναι το κόστος της πραγματικής ανωνυμίας.", en: "Precisely because we do not know which panel identity is yours, we cannot “send” it to another device either. It is stored in the browser/app where you enrolled — you can transfer it manually from the /panel page. If you clear browser data the identity is lost; that is the cost of real anonymity." },
  },
  {
    title: { el: "Τι είναι οι «πάγιες» ερωτήσεις;", en: "What are the “standing” questions?" },
    body: { el: "Κάθε δημοσκόπηση ξεκινά με 2–3 σταθερές ερωτήσεις της πλατφόρμας (π.χ. «σωστή ή λάθος κατεύθυνση;»). Είναι πάντα ίδιες, λέξη προς λέξη, ώστε να χτίζονται αξιόπιστες χρονοσειρές τάσεων — και μπαίνουν πάντα πρώτες, πριν δεις το θέμα της δημοσκόπησης, για να μην επηρεάζονται οι απαντήσεις. Κάθε μέλος βλέπει ένα διαφορετικό υποσύνολο από τη δεξαμενή.", en: "Every poll starts with 2–3 fixed platform questions (e.g. “right or wrong direction?”). They are always identical, word for word, so reliable trend series can be built — and they always come first, before you see the poll topic, so answers are not colored by it. Each member sees a different subset from the pool." },
  },
  {
    title: { el: "Πώς κερδίζω Πόντους Δημοκρατίας;", en: "How do I earn Democracy Points?" },
    body: { el: "Κάθε ολοκληρωμένη συμμετοχή που περνά τον έλεγχο ποιότητας δίνει 40 πόντους. Ο έλεγχος είναι αυτόματος: μία ερώτηση προσοχής (διάβασε προσεκτικά — σου λέει τι να επιλέξεις), έλεγχος ταχύτητας (οι απαντήσεις-αστραπή απορρίπτονται) και έλεγχος μοτίβου (το να επιλέγεις συνέχεια το ίδιο κουτάκι δεν μετράει). Απαντήσεις που κόβονται δεν μπαίνουν στα αποτελέσματα και δεν δίνουν πόντους.", en: "Every completed response that passes the quality check earns 40 points. The check is automatic: one attention question (read carefully — it tells you what to pick), a speed check (lightning-fast responses are rejected) and a pattern check (ticking the same box every time does not count). Responses that fail are excluded from results and earn no points." },
  },
  {
    title: { el: "Τι σημαίνει «Κοινοτική · Ανεπίσημη» και «Πιστοποιημένη»;", en: "What do “Community · Unofficial” and “Certified” mean?" },
    body: { el: "Οι κοινοτικές δημοσκοπήσεις φτιάχνονται από μέλη και είναι ρητά ανεπίσημες — χρήσιμες, αλλά όχι δημοσιευμένα ευρήματα. Οι πιστοποιημένες συντάσσονται από την πλατφόρμα με ελεγμένη μεθοδολογία και είναι οι μόνες που δημοσιεύονται ως ευρήματα του AgoraX. Ο διαχωρισμός είναι ορατός παντού — ακόμα και στις προεπισκοπήσεις όταν μοιράζεσαι σύνδεσμο.", en: "Community polls are made by members and are explicitly unofficial — useful, but not published findings. Certified polls are authored by the platform with reviewed methodology and are the only ones published as AgoraX findings. The separation is visible everywhere — even in link previews when you share." },
  },
  {
    title: { el: "Τι σημαίνει «σταθμισμένο» αποτέλεσμα;", en: "What does a “weighted” result mean?" },
    body: { el: "Το πάνελ δεν είναι ποτέ τέλεια αντιπροσωπευτικό — π.χ. μπορεί να έχει περισσότερους νέους από τον πραγματικό πληθυσμό. Η στάθμιση διορθώνει τα ποσοστά με βάση τα δημογραφικά της ΕΛΣΤΑΤ. Δείχνουμε πάντα ΚΑΙ το αστάθμιστο ΚΑΙ το σταθμισμένο νούμερο, μαζί με το πραγματικό μέγεθος δείγματος — ποτέ μόνο το «ωραίο» νούμερο.", en: "The panel is never perfectly representative — e.g. it may have more young people than the real population. Weighting corrects the percentages against ELSTAT demographics. We always show BOTH the raw AND the weighted number, together with the true sample size — never just the “nice” number." },
  },
];

export default function HowPollsWork() {
  const { locale } = useTranslation();
  const lang: 'el' | 'en' = locale === 'en' ? 'en' : 'el';

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          <HelpCircle className="w-4 h-4 mr-1" />
          {lang === 'en' ? 'How does it work?' : 'Πώς λειτουργεί;'}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <HelpCircle className="w-4 h-4" />
            {lang === 'en' ? 'How polls work' : 'Πώς λειτουργούν οι δημοσκοπήσεις'}
          </DialogTitle>
        </DialogHeader>
        <Accordion type="single" collapsible defaultValue="item-0">
          {POLL_HOW_SECTIONS.map((s, i) => (
            <AccordionItem key={i} value={`item-${i}`}>
              <AccordionTrigger className="text-sm text-left">{s.title[lang]}</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">{s.body[lang]}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </DialogContent>
    </Dialog>
  );
}
