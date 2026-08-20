import { ProposalState } from '@shared/proposal-lifecycle';
import { STATUS_MAP } from '@/lib/proposal-status';
import { useTranslation } from '@/hooks/use-translation';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

interface LifecycleStepperProps {
  status: string;
  interactive?: boolean;
}

// 3-step macro view: submission (instant), deliberation (one phase),
// vote & decision. Internal states map onto the macro step that contains
// them so legacy proposals in author_review/sortition still render.
const MACRO_STEPS: Array<{ key: string; labelEl: string; labelEn: string; states: ProposalState[] }> = [
  { key: 'submit', labelEl: 'Υποβολή & Έλεγχος', labelEn: 'Submit & Check', states: ['draft', 'review'] },
  { key: 'deliberate', labelEl: 'Διαβούλευση', labelEn: 'Deliberation', states: ['author_review', 'community_signal', 'sortition_synthesis', 'final_review'] },
  { key: 'vote', labelEl: 'Ψηφοφορία & Απόφαση', labelEn: 'Vote & Decision', states: ['voting', 'decided'] },
];

// Per-phase accent color. Only applied to the CURRENT step so the rest of
// the stepper stays neutral and the app keeps a serious tone.
const PHASE_ACCENT: Record<string, { ring: string; bg: string; border: string; text: string }> = {
  draft:              { ring: 'ring-blue-200',    bg: 'bg-blue-50',    border: 'border-blue-500',    text: 'text-blue-700' },
  review:             { ring: 'ring-green-200',   bg: 'bg-green-50',   border: 'border-green-500',   text: 'text-green-700' },
  author_review:      { ring: 'ring-indigo-200',  bg: 'bg-indigo-50',  border: 'border-indigo-500',  text: 'text-indigo-700' },
  community_signal:   { ring: 'ring-amber-200',   bg: 'bg-amber-50',   border: 'border-amber-500',   text: 'text-amber-700' },
  sortition_synthesis:{ ring: 'ring-purple-200',  bg: 'bg-purple-50',  border: 'border-purple-500',  text: 'text-purple-700' },
  voting:             { ring: 'ring-emerald-200', bg: 'bg-emerald-50', border: 'border-emerald-500', text: 'text-emerald-700' },
  decided:            { ring: 'ring-emerald-200', bg: 'bg-emerald-50', border: 'border-emerald-600', text: 'text-emerald-700' },
};
const NEUTRAL_ACCENT = { ring: 'ring-primary/20', bg: 'bg-primary/10', border: 'border-primary', text: 'text-primary' };

// One plain-language sentence per state: what is happening NOW and what
// comes next. This is the mini-guidance layer — shown under the stepper so
// nobody has to guess what the current phase means.
const STATE_GUIDE: Record<string, { el: string; en: string }> = {
  draft: {
    el: 'Προσχέδιο — ορατό μόνο σε εσάς. Υποβάλετέ το για να ξεκινήσει η διαδικασία.',
    en: 'Draft — visible only to you. Submit it to start the process.',
  },
  review: {
    el: 'Το AI ελέγχει την πρόταση για πληρότητα — διαρκεί λίγα δευτερόλεπτα.',
    en: 'The AI is checking the proposal for completeness — takes a few seconds.',
  },
  author_review: {
    el: 'Ο συγγραφέας εξετάζει τις τροπολογίες που υποβλήθηκαν.',
    en: 'The author is reviewing the submitted amendments.',
  },
  community_signal: {
    el: 'Διαβούλευση σε εξέλιξη: τα μέλη προτείνουν τροπολογίες και αντιπροτάσεις, ο συγγραφέας αποφασίζει, και το τελικό κείμενο του AI ενημερώνεται ζωντανά. Στη λήξη ανοίγει αυτόματα η ψηφοφορία.',
    en: 'Deliberation in progress: members propose amendments and counter-proposals, the author decides, and the AI final text updates live. Voting opens automatically at the deadline.',
  },
  sortition_synthesis: {
    el: 'Κληρωτό σώμα πολιτών συνθέτει το τελικό κείμενο.',
    en: 'A randomly selected citizen jury is composing the final text.',
  },
  final_review: {
    el: 'Ο συγγραφέας εγκρίνει το τελικό κείμενο που συνέθεσε το AI — μετά ανοίγει η ψηφοφορία.',
    en: 'The author is approving the AI-composed final text — then the vote opens.',
  },
  voting: {
    el: 'Η κάλπη είναι ανοιχτή. Ψηφίστε στην ενότητα της ψηφοφορίας — το αποτέλεσμα οριστικοποιείται αυτόματα στη λήξη.',
    en: 'The ballot box is open. Vote in the voting section — the result finalizes automatically at the deadline.',
  },
  decided: {
    el: 'Η κοινότητα αποφάσισε — το αποτέλεσμα είναι οριστικό και επαληθεύσιμο.',
    en: 'The community has decided — the result is final and verifiable.',
  },
  archived: {
    el: 'Έκλεισε χωρίς απόφαση (απόσυρση, μη απαρτία ή επιστροφή).',
    en: 'Closed without a decision (withdrawn, no quorum, or returned).',
  },
};

