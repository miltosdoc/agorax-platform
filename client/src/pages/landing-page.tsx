/**
 * Public Landing Page (/)
 *
 * The unauthenticated front door, composed as an editorial civic front page:
 * a left-aligned serif hero with the hemicycle mark (parliament as data),
 * a "live now" strip of the newest open proposals, the four-step process
 * set as a numbered sequence, and a quiet CTA band. Authenticated visitors
 * get redirected to /feed.
 *
 * The page wears the member's theme. The four logo themes leave it as the
 * quiet editorial page above; the four sketch-born themes (shared/theme.ts)
 * each add the flourishes they were designed with — Marble's bronze dash,
 * Parliament's gold glow, Spray's blobs and highlighted line, Poster's
 * stripes and coral disc — through SKINS below. Structure and copy never
 * change between skins; only the dressing does.
 */

import { useEffect } from 'react';
import { useLocation, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import AppShell from '@/components/layout/AppShell';
import { EntityCard } from '@/components/cards/entity-card';
import StatusBadge from '@/components/proposal/StatusBadge';
import {
  ArrowRight,
  CheckCircle,
  Lightbulb,
  MessageSquare,
  Users,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { useTranslation } from '@/hooks/use-translation';
import type { AccentTheme } from '@shared/theme';

/**
 * The platform's signature mark: a hemicycle of ~90 seats in concentric
 * semicircular arcs. Most seats are muted; the leading arc segment is set
 * in kyanos. Pure geometry — computed once at module load, never animated.
 */
interface HemicycleSeat {
  x: number;
  y: number;
  lead: boolean;
}

function buildHemicycle(): HemicycleSeat[] {
  const rows = [
    { radius: 62, seats: 10 },
    { radius: 86, seats: 14 },
    { radius: 110, seats: 18 },
    { radius: 134, seats: 22 },
    { radius: 158, seats: 26 },
  ];
  const centerX = 170;
  const centerY = 168;
  const result: HemicycleSeat[] = [];
  for (const row of rows) {
    for (let i = 0; i < row.seats; i += 1) {
      const fraction = i / (row.seats - 1);
      const angle = Math.PI - fraction * Math.PI;
      result.push({
        x: Math.round((centerX + row.radius * Math.cos(angle)) * 10) / 10,
        y: Math.round((centerY - row.radius * Math.sin(angle)) * 10) / 10,
        lead: fraction < 0.26,
      });
    }
  }
  return result;
}

const HEMICYCLE_SEATS = buildHemicycle();

interface LiveProposal {
  id: number;
  question: string;
  solution: string;
  status: string;
  createdAt: string;
  communityId: number;
  communityName?: string;
  thumbnailKey?: string | null;
}

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-sm px-6 py-3 text-sm font-medium transition-colors duration-[120ms]';

type Skin = 'plain' | 'marble' | 'parliament' | 'spray' | 'poster';

function skinOf(theme: AccentTheme): Skin {
  return theme === 'marble' || theme === 'parliament' || theme === 'spray' || theme === 'poster'
    ? theme
    : 'plain';
}

/**
 * Everything a skin may vary. Missing keys fall back to `plain`, so a
 * skin only states what it changes.
 */
interface SkinSpec {
  primary: string;
  secondary: string;
  eyebrow: string;
  /** The em dash between the two halves of the headline. */
  dash: string;
  /** The second half of the headline. */
  headlineTail: string;
  /** Hemicycle seat fills. */
  seatLead: string;
  seatRest: string;
  /** Wrapper around each "live now" card; targets the card's article. */
  card: string;
}

const PLAIN: SkinSpec = {
  primary: `${BUTTON_BASE} bg-ink text-paper hover:bg-kyanos-deep`,
  secondary: `${BUTTON_BASE} border border-ink text-ink hover:bg-sunken`,
  eyebrow: 'text-xs uppercase tracking-[0.14em] font-semibold text-ink-faint',
  dash: '',
  headlineTail: '',
  seatLead: 'var(--kyanos)',
  seatRest: 'var(--line-strong)',
  card: '',
};

const SKINS: Record<Skin, SkinSpec> = {
  plain: PLAIN,
  marble: {
    ...PLAIN,
    eyebrow: 'text-xs uppercase tracking-[0.18em] font-semibold text-kyanos',
    dash: 'text-kyanos',
    card: '[&>article]:outline [&>article]:outline-1 [&>article]:outline-line [&>article]:outline-offset-[3px]',
  },
  parliament: {
    ...PLAIN,
    primary: `${BUTTON_BASE} bg-kyanos text-accent-foreground font-semibold hover:bg-kyanos-deep`,
    secondary: `${BUTTON_BASE} border border-line-strong text-ink hover:bg-sunken`,
    eyebrow: 'text-xs uppercase tracking-[0.18em] font-semibold text-kyanos',
    headlineTail: 'text-kyanos',
    seatRest: '#35506C',
    card: '[&>article]:shadow-[0_12px_32px_rgba(0,0,0,0.28)]',
  },
  spray: {
    ...PLAIN,
    primary: `${BUTTON_BASE} border-2 border-ink bg-kyanos font-bold uppercase tracking-[0.04em] text-accent-foreground shadow-[5px_5px_0_var(--accent-2)] hover:bg-kyanos-deep`,
    secondary: `${BUTTON_BASE} border-2 border-ink font-bold uppercase tracking-[0.04em] text-ink hover:bg-sunken`,
    eyebrow: 'inline-block -rotate-2 font-serif text-lg uppercase tracking-[0.06em] text-accent2',
    headlineTail: 'inline-block -rotate-1 bg-kyanos px-2 text-accent-foreground',
    seatRest: '#4A4A4A',
    card: '[&>article]:border-2 [&>article]:border-ink [&>article]:shadow-[6px_6px_0_var(--kyanos)]',
  },
  poster: {
    ...PLAIN,
    primary: `${BUTTON_BASE} rounded-full border-2 border-ink bg-kyanos font-bold text-accent-foreground shadow-[4px_4px_0_var(--ink)] hover:bg-kyanos-deep`,
    secondary: `${BUTTON_BASE} rounded-full border-2 border-ink bg-surface font-bold text-ink hover:bg-sunken`,
    eyebrow: 'font-mono text-[13px] uppercase tracking-[0.16em] text-kyanos',
    headlineTail: 'text-kyanos',
    seatLead: 'var(--paper)',
    seatRest: 'var(--ink)',
    card: '[&>article]:border-2 [&>article]:border-ink [&>article]:shadow-[5px_5px_0_var(--kyanos)]',
  },
};

/** Background dressing behind the hero; purely decorative. */
function HeroBackdrop({ skin }: { skin: Skin }) {
  if (skin === 'parliament') {
    return (
      <div
        className="pointer-events-none absolute -inset-x-40 -top-24 -z-10 h-[560px]"
        style={{ background: 'radial-gradient(900px 420px at 80% 30%, rgba(208,171,79,0.12), transparent 70%)' }}
        aria-hidden="true"
      />
    );
  }
  if (skin === 'spray') {
    return (
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-visible" aria-hidden="true">
        <div className="absolute left-[46%] top-[6%] h-[420px] w-[520px] rounded-full blur-3xl" style={{ background: 'radial-gradient(circle, rgba(198,255,0,0.34), transparent 62%)' }} />
        <div className="absolute -right-10 -top-16 h-[360px] w-[360px] rounded-full blur-3xl" style={{ background: 'radial-gradient(circle, rgba(255,62,165,0.36), transparent 62%)' }} />
        <div className="absolute -left-24 bottom-0 h-[300px] w-[360px] rounded-full blur-3xl" style={{ background: 'radial-gradient(circle, rgba(255,62,165,0.18), transparent 62%)' }} />
      </div>
    );
  }
  if (skin === 'poster') {
    return (
      <div className="pointer-events-none absolute inset-0 -z-10 hidden lg:block" aria-hidden="true">
        <div className="absolute right-0 top-0 h-[520px] w-[380px] opacity-[0.16]" style={{ background: 'repeating-linear-gradient(-45deg, var(--kyanos) 0 14px, transparent 14px 34px)' }} />
        <div className="absolute right-[6%] top-[8%] h-[420px] w-[420px] rounded-full bg-accent2 opacity-90" />
      </div>
    );
  }
  return null;
}

/** The rotated "shape the future" stamp the two youth skins carry. */
function Stamp({ skin, label }: { skin: Skin; label: string }) {
  if (skin === 'spray') {
    return (
      <div className="pointer-events-none absolute bottom-2 right-[4%] hidden -rotate-12 rounded-md border-[3px] border-accent2 px-3.5 py-1.5 font-serif text-xl uppercase tracking-[0.04em] text-accent2 lg:block" aria-hidden="true">
        {label}
      </div>
    );
  }
  if (skin === 'poster') {
    return (
      <div className="pointer-events-none absolute bottom-4 right-[5%] hidden rotate-[8deg] rounded-full border-[3px] border-accent2 bg-paper px-4 py-2 font-serif text-base uppercase tracking-[0.06em] text-accent2 lg:block" aria-hidden="true">
        {label}
      </div>
    );
  }
  return null;
}

export default function LandingPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const { theme } = useTheme();
  const skin = skinOf(theme);
  const S = SKINS[skin];

  useEffect(() => {
    if (user) {
      navigate('/feed');
    }
  }, [user, navigate]);

  // The two newest proposals still open to the public, for the "live now"
  // strip. The list endpoint is public; a failure just hides the strip.
  const { data: proposals } = useQuery<LiveProposal[]>({
    queryKey: ['/api/proposals'],
    enabled: !user,
    staleTime: 60_000,
  });
  const live = (proposals ?? [])
    .filter((p) => p.status !== 'archived')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 2);

  if (user) return null;

  const title = t('landing.heroTitle');
  const dashAt = title.indexOf(' — ');
  const headlineHead = dashAt >= 0 ? title.slice(0, dashAt) : title;
  const headlineTail = dashAt >= 0 ? title.slice(dashAt + 3) : '';

  const steps = [
    {
      icon: MessageSquare,
      title: t('landing.feature1Title'),
      description: t('landing.feature1Desc'),
    },
    {
      icon: Users,
      title: t('landing.feature2Title'),
      description: t('landing.feature2Desc'),
    },
    {
      icon: Lightbulb,
      title: t('landing.feature3Title'),
      description: t('landing.feature3Desc'),
    },
    {
      icon: CheckCircle,
      title: t('landing.feature4Title'),
      description: t('landing.feature4Desc'),
    },
  ];

  return (
    <AppShell>
      {/* ————— Hero: statement left, hemicycle right ————— */}
      <section className="relative isolate py-10 sm:py-16 lg:py-20" data-skin={skin}>
        <HeroBackdrop skin={skin} />
        <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-7">
            <p className={S.eyebrow}>
              {t('app.title')}
            </p>
            <h1
              className="mt-5 max-w-[20ch] text-balance font-serif text-4xl font-normal leading-[1.05] text-ink sm:text-5xl lg:text-6xl"
              data-testid="landing-hero-title"
            >
              {headlineHead}
              {headlineTail && (
                <>
                  {' '}
                  <span className={S.dash}>—</span>{' '}
                  <span className={S.headlineTail}>{headlineTail}</span>
                </>
              )}
            </h1>
            <p className="mt-6 max-w-[55ch] text-lg leading-relaxed text-ink-soft sm:text-xl">
              {t('landing.heroSubtitle')}
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                className={S.primary}
                onClick={() => navigate('/auth?tab=register')}
                data-testid="landing-get-started"
              >
                {t('landing.getStarted')}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                className={S.secondary}
                onClick={() => navigate('/auth')}
                data-testid="landing-sign-in"
              >
                {t('landing.signIn')}
              </button>
            </div>
          </div>
          <div className="relative hidden lg:col-span-5 lg:block" aria-hidden="true">
            <svg
              viewBox="0 0 340 178"
              className="relative ml-auto w-full max-w-[26rem]"
              xmlns="http://www.w3.org/2000/svg"
            >
              <line
                x1="12"
                y1="168"
                x2="328"
                y2="168"
                stroke={skin === 'poster' ? 'transparent' : 'var(--line)'}
                strokeWidth="1"
              />
              {HEMICYCLE_SEATS.map((seat, index) => (
                <circle
                  key={index}
                  cx={seat.x}
                  cy={seat.y}
                  r={4.5}
                  fill={seat.lead ? S.seatLead : S.seatRest}
                />
              ))}
            </svg>
          </div>
        </div>
        <Stamp skin={skin} label={t('landing.stamp')} />
      </section>

      {/* ————— Live now: the newest open proposals ————— */}
      {live.length > 0 && (
        <>
          <div className="-mx-4 border-t border-line" aria-hidden="true" />
          <section className="py-8 sm:py-10" data-testid="landing-live">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="font-serif text-2xl font-normal text-ink sm:text-3xl">
                {t('landing.liveNow')}
              </h2>
              <Link href="/proposals" className="text-sm font-medium text-kyanos hover:text-kyanos-deep">
                {t('landing.liveNowMore')} ›
              </Link>
            </div>
            <div className={`grid grid-cols-1 gap-5 lg:grid-cols-2 ${S.card}`}>
              {live.map((proposal) => (
                <EntityCard
                  key={proposal.id}
                  subject="proposal"
                  kindLabel={t('nav.proposals')}
                  id={proposal.id}
                  title={proposal.question}
                  excerpt={proposal.solution}
                  href={`/proposals/${proposal.id}`}
                  ctaLabel={t('rail.learnMore')}
                  tag={proposal.communityName ?? null}
                  tagHref={`/communities/${proposal.communityId}`}
                  badge={<StatusBadge status={proposal.status} />}
                  thumbnailKey={proposal.thumbnailKey}
                  meta={
                    <time dateTime={proposal.createdAt} className="font-mono text-xs tabular-nums text-ink-faint">
                      {new Date(proposal.createdAt).toLocaleDateString()}
                    </time>
                  }
                />
              ))}
            </div>
          </section>
        </>
      )}

      {/* ————— The process, as a numbered sequence ————— */}
      <div className="-mx-4 border-t border-line" aria-hidden="true" />
      <section className="py-12 sm:py-16">
        <h2 className="font-serif text-2xl font-normal text-ink sm:text-3xl">
          {t('landing.featuresTitle')}
        </h2>
        <ol className="mt-10 grid gap-y-10 border-l border-line pl-6 lg:grid-cols-4 lg:gap-x-8 lg:border-l-0 lg:pl-0">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <li
                key={step.title}
                className="lg:border-t lg:border-line lg:pt-6"
              >
                <div className="flex items-center justify-between">
                  <span
                    className="font-serif text-3xl leading-none text-line-strong tabular-nums"
                    aria-hidden="true"
                  >
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <Icon className="h-4 w-4 text-ink-faint" aria-hidden="true" />
                </div>
                <h3 className="mt-4 font-serif text-xl font-normal text-ink">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  {step.description}
                </p>
              </li>
            );
          })}
        </ol>
      </section>

      {/* ————— Quiet CTA band ————— */}
      <div className="-mx-4 border-t border-line" aria-hidden="true" />
      <section className="py-12 sm:py-16">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="max-w-[24ch] text-balance font-serif text-3xl font-normal leading-tight text-ink sm:text-4xl">
              {t('home.readyTitle')}
            </h2>
            <p className="mt-4 max-w-[55ch] text-base text-ink-soft sm:text-lg">
              {t('home.readyDesc')}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:shrink-0">
            <button
              type="button"
              className={S.primary}
              onClick={() => navigate('/auth?tab=register')}
              data-testid="landing-cta-register"
            >
              {t('auth.register')}
            </button>
            <Link
              href="/proposals"
              className={S.secondary}
              data-testid="landing-cta-browse"
            >
              {t('dashboard.viewAllProposals')}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
