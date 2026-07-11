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

      {isArchived && (
        <div className="mt-3 text-center text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
          {STATUS_MAP.archived.icon} {locale === 'el' ? STATUS_MAP.archived.greekLabel : STATUS_MAP.archived.englishLabel}
        </div>
      )}
    </div>
  );
}
