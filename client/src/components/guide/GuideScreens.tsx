/**
 * The mock app screens of the user guide, one per step, each drawn for the
 * shot it is on (phase). They use the app's own colour tokens, so they look
 * like the app in the visitor's theme, and the app's own labels through t(),
 * so a renamed button is renamed here too. Elements the guide's pointer
 * presses carry data-g.
 */
import { useEffect, useState } from 'react';
import {
  BarChart3,
  Bell,
  Check,
  ChevronRight,
  FileText,
  Library,
  Loader2,
  MessageSquare,
  Mic,
  Pin,
  Play,
  ShieldCheck,
  Smartphone,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Video,
} from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';
import { reducedMotion } from '@/components/landing/scroll';
import type { Samples, StepId } from './guide-copy';

type T = (key: string, params?: Record<string, string | number>) => string;

interface ScreenProps {
  phase: number;
  s: Samples;
  t: T;
}

const BTN = 'inline-flex items-center justify-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-semibold transition-colors';
const PRIMARY = `${BTN} bg-ink text-paper`;
const ACCENT = `${BTN} bg-kyanos text-accent-foreground`;
const OUTLINE = `${BTN} border border-line bg-surface text-ink`;
const CARD = 'rounded-sm border border-line bg-surface';

function AppBar({ t }: { t: T }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2.5">
      <span className="font-serif text-base text-ink">AgoraX</span>
      <span className="hidden gap-4 text-xs text-ink-soft sm:flex">
        <span>{t('nav.communities')}</span>
        <span>{t('nav.proposals')}</span>
      </span>
      <span data-g="new" className={PRIMARY}>
        {t('nav.newProposal')} +
      </span>
    </div>
  );
}

function Lines({ n = 3 }: { n?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="h-2 rounded-full bg-sunken" style={{ width: `${92 - i * 17}%` }} />
      ))}
    </div>
  );
}

