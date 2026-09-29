/**
 * The user guide (/walkthrough): AgoraX in eight steps, from signing up to
 * the first decision.
 *
 * It replaces a one-story walkthrough that had drifted from the product
 * (it still spoke of «διαβούλευση» and an AI gate on every proposal). The
 * page is a player that runs the steps like a short video on a mock app
 * window drawn with the app's own labels and theme, then the same steps in
 * writing for anyone who prefers to read, each with a link to where it
 * happens. Content lives in components/guide/guide-copy.ts, in both
 * languages.
 */
import { useEffect } from 'react';
import { Link } from 'wouter';
import { ArrowRight, Clock } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import GuidePlayer from '@/components/guide/GuidePlayer';
import { GUIDE_COPY } from '@/components/guide/guide-copy';
import { useAuth } from '@/hooks/use-auth';
import { useTranslation } from '@/hooks/use-translation';

export default function DeliberationWalkthrough() {
  const { t, locale } = useTranslation();
  const { user } = useAuth();
  const copy = GUIDE_COPY[locale === 'en' ? 'en' : 'el'];

  useEffect(() => {
    document.title = `${t('brand.name')} — ${copy.eyebrow}`;
  }, [copy.eyebrow, t]);

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl pb-10">
        <header className="max-w-3xl pb-8 pt-4 sm:pt-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-kyanos">{copy.eyebrow}</p>
          <h1 className="mt-3 font-serif text-4xl text-ink sm:text-5xl">{copy.title}</h1>
          <p className="mt-4 text-base leading-relaxed text-ink-soft sm:text-lg">{copy.lede}</p>
          <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-ink-faint">
            <Clock className="h-4 w-4" aria-hidden="true" /> {copy.length}
          </p>
        </header>

        <GuidePlayer copy={copy} />

        {/* ── the same steps, in writing ── */}
        <section aria-labelledby="guide-written" className="mt-16">
          <h2 id="guide-written" className="font-serif text-2xl text-ink sm:text-3xl">
            {copy.writtenTitle}
          </h2>
          <ol className="mt-6 grid gap-4 md:grid-cols-2">
            {copy.steps.map((step, i) => (
              <li key={step.id} id={`step-${step.id}`} className="flex gap-4 rounded-sm border border-line bg-surface p-5">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-kyanos-wash font-serif text-lg text-kyanos">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="font-serif text-xl text-ink">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{step.text}</p>
                  <Link href={step.link.href} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-kyanos hover:text-kyanos-deep">
                    {step.link.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* ── the way in ── */}
        <section className="mt-14 rounded-sm border border-line bg-sunken p-6 text-center sm:p-8">
          <h2 className="font-serif text-2xl text-ink sm:text-3xl">{copy.ctaTitle}</h2>
          <p className="mx-auto mt-2 max-w-xl text-ink-soft">{copy.ctaText}</p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            {!user && (
              <Link
                href="/auth?tab=register"
                className="inline-flex items-center justify-center gap-2 rounded-sm bg-ink px-5 py-2.5 text-sm font-medium text-paper hover:bg-kyanos-deep"
              >
                {copy.register} <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
            <Link href="/faq" className="inline-flex items-center justify-center rounded-sm border border-ink px-5 py-2.5 text-sm font-medium text-ink hover:bg-surface">
              {copy.faq}
            </Link>
            <Link href="/proposals" className="inline-flex items-center justify-center rounded-sm border border-line-strong px-5 py-2.5 text-sm font-medium text-ink hover:bg-surface">
              {copy.votes}
            </Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
