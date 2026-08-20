/**
 * Public Landing Page (/)
 *
 * The unauthenticated front door, composed as an editorial civic front page:
 * a left-aligned serif hero with the hemicycle mark (parliament as data),
 * the four-step process set as a numbered sequence, and a quiet CTA band.
 * Authenticated visitors get redirected to /feed.
 */

import { useEffect } from 'react';
import { useLocation, Link } from 'wouter';
import AppShell from '@/components/layout/AppShell';
import {
  ArrowRight,
  CheckCircle,
  Lightbulb,
  MessageSquare,
  Users,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useTranslation } from '@/hooks/use-translation';

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

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-sm px-6 py-3 text-sm font-medium transition-colors duration-[120ms]';
const BUTTON_PRIMARY = `${BUTTON_BASE} bg-ink text-paper hover:bg-kyanos-deep`;
const BUTTON_SECONDARY = `${BUTTON_BASE} border border-ink text-ink hover:bg-sunken`;

export default function LandingPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (user) {
      navigate('/feed');
    }
  }, [user, navigate]);

  if (user) return null;

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
      <section className="py-10 sm:py-16 lg:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-7">
            <p className="text-xs uppercase tracking-[0.14em] font-semibold text-ink-faint">
              {t('app.title')}
            </p>
            <h1
              className="mt-5 max-w-[20ch] text-balance font-serif text-4xl font-normal leading-[1.05] text-ink sm:text-5xl lg:text-6xl"
              data-testid="landing-hero-title"
            >
              {t('landing.heroTitle')}
            </h1>
            <p className="mt-6 max-w-[55ch] text-lg leading-relaxed text-ink-soft sm:text-xl">
              {t('landing.heroSubtitle')}
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                className={BUTTON_PRIMARY}
                onClick={() => navigate('/auth?tab=register')}
                data-testid="landing-get-started"
              >
                {t('landing.getStarted')}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                className={BUTTON_SECONDARY}
                onClick={() => navigate('/auth')}
                data-testid="landing-sign-in"
              >
                {t('landing.signIn')}
              </button>
            </div>
          </div>
          <div className="hidden lg:col-span-5 lg:block" aria-hidden="true">
            <svg
              viewBox="0 0 340 178"
              className="ml-auto w-full max-w-[26rem]"
              xmlns="http://www.w3.org/2000/svg"
            >
              <line
                x1="12"
                y1="168"
                x2="328"
                y2="168"
                stroke="var(--line)"
                strokeWidth="1"
              />
              {HEMICYCLE_SEATS.map((seat, index) => (
                <circle
                  key={index}
                  cx={seat.x}
                  cy={seat.y}
                  r={4.5}
                  fill={seat.lead ? 'var(--kyanos)' : 'var(--line-strong)'}
                />
              ))}
            </svg>
          </div>
        </div>
      </section>

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
              className={BUTTON_PRIMARY}
              onClick={() => navigate('/auth?tab=register')}
              data-testid="landing-cta-register"
            >
              {t('auth.register')}
            </button>
            <Link
              href="/proposals"
              className={BUTTON_SECONDARY}
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
