/**
 * Community List Component
 *
 * Displays a list of communities the user is a member of, with options to:
 * - View community details
 * - Create a new community
 * - Join existing communities
 */

import { useEffect, useState } from 'react';
import { Plus, Clock, Flame } from 'lucide-react';
import { Link } from 'wouter';
import { useTranslation } from '@/hooks/use-translation';

interface Community {
  id: number;
  name: string;
  description?: string;
  type: string;
  governanceModel?: string;
  memberCount?: number;
  democracyScore?: number;
  latestProposal?: { id: number; question: string; status: string; createdAt: string } | null;
  mostPopularProposal?: { id: number; question: string; supporters: number } | null;
}

export function CommunityList() {
  const { t } = useTranslation();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCommunities();
  }, []);

  async function fetchCommunities() {
    try {
      const res = await fetch('/api/communities');
      if (res.ok) {
        const data = await res.json();
        setCommunities(data);
      }
    } catch (error) {
      console.error('Failed to fetch communities:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ink" />
      </div>
    );
  }

  return (
    <section className="py-4 sm:py-8">
      {/* ── Masthead ─────────────────────────────────────────── */}
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5 border-b border-line-strong pb-6">
        <div className="flex min-w-0 items-baseline gap-3">
          <h2 className="font-serif text-3xl leading-tight text-ink sm:text-4xl">
            {t('community.list_title')}
          </h2>
          <span className="font-mono text-sm tabular-nums text-ink-faint">
            {communities.length}
          </span>
        </div>
        <Link
          href="/communities/new"
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-sm bg-ink px-4 text-sm font-medium text-paper transition-colors duration-[120ms] hover:bg-kyanos-deep"
        >
          <Plus className="h-4 w-4" />
          {t('community.create_button')}
        </Link>
      </header>

      {communities.length === 0 ? (
        /* ── Empty register ─────────────────────────────────── */
        <div className="mt-8 rounded border border-line bg-surface px-6 py-16 text-center">
          <p className="mx-auto max-w-md text-sm leading-relaxed text-ink-soft">
            {t('community.empty_message')}
          </p>
          <Link
            href="/communities/new"
            className="mt-6 inline-flex h-9 items-center rounded-sm border border-ink px-4 text-sm font-medium text-ink transition-colors duration-[120ms] hover:bg-sunken"
          >
            {t('community.create_first')}
          </Link>
        </div>
      ) : (
        /* ── The register ───────────────────────────────────── */
        <div className="mt-8 rounded border border-line bg-surface">
          <div className="divide-y divide-line">
            {communities.map((community) => (
              <article
                key={community.id}
                className="relative px-5 py-6 transition-colors duration-[120ms] hover:bg-sunken/50 sm:px-8 sm:py-7"
              >
                <div className="sm:flex sm:items-start sm:justify-between sm:gap-10">
                  {/* Entry: name, chips, description, proposal lines */}
                  <div className="min-w-0 sm:flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
                      <Link
                        href={`/communities/${community.id}`}
                        className="font-serif text-xl leading-snug text-ink transition-colors duration-[120ms] hover:text-kyanos after:absolute after:inset-0 after:content-['']"
                      >
                        {community.name}
                      </Link>
                      <span className="inline-flex items-center rounded-sm border border-line px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                        {community.type === 'managed'
                          ? t('community.type_managed')
                          : t('community.type_autonomous')}
                      </span>
                    </div>

                    {community.description && (
                      <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-soft line-clamp-2">
                        {community.description}
                      </p>
                    )}

                    {(community.latestProposal ||
                      (community.mostPopularProposal &&
                        community.mostPopularProposal.supporters > 0)) && (
                      <div className="mt-4 divide-y divide-line border-t border-line">
                        {community.latestProposal && (
                          <Link
                            href={`/proposals/${community.latestProposal.id}`}
                            className="group relative z-10 flex items-baseline gap-3 py-2"
                          >
                            <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                              <Clock className="h-3.5 w-3.5 self-center" />
                              {t('community.latest_proposal') || 'Πιο πρόσφατη'}
                            </span>
                            <span className="min-w-0 truncate text-sm text-ink transition-colors duration-[120ms] group-hover:text-kyanos">
                              {community.latestProposal.question}
                            </span>
                          </Link>
                        )}

                        {community.mostPopularProposal &&
                          community.mostPopularProposal.supporters > 0 && (
                            <Link
                              href={`/proposals/${community.mostPopularProposal.id}`}
                              className="group relative z-10 flex items-baseline gap-3 py-2"
                            >
                              <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                                <Flame className="h-3.5 w-3.5 self-center" />
                                {t('community.most_popular') || 'Πιο δημοφιλής'} ·{' '}
                                <span className="font-mono tabular-nums">
                                  {community.mostPopularProposal.supporters}
                                </span>{' '}
                                {t('proposal.support') || 'support'}
                              </span>
                              <span className="min-w-0 truncate text-sm text-ink transition-colors duration-[120ms] group-hover:text-kyanos">
                                {community.mostPopularProposal.question}
                              </span>
                            </Link>
                          )}
                      </div>
                    )}
                  </div>

                  {/* Figures: inline strip on mobile, right column from sm up */}
                  <div className="mt-5 flex items-center justify-between gap-6 border-t border-line pt-4 sm:mt-0 sm:shrink-0 sm:flex-col sm:items-end sm:gap-5 sm:border-t-0 sm:pt-1">
                    <div className="flex items-start gap-6 sm:gap-8">
                      <div className="sm:text-right">
                        <div className="font-serif text-2xl leading-none tabular-nums text-ink">
                          {community.memberCount || 0}
                        </div>
                        <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                          {t('community.members')}
                        </div>
                      </div>
                      {community.democracyScore && (
                        <div className="sm:text-right">
                          <div className="font-serif text-2xl leading-none tabular-nums text-ink">
                            {community.democracyScore}
                          </div>
                          <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                            {t('community.score')}
                          </div>
                        </div>
                      )}
                    </div>

                    <Link
                      href={`/communities/${community.id}`}
                      className="relative z-10 inline-flex h-8 shrink-0 items-center rounded-sm border border-ink px-3 text-xs font-medium text-ink transition-colors duration-[120ms] hover:bg-sunken"
                    >
                      {t('community.view')}
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