export default function LifecycleStepper({ status, interactive = true }: LifecycleStepperProps) {
  const { locale } = useTranslation();

  const currentIndex = MACRO_STEPS.findIndex((m) => m.states.includes(status as ProposalState));
  const isArchived = status === 'archived';
  const isDecided = status === 'decided';
  const currentEntry = STATUS_MAP[status as ProposalState];

  return (
    <div className="w-full" data-testid="lifecycle-stepper">
      {/* Horizontal — desktop */}
      <ol className="hidden md:flex items-center justify-between gap-2 w-full">
        {MACRO_STEPS.map((step, idx) => {
          const label = locale === 'el' ? step.labelEl : step.labelEn;
          const isCompleted = !isArchived && (currentIndex > idx || (isDecided && idx === MACRO_STEPS.length - 1));
          const isCurrent = !isArchived && !isDecided && currentIndex === idx;
          const isFuture = !isCompleted && !isCurrent;

          const accent = isCurrent ? (PHASE_ACCENT[status] ?? NEUTRAL_ACCENT) : NEUTRAL_ACCENT;
          return (
            <li key={step.key} className="flex items-center flex-1 min-w-0">
              <div className="flex flex-col items-center text-center min-w-0">
                <div
                  className={cn(
                    'w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors',
                    isCompleted && 'bg-primary border-primary text-primary-foreground',
                    isCurrent && interactive && `${accent.bg} ${accent.border} ${accent.text} ring-4 ${accent.ring}`,
                    isCurrent && !interactive && `${accent.bg} ${accent.border} ${accent.text}`,
                    isFuture && 'bg-background border-muted text-muted-foreground',
                  )}
                  data-testid={`stepper-circle-${step.key}`}
                >
                  {isCompleted ? <Check className="w-4 h-4" /> : idx + 1}
                </div>
                <span
                  className={cn(
                    'mt-1.5 text-xs leading-tight px-1 truncate max-w-[9rem]',
                    isCurrent && `font-semibold ${accent.text}`,
                    isCompleted && 'text-foreground',
                    isFuture && 'text-muted-foreground',
                  )}
                >
                  {label}
                </span>
                {isCurrent && currentEntry && (
                  <span className="text-[10px] text-muted-foreground truncate max-w-[9rem]">
                    {locale === 'el' ? currentEntry.greekLabel : currentEntry.englishLabel}
                  </span>
                )}
              </div>
              {idx < MACRO_STEPS.length - 1 && (
                <div
                  className={cn(
                    'flex-1 h-0.5 mx-2 -mt-6',
                    isCompleted ? 'bg-primary' : 'bg-muted',
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>

      {/* Vertical — mobile */}
      <ol className="md:hidden space-y-2">
        {MACRO_STEPS.map((step, idx) => {
          const label = locale === 'el' ? step.labelEl : step.labelEn;
          const isCompleted = !isArchived && (currentIndex > idx || (isDecided && idx === MACRO_STEPS.length - 1));
          const isCurrent = !isArchived && !isDecided && currentIndex === idx;
          const isFuture = !isCompleted && !isCurrent;
          const isLast = idx === MACRO_STEPS.length - 1;

          const accent = isCurrent ? (PHASE_ACCENT[status] ?? NEUTRAL_ACCENT) : NEUTRAL_ACCENT;
          return (
            <li key={step.key} className="flex gap-3 items-start">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors flex-shrink-0',
                    isCompleted && 'bg-primary border-primary text-primary-foreground',
                    isCurrent && `${accent.bg} ${accent.border} ${accent.text}`,
                    isFuture && 'bg-background border-muted text-muted-foreground',
                  )}
                >
                  {isCompleted ? <Check className="w-4 h-4" /> : idx + 1}
                </div>
                {!isLast && (
                  <div
                    className={cn(
                      'w-0.5 flex-1 min-h-6 mt-1',
                      isCompleted ? 'bg-primary' : 'bg-muted',
                    )}
                  />
                )}
              </div>
              <div className="flex-1 pt-1 pb-3">
                <span
                  className={cn(
                    'text-sm',
                    isCurrent && `font-semibold ${accent.text}`,
                    isCompleted && 'text-foreground',
                    isFuture && 'text-muted-foreground',
                  )}
                >
                  {label}
                </span>
                {isCurrent && currentEntry && (
                  <div className="text-xs text-muted-foreground">
                    {currentEntry.icon} {locale === 'el' ? currentEntry.greekLabel : currentEntry.englishLabel}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {STATE_GUIDE[status] && !isArchived && (
        <p className="mt-3 text-xs text-muted-foreground text-center max-w-xl mx-auto" data-testid="stepper-guide">
          {locale === 'el' ? STATE_GUIDE[status].el : STATE_GUIDE[status].en}
        </p>
      )}

      {isArchived && (
        <div className="mt-3 text-center text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
          {STATUS_MAP.archived.icon} {locale === 'el' ? STATUS_MAP.archived.greekLabel : STATUS_MAP.archived.englishLabel}
        </div>
      )}
    </div>
  );
}
