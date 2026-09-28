/**
 * Public Landing Page (/)
 *
 * The unauthenticated front door, told as a guided tour in the look of the
 * promo film: the platform's members gather into the hemicycle, one dot
 * each; the noise of comment sections settles into discussion, vote and
 * decision; the four kinds of vote, each a ballot the visitor can cast; a
 * community's tools (forum, library, podcasts and video, meetings, polls);
 * one proposal's life as a scroll-scrubbed film; rules the members own; and
 * the sealed ballot box, which the visitor can try to cheat. It closes on
 * real votes and the way in. Authenticated visitors go to /feed.
 *
 * The page is designed in two looks: navy (the promo film's ceremony
 * palette) and spray (the youth theme). A visitor on spray gets the spray
 * tour; any other theme shows the whole page, header included, in navy for
 * as long as the visitor stays here, without changing their choice.
 */

import { useEffect, useRef } from 'react';
import { useLocation, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { EntityCard } from '@/components/cards/entity-card';
import StatusBadge from '@/components/proposal/StatusBadge';
import { useAuth } from '@/hooks/use-auth';
import { previewTheme, useTheme } from '@/hooks/use-theme';
import { useTranslation } from '@/hooks/use-translation';
import { proposalEyebrow } from '@/lib/proposal-kind';
import { landingThemeOf } from '@shared/theme';
import logoImage from '@/assets/logo.png';
import HeroAssembly from '@/components/landing/HeroAssembly';
import NoiseToOrder from '@/components/landing/NoiseToOrder';
import VoteKindsDemo from '@/components/landing/VoteKindsDemo';
import CommunityTools from '@/components/landing/CommunityTools';
import ProcessFilm from '@/components/landing/ProcessFilm';
import SealedChainDemo from '@/components/landing/SealedChainDemo';
import RulesDemo from '@/components/landing/RulesDemo';
import { TOUR_COPY } from '@/components/landing/copy';
import { headerHeight, useScrollFrame } from '@/components/landing/scroll';
import '@/components/landing/tour.css';

interface LiveProposal {
  id: number;
  question: string;
  solution: string;
  status: string;
  kind?: string;
  createdAt: string;
  communityId: number;
  communityName?: string;
  thumbnailKey?: string | null;
}

interface Overview {
  totalUsers: number;
  totalCommunities: number;
  totalProposals: number;
  decidedProposals: number;
}

const CHAPTER_IDS = ['t-hero', 't-noise', 't-kinds', 't-tools', 't-film', 't-rules', 't-chain', 't-live'];

/** A block that fades in the first time it scrolls into view. */
function Reveal({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`tour-reveal ${className}`}>{children}</div>;
}

export default function LandingPage() {
  const { user } = useAuth();
  const { t, locale } = useTranslation();
  const [, navigate] = useLocation();
  const lang = locale === 'en' ? 'en' : 'el';
  const copy = TOUR_COPY[lang];
  const rootRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const skin = landingThemeOf(theme);

  useEffect(() => {
    if (user) navigate('/feed');
  }, [user, navigate]);

  // Paint the page in its look while the visitor is here; leaving restores
  // the theme they chose.
  useEffect(() => {
    if (theme === skin) return;
    previewTheme(skin);
    return () => previewTheme(null);
  }, [theme, skin]);

  // The newest public proposals for the closing chapter. The list endpoint
  // is public; a failure just hides the strip.
  const { data: proposals } = useQuery<LiveProposal[]>({
    queryKey: ['/api/proposals'],
    enabled: !user,
    staleTime: 60_000,
  });
  const live = (proposals ?? [])
    .filter((p) => p.status !== 'archived')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 4);

  // Platform-wide counts for the opening; also public. Missing counts hide.
  const { data: overview } = useQuery<Overview>({
    queryKey: ['/api/analytics/overview'],
    enabled: !user,
    staleTime: 5 * 60_000,
  });
  const fmt = (n: number) => n.toLocaleString(lang === 'el' ? 'el-GR' : 'en-GB');
  const stats = overview
    ? ([
        [overview.totalUsers, copy.stats[0]],
        [overview.totalCommunities, copy.stats[1]],
        [overview.totalProposals, copy.stats[2]],
        [overview.decidedProposals, copy.stats[3]],
      ] as [number, string][])
        .filter(([value]) => value > 0)
        .map(([value, label]) => ({ value: fmt(value), label }))
    : undefined;

  // Blocks marked .tour-reveal fade in the first time they scroll into view.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add('in')),
      { threshold: 0.12 },
    );
    root.querySelectorAll('.tour-reveal').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [user]);

  // Progress rail, the active chapter mark, and the header's height (pinned
  // scenes sit just below it).
  useScrollFrame(() => {
    const root = rootRef.current;
    if (!root) return;
    root.style.setProperty('--hdr', `${headerHeight()}px`);
    const doc = document.documentElement.scrollHeight - window.innerHeight;
    root.style.setProperty('--p', String(doc > 0 ? window.scrollY / doc : 0));
    let current = CHAPTER_IDS[0];
    for (const id of CHAPTER_IDS) {
      const el = document.getElementById(id);
      if (el && el.getBoundingClientRect().top < window.innerHeight * 0.45) current = id;
    }
    root.querySelectorAll<HTMLAnchorElement>('.tour-chapters a').forEach((a) => a.classList.toggle('on', a.dataset.ch === current));
  });

  if (user) return null;

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main ref={rootRef} className="tour flex-grow" data-skin={skin} data-testid="landing-tour">
        <div className="tour-progress" aria-hidden="true"><span /></div>
        <nav className="tour-chapters" aria-label={lang === 'el' ? 'Ενότητες περιήγησης' : 'Tour chapters'}>
          {CHAPTER_IDS.map((id, i) => (
            <a key={id} href={`#${id}`} data-ch={id} aria-label={copy.chapters[i]}>
              <span>{copy.chapters[i]}</span>
            </a>
          ))}
        </nav>

        <HeroAssembly
          copy={copy.hero}
          stats={stats}
          members={overview?.totalUsers}
          skin={skin}
          onRegister={() => navigate('/auth?tab=register')}
          onSignIn={() => navigate('/auth')}
        />
        <NoiseToOrder copy={copy.noise} />
        <VoteKindsDemo copy={copy.kinds} auto={copy.auto} />
        <CommunityTools copy={copy.tools} />
        <ProcessFilm copy={copy.film} />
        <RulesDemo copy={copy.rules} auto={copy.auto} />
        <SealedChainDemo copy={copy.chain} auto={copy.auto} />

        {/* ————— Today: real votes from the public communities ————— */}
        <section className="tour-live tour-paper" id="t-live" aria-labelledby="t-live-title" data-testid="landing-live">
          <div className="tour-wrap">
            <Reveal className="tour-live-head">
              <div>
                <p className="tour-eyebrow"><span />{copy.live.eyebrow}</p>
                <h2 id="t-live-title">
                  {copy.live.title} <em>{copy.live.titleEm}</em>
                </h2>
                <p className="tour-lede">{copy.live.lede}</p>
              </div>
              <Link href="/proposals" className="tour-more">
                {copy.live.more} ›
              </Link>
            </Reveal>
            {live.length > 0 && (
              <div className="tour-live-grid">
                {live.map((proposal) => (
                  <EntityCard
                    key={proposal.id}
                    subject="proposal"
                    kindLabel={proposalEyebrow(t, proposal.kind)}
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
            )}
          </div>
        </section>

        {/* ————— The way in ————— */}
        <section className="tour-end tour-night" aria-labelledby="t-end-title">
          <div className="tour-wrap">
            <Reveal>
              <img src={logoImage} alt="" width={76} height={76} className="tour-end-mark" />
              <h2 id="t-end-title">
                {copy.end.title}
                <br />
                <em>{copy.end.titleEm}</em>
              </h2>
              <p className="tour-lede">{copy.end.lede}</p>
              <div className="tour-actions">
                <button type="button" className="tour-btn" onClick={() => navigate('/auth?tab=register')} data-testid="landing-cta-register">
                  {copy.end.register}
                </button>
                <Link href="/proposals" className="tour-btn ghost" data-testid="landing-cta-browse">
                  {copy.end.browse}
                </Link>
              </div>
              <p className="tour-end-links">
                <Link href="/walkthrough">{copy.end.story} ↗</Link>
                <Link href="/how-it-works">{copy.end.how} ↗</Link>
                <a href="https://github.com/miltosdoc/agorax-platform" target="_blank" rel="noreferrer">{copy.end.source} ↗</a>
              </p>
              <p className="tour-fine">{copy.end.fine}</p>
            </Reveal>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