function CommunityHead({ s, t, tab }: { s: Samples; t: T; tab: number }) {
  const tabs = ['community.tab_forum', 'community.tab_proposals', 'community.tab_constitution', 'community.tab_library', 'community.tab_members'];
  return (
    <div className="border-b border-line bg-surface px-4 pt-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-serif text-lg text-ink">{s.communities[0].name}</span>
        <span className="shrink-0 text-xs text-ink-faint">{s.members}</span>
      </div>
      <div data-g="tabs" className="mt-2 flex gap-4 overflow-hidden text-xs">
        {tabs.map((k, i) => (
          <span key={k} className={`whitespace-nowrap border-b-2 pb-2 ${i === tab ? 'border-kyanos font-semibold text-kyanos' : 'border-transparent text-ink-faint'}`}>
            {t(k)}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── 1 · sign up ── */
function Join({ phase, s, t }: ScreenProps) {
  if (phase === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className={`${CARD} w-full max-w-xs p-5`}>
          <div className="mb-4 grid grid-cols-2 rounded-sm bg-sunken p-1 text-center text-xs font-semibold">
            <span className="py-1.5 text-ink-faint">{t('auth.login')}</span>
            <span className="rounded-sm bg-surface py-1.5 text-ink">{t('auth.register')}</span>
          </div>
          <span data-g="google" className={`${OUTLINE} w-full py-2`}>
            <span className="font-bold text-kyanos">G</span> {t('auth.signUpWithGoogle')}
          </span>
          <div className="my-4 h-px bg-line" />
          <p className="mb-1 text-[11px] font-semibold text-ink-soft">{t('auth.email')}</p>
          <div className="mb-3 h-8 rounded-sm border border-line bg-paper" />
          <p className="mb-1 text-[11px] font-semibold text-ink-soft">{t('auth.password')}</p>
          <div className="mb-4 h-8 rounded-sm border border-line bg-paper" />
          <span className={`${PRIMARY} w-full py-2`}>{t('auth.register')}</span>
        </div>
      </div>
    );
  }
  return (
    <div>
      <AppBar t={t} />
      <div className="space-y-3 p-4">
        <div data-g="welcome" className="flex items-start gap-3 rounded-sm border border-yper bg-yper-wash p-3 text-sm text-ink">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-yper" aria-hidden="true" />
          <span>{s.welcome}</span>
        </div>
        {[0, 1].map((i) => (
          <div key={i} className={`${CARD} p-4`}>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{s.general}</p>
            <Lines />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── 2 · communities ── */
function Communities({ phase, s, t }: ScreenProps) {
  if (phase === 1) {
    return (
      <div>
        <CommunityHead s={s} t={t} tab={0} />
        <div className="space-y-3 p-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className={`${CARD} p-4`}>
              <Lines n={2} />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (phase === 2) {
    return (
      <div className="p-4 sm:p-6">
        <p className="font-serif text-xl text-ink">{t('community.create_title')}</p>
        <p className="mb-1 mt-4 text-[11px] font-semibold text-ink-soft">{s.communityName}</p>
        <div className="mb-4 flex h-9 items-center rounded-sm border border-line bg-surface px-3 text-sm text-ink">{s.communities[2].name}</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div data-g="create" className="rounded-sm border-2 border-kyanos bg-kyanos-wash p-3">
            <p className="text-sm font-semibold text-ink">{t('community.type_autonomous')}</p>
            <Lines n={2} />
          </div>
          <div className={`${CARD} p-3`}>
            <p className="text-sm font-semibold text-ink">{t('community.type_managed')}</p>
            <Lines n={2} />
          </div>
        </div>
        <span className={`${PRIMARY} mt-5`}>{t('community.create_button')}</span>
      </div>
    );
  }
  return (
    <div>
      <AppBar t={t} />
      <div className="space-y-3 p-4">
        <p className="font-serif text-xl text-ink">{t('nav.communities')}</p>
        {s.communities.map((c, i) => (
          <div key={c.name} className={`${CARD} flex items-center justify-between gap-3 p-3`}>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{c.name}</p>
              <p className="text-xs text-ink-faint">
                {c.meta} · {t(c.kind === 'autonomous' ? 'community.type_autonomous' : 'community.type_managed')}
              </p>
            </div>
            <span data-g={i === 0 ? 'join' : undefined} className={ACCENT}>
              {t('community.join')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── 3 · forum ── */
function Forum({ phase, s, t }: ScreenProps) {
  if (phase === 0) {
    return (
      <div>
        <CommunityHead s={s} t={t} tab={0} />
        <div className="p-4">
          <div className="mb-3 flex justify-end">
            <span data-g="new-topic" className={PRIMARY}>
              {t('forum.new_topic')}
            </span>
          </div>
          {s.topics.map((tp, i) => (
            <div key={tp.t} className="flex gap-3 border-b border-line py-3">
              <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-kyanos" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-ink">
                  {i === 0 && <Pin className="mr-1 inline h-3 w-3 text-bronze" aria-hidden="true" />}
                  {tp.t}
                </p>
                <p className="text-xs text-ink-faint">{t('forum.n_replies', { n: tp.n })}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div>
      <CommunityHead s={s} t={t} tab={0} />
      <div className="space-y-3 p-4">
        <p className="font-serif text-lg text-ink">{s.topics[1].t}</p>
        <div className={`${CARD} p-3`}>
          <Lines n={2} />
        </div>
        <div className={`${CARD} ml-6 p-3`}>
          <p className="text-sm text-ink">
            <span className="mr-2 font-semibold">{s.replyBy}</span>
            {s.reply}
          </p>
          <span data-g="useful" className={`${OUTLINE} mt-3 ${phase >= 1 ? 'text-kyanos' : ''}`}>
            <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" /> {t('forum.useful')} {phase >= 1 ? '· 9' : ''}
          </span>
        </div>
        {phase === 2 && (
          <span data-g="promote" className={ACCENT}>
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> {t('forum.promote')}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── 4 · a new vote ── */
function NewVote({ phase, s, t }: ScreenProps) {
  const [typed, setTyped] = useState(0);
  useEffect(() => {
    if (phase !== 2) return;
    if (reducedMotion()) {
      setTyped(s.idea.length);
      return;
    }
    setTyped(0);
    const timer = window.setInterval(() => setTyped((n) => (n >= s.idea.length ? n : n + 1)), 34);
    return () => clearInterval(timer);
  }, [phase, s.idea]);

  if (phase === 0) {
    return (
      <div>
        <AppBar t={t} />
        <div className="space-y-3 p-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className={`${CARD} p-4`}>
              <Lines />
            </div>
          ))}
        </div>
      </div>
    );
  }
  const kinds = ['proposal.kind_decision', 'proposal.kind_statute', 'proposal.kind_election', 'proposal.kind_poll'];
  return (
    <div className="p-4 sm:p-5">
      <p className="font-serif text-xl text-ink">{t('proposal.form_title_new')}</p>
      <p className="mb-2 mt-3 text-[11px] font-semibold text-ink-soft">{t('proposal.form_kind_label')}</p>
      <div className="flex flex-wrap gap-1.5">
        {kinds.map((k, i) => (
          <span
            key={k}
            data-g={i === 0 ? 'kind' : undefined}
            className={`rounded-full border px-3 py-1 text-xs ${i === 0 ? 'border-kyanos bg-kyanos text-accent-foreground' : 'border-line text-ink-soft'}`}
          >
            {t(k)}
          </span>
        ))}
      </div>
      {phase === 2 && (
        <div className="mt-4">
          <p className="mb-1 text-[11px] font-semibold text-ink-soft">{t('proposal.form_ai_label')}</p>
          <div className="min-h-[64px] rounded-sm border border-line-strong bg-surface p-2.5 text-sm text-ink">
            {s.idea.slice(0, typed)}
            <span className="ml-px inline-block h-4 w-px animate-pulse bg-kyanos align-text-bottom" />
          </div>
          <span data-g="ai" className={`${ACCENT} mt-3`}>
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> {t('proposal.ai_generate')}
          </span>
        </div>
      )}
      {phase === 3 && (
        <div className="mt-4 space-y-3">
          <p className="rounded-sm bg-kyanos-wash px-3 py-2 text-xs text-ink">{t('proposal.form_ai_done')}</p>
          <div>
            <p className="mb-1 text-[11px] font-semibold text-ink-soft">{t('proposal.question_label')}</p>
            <div className="rounded-sm border border-line bg-surface px-3 py-2 text-sm text-ink">{s.question}</div>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold text-ink-soft">{t('proposal.form_duration')}</p>
            <div className="flex gap-1.5">
              {s.durations.map((d, i) => (
                <span key={d} className={`rounded-sm border px-2.5 py-1 text-xs ${i === 1 ? 'border-kyanos bg-kyanos-wash font-semibold text-kyanos' : 'border-line text-ink-soft'}`}>
                  {d}
                </span>
              ))}
            </div>
          </div>
          <p className="flex items-center gap-1 text-xs text-ink-faint">
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /> {t('proposal.form_more')}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <span className={OUTLINE}>{t('proposal.form_save_draft')}</span>
            <span data-g="start" className={PRIMARY}>
              {t('proposal.form_start_vote')}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 5 · co-drafting ── */
function Codraft({ phase, s, t }: ScreenProps) {
  if (phase === 2) {
    return (
      <div className="p-4 sm:p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-antip">{t('proposal.kind_election')}</p>
        <p className="font-serif text-lg text-ink">{s.electionTitle}</p>
        <div className={`${CARD} mt-3 p-4`}>
          <p className="text-sm font-semibold text-ink">{t('options.nominations_title')}</p>
          <p className="mt-1 text-xs text-ink-soft">{t('options.nominations_help_nodate')}</p>
          <ul className="mt-3 space-y-2">
            {s.candidates.map((c, i) => (
              <li key={c} className="flex items-center justify-between rounded-sm bg-sunken px-3 py-2 text-sm text-ink">
                {c}
                {i === 0 && <span className="text-[11px] text-ink-faint">{t('options.self_nominated')}</span>}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <div className="flex h-8 flex-1 items-center rounded-sm border border-line px-2 text-xs text-ink-faint">{t('options.nominations_placeholder')}</div>
            <span className={OUTLINE}>{t('options.nominations_add')}</span>
          </div>
          <span data-g="stand" className={`${ACCENT} mt-3`}>
            {t('options.stand')}
          </span>
        </div>
      </div>
    );
  }
  const accepted = phase === 1;
  return (
    <div className="space-y-3 p-4 sm:p-5">
      <div className={`${CARD} p-4`}>
        <p className="font-serif text-base leading-relaxed text-ink">
          {s.proposal}
          {accepted && <span className="ml-1 rounded-sm bg-yper-wash px-1 text-yper">{s.amendment.toLowerCase()}</span>}
        </p>
      </div>
      <div className={`${CARD} p-4`}>
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-full bg-kyanos-wash px-2 py-0.5 text-[11px] font-semibold text-kyanos">{t('workspace.amendments.type.improvement')}</span>
          {accepted && <span className="rounded-full bg-yper-wash px-2 py-0.5 text-[11px] font-semibold text-yper">{t('amendment.accepted')}</span>}
        </div>
        <p className="mt-2 text-sm text-ink">
          «{s.amendment}» <span className="text-ink-faint">· {s.amendmentBy}</span>
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span data-g="upvote" className={OUTLINE}>
            <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" /> 14
          </span>
          <span className={OUTLINE}>
            <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" /> 2
          </span>
          {!accepted && (
            <>
              <span data-g="accept" className={`${BTN} ml-auto bg-yper-wash text-yper`}>
                {t('amendment.accept')}
              </span>
              <span className={`${BTN} bg-kata-wash text-kata`}>{t('amendment.reject')}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── 6 · voting ── */
function Vote({ phase, s, t }: ScreenProps) {
  const ballot = (
    <div className={`${CARD} p-4`}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-serif text-lg text-ink">{s.question}</p>
      </div>
      <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-kyanos-wash px-2 py-0.5 text-[11px] font-semibold text-kyanos">
        <ShieldCheck className="h-3 w-3" aria-hidden="true" /> {t('vote.anonymousMode')}
      </p>
      <div className="mt-3 grid gap-2">
        <span data-g="support" className={`${BTN} justify-start border border-yper bg-yper-wash py-2.5 text-sm text-yper`}>
          {t('proposal.support')}
        </span>
        <span className={`${BTN} justify-start border border-line py-2.5 text-sm text-kata`}>{t('proposal.oppose')}</span>
        <span className={`${BTN} justify-start border border-line py-2.5 text-sm text-apochi`}>{t('proposal.abstain')}</span>
      </div>
    </div>
  );
  if (phase === 0) return <div className="p-4 sm:p-5">{ballot}</div>;
  if (phase === 1) {
    return (
      <div className="relative h-full p-4 sm:p-5">
        {ballot}
        <div className="absolute inset-0 flex items-center justify-center bg-ink/40 p-4">
          <div className={`${CARD} w-full max-w-sm p-5 shadow-lg`}>
            <p className="font-semibold text-ink">{t('vote.anonConfirmTitle')}</p>
            <p className="mt-2 text-sm text-ink-soft">{t('vote.anonConfirmBody')}</p>
            <p className="mt-3 text-sm text-ink">
              {t('vote.anonConfirmChoice')} <b>{t('proposal.support')}</b>
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <span className={OUTLINE}>{t('general.cancel')}</span>
              <span data-g="confirm" className={PRIMARY}>
                {t('vote.anonConfirmAction')}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (phase === 2) {
    return (
      <div className="p-4 sm:p-5">
        <div data-g="pending" className="rounded-sm border border-yper bg-yper-wash p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Loader2 className="h-4 w-4 animate-spin text-yper" aria-hidden="true" /> {t('vote.ballotPendingTitle')}
          </p>
          <p className="mt-2 line-clamp-4 text-xs leading-relaxed text-ink-soft">{t('vote.ballotPendingBody')}</p>
        </div>
      </div>
    );
  }
  const [a, b] = [s.receipt.slice(0, 35), s.receipt.slice(36)];
  return (
    <div className="p-4 sm:p-5">
      <div data-g="receipt" className={`${CARD} p-4`}>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{t('vote.receiptHash')}</p>
        <code className="mt-2 block font-mono text-xs leading-relaxed text-ink">
          {a}
          <br />
          {b}
        </code>
        <p className="mt-3 text-xs text-ink-soft">{t('receipt.noChoice')}</p>
      </div>
    </div>
  );
}

/* ── 7 · the result ── */
function Result({ phase, s, t }: ScreenProps) {
  if (phase === 1) {
    return (
      <div>
        <CommunityHead s={s} t={t} tab={2} />
        <div className="p-4">
          <div data-g="const" className="rounded-sm border border-bronze bg-bronze-wash p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-bronze">{s.constTitle}</p>
            <p className="mt-2 font-serif text-base text-ink">{s.constItem}</p>
          </div>
        </div>
      </div>
    );
  }
  if (phase === 2) {
    return (
      <div className="p-4 sm:p-5">
        <div className={`${CARD} p-4`}>
          <p className="font-serif text-lg text-ink">{s.verifyQ}</p>
          <ul className="mt-3 space-y-2">
            {s.verifyChecks.map((c) => (
              <li key={c} className="flex gap-2 text-sm text-ink">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-yper" aria-hidden="true" /> {c}
              </li>
            ))}
          </ul>
          <p data-g="verified" className="mt-4 rounded-sm bg-yper-wash px-3 py-2 text-sm font-semibold text-yper">
            {s.verifyOk}
          </p>
        </div>
      </div>
    );
  }
  const bars: [string, number, string][] = [
    ['proposal.support', 64, 'bg-yper'],
    ['proposal.oppose', 29, 'bg-kata'],
    ['proposal.abstain', 7, 'bg-apochi'],
  ];
  return (
    <div className="p-4 sm:p-5">
      <div className={`${CARD} p-4`}>
        <div className="flex items-start justify-between gap-3">
          <p className="font-serif text-lg text-ink">{s.question}</p>
          <span data-g="passed" className="shrink-0 rounded-sm border-2 border-yper px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-yper">
            {t('vote.passed')}
          </span>
        </div>
        <div className="mt-3 space-y-2.5">
          {bars.map(([k, pct, color]) => (
            <div key={k}>
              <div className="flex justify-between text-xs text-ink">
                <span>{t(k)}</span>
                <span className="font-mono">{pct}%</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-sunken">
                <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── 8 · and more ── */
function More({ s, t }: ScreenProps) {
  const tiles: { g?: string; icon: typeof Library; label: string; line: string }[] = [
    { g: 'library', icon: Library, label: t('community.tab_library'), line: 'MP3 · MP4 · PDF · Anki' },
    { g: 'media', icon: Mic, label: t('media.studio'), line: `${s.media.podcast} · ${s.media.video}` },
    { g: 'meet', icon: Video, label: t('conference.title'), line: s.meeting },
    { icon: BarChart3, label: t('nav.surveys'), line: s.surveys },
    { icon: Bell, label: t('notification.title'), line: s.push },
    { icon: Smartphone, label: 'Android', line: 'APK' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 sm:p-5">
      {tiles.map((tile) => {
        const Icon = tile.icon;
        return (
          <div key={tile.label} data-g={tile.g} className={`${CARD} p-3`}>
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-kyanos-wash text-kyanos">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <p className="mt-2 text-sm font-semibold text-ink">{tile.label}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-ink-faint">{tile.line}</p>
            {tile.g === 'media' && (
              <p className="mt-2 flex items-center gap-1 text-[11px] text-kyanos">
                <Play className="h-3 w-3" aria-hidden="true" /> <FileText className="h-3 w-3" aria-hidden="true" />
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

const SCREENS: Record<StepId, (p: ScreenProps) => JSX.Element> = {
  join: Join,
  communities: Communities,
  forum: Forum,
  new: NewVote,
  codraft: Codraft,
  vote: Vote,
  result: Result,
  more: More,
};

export default function GuideScreen({ step, phase, samples }: { step: StepId; phase: number; samples: Samples }) {
  const { t } = useTranslation();
  const Screen = SCREENS[step];
  return <Screen phase={phase} s={samples} t={t as T} />;
}
