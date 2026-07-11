/**
 * The walkthrough — one story, three beats, zero jargon.
 *
 * A first-time visitor should leave this page in about a minute feeling
 * "my neighborhood could use this": a poll measures the need, deliberation
 * shapes the idea in front of everyone (live AI final text, counter-
 * proposals become ballot alternatives instead of getting buried), and an
 * anonymous verifiable vote decides. One scrolling page, no clicking
 * required. Bilingual content lives in a local map (same pattern as
 * POLL_HOW_SECTIONS) — not in the locale files.
 */

import { useEffect } from 'react';
import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useTranslation } from '@/hooks/use-translation';
import { useLocation } from 'wouter';
import {
  BarChart3, MessageSquarePlus, Vote, ArrowDown, ArrowRight,
  CheckCircle2, Sparkles, Lock, Receipt, Zap,
} from 'lucide-react';

type Lang = 'el' | 'en';

const STORY: Record<Lang, {
  heroTitle: string; heroSub: string;
  act1Kicker: string; act1Title: string; act1Body: string;
  pollQuestion: string; pollAnswer: string; pollPct: number; pollMeta: string; act1Value: string;
  act2Kicker: string; act2Title: string; act2Body: string;
  proposalAuthor: string; proposalText: string; amendmentAuthor: string; amendmentText: string; accepted: string;
  liveLabel: string; liveTextBefore: string; liveTextAdded: string;
  counterAuthor: string; counterText: string; counterFate: string; act2Value: string;
  act3Kicker: string; act3Title: string; act3Body: string;
  ballotLabel: string; options: string[]; winnerBadge: string;
  results: Array<{ label: string; pct: number; winner?: boolean }>;
  receiptLine: string; act3Value: string; punch: string;
  directVoteNote: string;
  ctaTitle: string; ctaProposal: string; ctaPoll: string; ctaDetails: string;
}> = {
  el: {
    heroTitle: 'Μια αλάνα. Μια ιδέα. Μια απόφαση.',
    heroSub: 'Δες πώς μια γειτονιά αποφασίζει μαζί — σε τρία βήματα, χωρίς μυστικά.',

    act1Kicker: 'ΒΗΜΑ 1 — Η ΔΗΜΟΣΚΟΠΗΣΗ',
    act1Title: 'Ρώτησε',
    act1Body: 'Η Άννα περνάει κάθε μέρα από την αλάνα της οδού Ερμού. Αξίζει να παλέψει γι’ αυτήν; Πριν προτείνει οτιδήποτε, ρωτάει τη γειτονιά — ανώνυμα, σε ένα λεπτό.',
    pollQuestion: '«Πόσο σας λείπει ένας χώρος για τα παιδιά στη γειτονιά;»',
    pollAnswer: 'Πολύ',
    pollPct: 78,
    pollMeta: '214 απαντήσεις · ανώνυμο πάνελ',
    act1Value: 'Γρήγορος σφυγμός, πραγματικές απαντήσεις. Κανείς δεν ξέρει ποιος απάντησε τι — γι’ αυτό απαντούν ειλικρινά.',

    act2Kicker: 'ΒΗΜΑ 2 — Η ΔΙΑΒΟΥΛΕΥΣΗ',
    act2Title: 'Συνδιαμόρφωσε',
    act2Body: 'Το 78% έδωσε στην Άννα την απάντηση. Προτείνει: «Να γίνει η αλάνα παιδική χαρά.» Το AI ελέγχει την πρόταση σε δευτερόλεπτα και βγαίνει ζωντανή στην κοινότητα.',
    proposalAuthor: 'Άννα',
    proposalText: 'Να μετατραπεί η αλάνα της οδού Ερμού σε παιδική χαρά.',
    amendmentAuthor: 'Γιώργος',
    amendmentText: '+ φωτισμός και παγκάκια, για να ζει ο χώρος και το απόγευμα',
    accepted: 'Η Άννα αποδέχεται',
    liveLabel: 'Το τελικό κείμενο ενημερώνεται ζωντανά, μπροστά σε όλους:',
    liveTextBefore: 'Να μετατραπεί η αλάνα της οδού Ερμού σε παιδική χαρά',
    liveTextAdded: ', με φωτισμό και παγκάκια ώστε ο χώρος να ζει και το απόγευμα.',
    counterAuthor: 'Μαρία',
    counterText: '«Καλύτερα θερινό σινεμά — η γειτονιά έχει παιδικές χαρές, δεν έχει πουθενά να βρεθεί.»',
    counterFate: 'Η αντιπρότασή της δεν θάβεται. Μπαίνει στο ψηφοδέλτιο ως εναλλακτική.',
    act2Value: 'Καμία ιδέα δεν χάνεται. Το AI ενώνει τις αποδεκτές βελτιώσεις — δεν λογοκρίνει και δεν αλλοιώνει. Και όποιος διαφωνεί, δεν φιμώνεται: κατεβαίνει στην ψηφοφορία.',

    act3Kicker: 'ΒΗΜΑ 3 — Η ΨΗΦΟΦΟΡΙΑ',
    act3Title: 'Αποφάσισε',
    act3Body: 'Στη λήξη της διαβούλευσης το κείμενο παγώνει — ακριβώς όπως το είδαν όλοι — και ανοίγει η κάλπη. Μία επιλογή ο καθένας:',
    ballotLabel: 'ΨΗΦΟΔΕΛΤΙΟ',
    options: ['Παιδική χαρά με φωτισμό & παγκάκια', 'Θερινό σινεμά', 'Καμία αλλαγή'],
    winnerBadge: 'Νικήτρια',
    results: [
      { label: 'Παιδική χαρά με φωτισμό & παγκάκια', pct: 61, winner: true },
      { label: 'Θερινό σινεμά', pct: 31 },
      { label: 'Καμία αλλαγή', pct: 8 },
    ],
    receiptLine: 'Ανώνυμη σαν κάλπη, επαληθεύσιμη σαν απόδειξη: παίρνεις κρυπτογραφική απόδειξη ότι η ψήφος σου μέτρησε — χωρίς να φαίνεται πουθενά τι ψήφισες.',
    act3Value: 'Κέρδισε μια ιδέα που δεν ήταν κανενός — και ήταν όλων. Η πρόταση της Άννας, καλύτερη από τον Γιώργο, δοκιμασμένη απέναντι στη Μαρία.',
    punch: 'Αυτό είναι δημοκρατία που δουλεύει: μετράς, συνδιαμορφώνεις, αποφασίζεις.',
    directVoteNote: 'Βιάζεστε; Υπάρχει και η Άμεση Ψηφοφορία: χωρίς διαβούλευση, ναι/όχι ή πολλαπλές επιλογές, με διάρκεια που ορίζεις εσύ.',

    ctaTitle: 'Η δική σου γειτονιά τι θα αποφάσιζε;',
    ctaProposal: 'Ξεκίνα μια πρόταση',
    ctaPoll: 'Δοκίμασε μια δημοσκόπηση',
    ctaDetails: 'Πώς λειτουργεί αναλυτικά',
  },
  en: {
    heroTitle: 'An empty lot. An idea. A decision.',
    heroSub: 'See how a neighborhood decides together — in three steps, with no secrets.',

    act1Kicker: 'STEP 1 — THE POLL',
    act1Title: 'Ask',
    act1Body: 'Anna walks past the empty lot on Ermou street every day. Is it worth fighting for? Before proposing anything, she asks the neighborhood — anonymously, in one minute.',
    pollQuestion: '“How much do you miss a space for kids in the neighborhood?”',
    pollAnswer: 'A lot',
    pollPct: 78,
    pollMeta: '214 answers · anonymous panel',
    act1Value: 'A fast pulse with honest answers. Nobody knows who said what — which is exactly why people answer honestly.',

    act2Kicker: 'STEP 2 — THE DELIBERATION',
    act2Title: 'Shape it together',
    act2Body: 'The 78% gave Anna her answer. She proposes: “Turn the lot into a playground.” The AI checks the proposal in seconds and it goes live in the community.',
    proposalAuthor: 'Anna',
    proposalText: 'Turn the empty lot on Ermou street into a playground.',
    amendmentAuthor: 'Giorgos',
    amendmentText: '+ lighting and benches, so the space lives in the evenings too',
    accepted: 'Anna accepts',
    liveLabel: 'The final text updates live, in front of everyone:',
    liveTextBefore: 'Turn the empty lot on Ermou street into a playground',
    liveTextAdded: ', with lighting and benches so the space stays alive in the evenings.',
    counterAuthor: 'Maria',
    counterText: '“An open-air cinema would be better — the area has playgrounds, but nowhere to gather.”',
    counterFate: 'Her counter-proposal is not buried. It goes on the ballot as an alternative.',
    act2Value: 'No idea gets lost. The AI weaves accepted improvements together — it never censors or dilutes. And whoever disagrees isn’t silenced: their idea runs in the vote.',

    act3Kicker: 'STEP 3 — THE VOTE',
    act3Title: 'Decide',
    act3Body: 'When deliberation ends, the text freezes — exactly as everyone saw it — and the ballot box opens. One choice each:',
    ballotLabel: 'BALLOT',
    options: ['Playground with lighting & benches', 'Open-air cinema', 'No change'],
    winnerBadge: 'Winner',
    results: [
      { label: 'Playground with lighting & benches', pct: 61, winner: true },
      { label: 'Open-air cinema', pct: 31 },
      { label: 'No change', pct: 8 },
    ],
    receiptLine: 'Anonymous like a ballot box, verifiable like a receipt: you get cryptographic proof your vote counted — without anything revealing what you voted.',
    act3Value: 'The winner was an idea that belonged to no one — and to everyone. Anna’s proposal, improved by Giorgos, tested against Maria’s.',
    punch: 'This is democracy that works: measure, shape, decide.',
    directVoteNote: 'In a hurry? There’s also the Direct Vote: no deliberation, yes/no or multiple choice, with a duration you set.',

    ctaTitle: 'What would your neighborhood decide?',
    ctaProposal: 'Start a proposal',
    ctaPoll: 'Try a poll',
    ctaDetails: 'How it works in detail',
  },
};

function Avatar({ name, color }: { name: string; color: string }) {
  return (
    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold text-white shrink-0 ${color}`}>
      {name.slice(0, 1)}
    </span>
  );
}

function ActKicker({ icon: Icon, text, color }: { icon: typeof Vote; text: string; color: string }) {
  return (
    <div className={`inline-flex items-center gap-2 text-xs font-bold tracking-widest ${color}`}>
      <Icon className="w-4 h-4" />
      {text}
    </div>
  );
}

export default function DeliberationWalkthrough() {
  const { locale } = useTranslation();
  const [, navigate] = useLocation();
  const s = STORY[locale === 'en' ? 'en' : 'el'];

  useEffect(() => {
    document.title = `AgoraX — ${s.heroTitle}`;
  }, [s.heroTitle]);

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow pt-16 pb-20">
        <div className="container mx-auto px-4 max-w-2xl">

          {/* ── Hero ── */}
          <div className="text-center py-14">
            <h1 className="text-4xl md:text-5xl font-serif font-bold leading-tight mb-4" data-testid="walkthrough-hero">
              {s.heroTitle}
            </h1>
            <p className="text-lg text-muted-foreground max-w-md mx-auto">{s.heroSub}</p>
            <ArrowDown className="w-5 h-5 mx-auto mt-8 text-muted-foreground animate-bounce" />
          </div>

          {/* ── Act 1: the poll ── */}
          <section className="py-10 space-y-4" data-testid="walkthrough-act-poll">
            <ActKicker icon={BarChart3} text={s.act1Kicker} color="text-sky-600" />
            <h2 className="text-3xl font-serif font-bold">{s.act1Title}</h2>
            <p className="text-muted-foreground leading-relaxed">{s.act1Body}</p>

            <Card className="border-sky-200">
              <CardContent className="p-5 space-y-3">
                <p className="font-medium">{s.pollQuestion}</p>
                <div>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-semibold text-sky-700">{s.pollAnswer}</span>
                    <span className="font-bold text-sky-700">{s.pollPct}%</span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-sky-500 rounded-full" style={{ width: `${s.pollPct}%` }} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{s.pollMeta}</p>
              </CardContent>
            </Card>
            <p className="text-sm text-muted-foreground italic border-l-2 border-sky-300 pl-3">{s.act1Value}</p>
          </section>

          {/* ── Act 2: the deliberation ── */}
          <section className="py-10 space-y-4" data-testid="walkthrough-act-deliberation">
            <ActKicker icon={MessageSquarePlus} text={s.act2Kicker} color="text-amber-600" />
            <h2 className="text-3xl font-serif font-bold">{s.act2Title}</h2>
            <p className="text-muted-foreground leading-relaxed">{s.act2Body}</p>

            {/* the proposal */}
            <Card>
              <CardContent className="p-5 flex gap-3 items-start">
                <Avatar name={s.proposalAuthor} color="bg-emerald-600" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold mb-1">{s.proposalAuthor}</p>
                  <p className="text-sm">{s.proposalText}</p>
                </div>
              </CardContent>
            </Card>

            {/* the amendment */}
            <Card>
              <CardContent className="p-5 flex gap-3 items-start">
                <Avatar name={s.amendmentAuthor} color="bg-indigo-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold mb-1">{s.amendmentAuthor}</p>
                  <p className="text-sm">{s.amendmentText}</p>
                  <Badge variant="secondary" className="mt-2 text-emerald-700 bg-emerald-50 border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    {s.accepted}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* the live text */}
            <div className="p-4 rounded-lg border border-amber-200 bg-amber-50/50 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-700">
                <Sparkles className="w-4 h-4" />
                {s.liveLabel}
              </div>
              <p className="text-sm leading-relaxed">
                {s.liveTextBefore}
                <mark className="bg-emerald-100 text-emerald-900 rounded px-0.5">{s.liveTextAdded}</mark>
              </p>
            </div>

            {/* the counter-proposal */}
            <Card className="border-purple-200">
              <CardContent className="p-5 flex gap-3 items-start">
                <Avatar name={s.counterAuthor} color="bg-purple-600" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold mb-1">{s.counterAuthor}</p>
                  <p className="text-sm">{s.counterText}</p>
                  <p className="text-sm font-medium text-purple-700 mt-2 flex items-center gap-1">
                    <ArrowRight className="w-4 h-4" />
                    {s.counterFate}
                  </p>
                </div>
              </CardContent>
            </Card>
            <p className="text-sm text-muted-foreground italic border-l-2 border-amber-300 pl-3">{s.act2Value}</p>
          </section>

          {/* ── Act 3: the vote ── */}
          <section className="py-10 space-y-4" data-testid="walkthrough-act-vote">
            <ActKicker icon={Vote} text={s.act3Kicker} color="text-emerald-600" />
            <h2 className="text-3xl font-serif font-bold">{s.act3Title}</h2>
            <p className="text-muted-foreground leading-relaxed">{s.act3Body}</p>

            {/* the ballot */}
            <Card className="border-emerald-200">
              <CardContent className="p-5 space-y-2">
                <p className="text-xs font-bold tracking-widest text-muted-foreground">{s.ballotLabel}</p>
                {s.options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded border bg-background text-sm">
                    <span className="w-4 h-4 rounded-full border-2 border-muted-foreground/40 shrink-0" />
                    {opt}
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <Lock className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
              <p>{s.receiptLine}</p>
            </div>

            {/* the result */}
            <Card>
              <CardContent className="p-5 space-y-3">
                {s.results.map((r, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className={r.winner ? 'font-semibold' : 'text-muted-foreground'}>
                        {r.label}
                        {r.winner && (
                          <Badge className="ml-2 bg-emerald-600">
                            <Receipt className="w-3 h-3 mr-1" />
                            {s.winnerBadge}
                          </Badge>
                        )}
                      </span>
                      <span className={r.winner ? 'font-bold' : 'text-muted-foreground'}>{r.pct}%</span>
                    </div>
                    <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${r.winner ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`}
                        style={{ width: `${r.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <p className="text-sm text-muted-foreground italic border-l-2 border-emerald-300 pl-3">{s.act3Value}</p>
            <p className="text-lg font-serif font-semibold text-center pt-4">{s.punch}</p>
            <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
              <Zap className="w-3 h-3" />
              {s.directVoteNote}
            </p>
          </section>

          {/* ── CTA ── */}
          <section className="text-center py-14 border-t mt-6">
            <h2 className="text-2xl font-serif font-bold mb-6">{s.ctaTitle}</h2>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button size="lg" onClick={() => navigate('/proposals/new')} data-testid="walkthrough-cta-proposal">
                {s.ctaProposal}
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate('/surveys')} data-testid="walkthrough-cta-poll">
                {s.ctaPoll}
              </Button>
              <Button size="lg" variant="ghost" onClick={() => navigate('/how-it-works')}>
                {s.ctaDetails}
              </Button>
            </div>
          </section>

        </div>
      </main>
      <Footer />
    </div>
  );
}
