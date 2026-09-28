/**
 * Votes Index Page (/proposals) — «Ψηφοφορίες»
 *
 * Every vote across the viewer's communities, filtered by what matters to a
 * member and in any combination:
 *
 *   Τύπος      — decision, statute, election, community poll
 *   Στάδιο     — in co-drafting, in voting, completed (derived from the
 *                lifecycle, so it moves on by itself)
 *   Κοινότητα  — which community it belongs to
 *   Κατηγορία  — the subject it concerns
 *
 * e.g. elections + in voting + one community. The filters live in the URL,
 * so a filtered view can be shared as a link. The viewer's own drafts are
 * not part of the register — they are listed apart, above it.
 *
 * Filtering and sorting are client-side (the API only exposes a `limit`
 * parameter today); pagination is a "load more" cursor over the list.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import AppShell from '@/components/layout/AppShell';
import { DiscoveryRail } from '@/components/rails/discovery-rail';
import { EntityCard } from '@/components/cards/entity-card';
import { CARD_STACK } from '@/components/rails/rail-section';
import { AgoraFeedRail } from '@/components/rails/agora-feed-rail';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FileText, Pencil, Plus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { useTranslation } from '@/hooks/use-translation';
import { useAuth } from '@/hooks/use-auth';
import StatusBadge from '@/components/proposal/StatusBadge';
import { EmptyState, LoadingState } from '@/components/ui/empty-state';
import { publicHandle } from '@shared/user-identity';
import { proposalEyebrow } from '@/lib/proposal-kind';
import { PROPOSAL_KINDS, PROPOSAL_STAGES, proposalKindOf, proposalStageOf } from '@shared/proposal-kinds';

type SortOption = 'created_desc' | 'created_asc' | 'score_desc' | 'score_asc';

interface Proposal {
  id: number;
  question: string;
  solution: string;
  status: string;
  kind?: string;
  authorId: number;
  authorName?: string | null;
  authorUsername?: string | null;
  communityId: number;
  communityName?: string;
  createdAt: string;
  llmScore?: string | number | null;
  category?: string | null;
}

interface Community {
  id: number;
  name: string;
}

const PAGE_SIZE = 12;
const ALL = '__all__';
const CATEGORIES = ['education', 'healthcare', 'infrastructure', 'environment', 'economy', 'governance', 'other'] as const;

/* Toolbar vocabulary: tracked eyebrow labels, flat token-bound controls. */
const FIELD_LABEL = 'text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint';
const FIELD_CONTROL = 'h-9 rounded border-line bg-surface text-sm text-ink';

function parseScore(value: Proposal['llmScore']): number | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

/** The filters as they stand in the address bar. */
function readFilters() {
  const q = new URLSearchParams(window.location.search);
  return {
    type: q.get('type') ?? ALL,
    stage: q.get('stage') ?? ALL,
    community: q.get('community') ?? ALL,
    category: q.get('category') ?? ALL,
  };
}

export default function ProposalsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageLimit, setPageLimit] = useState(PAGE_SIZE);

  const initial = useMemo(readFilters, []);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>(initial.type);
  const [stageFilter, setStageFilter] = useState<string>(initial.stage);
  const [communityFilter, setCommunityFilter] = useState<string>(initial.community);
  const [categoryFilter, setCategoryFilter] = useState<string>(initial.category);
  const [sort, setSort] = useState<SortOption>('created_desc');

  useEffect(() => {
    Promise.all([
      api.get<Proposal[]>('/api/proposals').catch(() => ({ data: [] as Proposal[] })),
      api.get<Community[]>('/api/communities').catch(() => ({ data: [] as Community[] })),
    ]).then(([propResp, commResp]) => {
      setProposals(propResp.data ?? []);
      setCommunities(commResp.data ?? []);
      setLoading(false);
    });
  }, []);

  // Keep the address bar in step, without adding a history entry per click.
  useEffect(() => {
    const q = new URLSearchParams();
    if (typeFilter !== ALL) q.set('type', typeFilter);
    if (stageFilter !== ALL) q.set('stage', stageFilter);
    if (communityFilter !== ALL) q.set('community', communityFilter);
    if (categoryFilter !== ALL) q.set('category', categoryFilter);
    const qs = q.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
  }, [typeFilter, stageFilter, communityFilter, categoryFilter]);

  const communityName = useMemo(() => {
    const byId = new Map<number, string>();
    for (const c of communities) byId.set(c.id, c.name);
    return (id: number, fallback?: string) => byId.get(id) ?? fallback ?? `#${id}`;
  }, [communities]);

  // The viewer's drafts are theirs alone and not part of the register.
  const myDrafts = useMemo(
    () => proposals.filter((p) => p.status === 'draft' && user && p.authorId === user.id),
    [proposals, user],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();

    const matches = proposals.filter((p) => {
      const stage = proposalStageOf(p.status);
      if (stage === 'draft') return false;
      if (typeFilter !== ALL && proposalKindOf(p.kind) !== typeFilter) return false;
      if (stageFilter !== ALL && stage !== stageFilter) return false;
      if (communityFilter !== ALL && String(p.communityId) !== communityFilter) return false;
      if (categoryFilter !== ALL && p.category !== categoryFilter) return false;
      if (term) {
        const hay = `${p.question ?? ''} ${p.solution ?? ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });

    const sorter: Record<SortOption, (a: Proposal, b: Proposal) => number> = {
      created_desc: (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      created_asc: (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      score_desc: (a, b) => (parseScore(b.llmScore) ?? -Infinity) - (parseScore(a.llmScore) ?? -Infinity),
      score_asc: (a, b) => (parseScore(a.llmScore) ?? Infinity) - (parseScore(b.llmScore) ?? Infinity),
    };
    matches.sort(sorter[sort]);
    return matches;
  }, [proposals, search, typeFilter, stageFilter, communityFilter, categoryFilter, sort]);

  // Reset pagination whenever filters change.
  useEffect(() => {
    setPageLimit(PAGE_SIZE);
  }, [search, typeFilter, stageFilter, communityFilter, categoryFilter, sort]);

  const visible = filtered.slice(0, pageLimit);
  const hasMore = filtered.length > visible.length;

  const clearFilters = () => {
    setSearch('');
    setTypeFilter(ALL);
    setStageFilter(ALL);
    setCommunityFilter(ALL);
    setCategoryFilter(ALL);
    setSort('created_desc');
  };

  const filterSelect = (
    testId: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
    allLabel: string,
    options: Array<{ value: string; label: string }>,
  ) => (
    <div className="space-y-1.5">
      <Label className={FIELD_LABEL}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger data-testid={testId} className={FIELD_CONTROL}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <AppShell
      leftRail={<DiscoveryRail />}
      rightRail={<AgoraFeedRail />}
      title={t('proposals.title')}
      breadcrumb={[{ label: t('nav.home'), href: '/' }, { label: t('proposals.title') }]}
      actions={
        <button
          type="button"
          onClick={() => navigate('/proposals/new')}
          data-testid="proposals-new-button"
          className="inline-flex items-center gap-2 rounded bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors duration-[120ms] hover:bg-kyanos-deep"
        >
          {t('home.submitProposal')}
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      }
    >
      {/* ── The viewer's own drafts, apart from the register ── */}
      {myDrafts.length > 0 && (
        <section className="mb-8 rounded border border-dashed border-line bg-surface p-4" data-testid="proposals-my-drafts">
          <h2 className={`${FIELD_LABEL} mb-3`}>{t('proposals.myDrafts')}</h2>
          <ul className="space-y-2">
            {myDrafts.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 text-sm">
                <Link href={`/proposals/${d.id}`} className="min-w-0 flex-1 truncate text-ink hover:text-kyanos">
                  <span className="text-ink-faint">{proposalEyebrow(t, d.kind)} · </span>
                  {d.question}
                </Link>
                <Link
                  href={`/proposals/${d.id}/edit`}
                  className="inline-flex shrink-0 items-center gap-1 text-xs text-kyanos hover:underline"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('proposal.edit')}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Toolbar: search line / filter grid / result strip ── */}
      <section className="mb-8 rounded border border-line bg-surface">
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />
          <Input
            type="search"
            placeholder={t('proposals.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-12 rounded-none border-0 bg-transparent px-0 text-sm text-ink placeholder:text-ink-faint focus-visible:ring-0 focus-visible:ring-offset-0"
            data-testid="proposals-search"
          />
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-3 p-4 sm:p-5 2xl:grid-cols-4">
          {filterSelect('proposals-filter-type', t('proposals.filterType'), typeFilter, setTypeFilter, t('proposals.filterTypeAll'),
            PROPOSAL_KINDS.map((k) => ({ value: k, label: t(`proposal.kind_${k}`) })))}
          {filterSelect('proposals-filter-stage', t('proposals.filterStage'), stageFilter, setStageFilter, t('proposals.filterStageAll'),
            PROPOSAL_STAGES.map((st) => ({ value: st, label: t(`stage.${st}`) })))}
          {filterSelect('proposals-filter-community', t('proposals.filterCommunity'), communityFilter, setCommunityFilter, t('proposals.filterCommunityAll'),
            communities.map((c) => ({ value: String(c.id), label: c.name })))}
          {filterSelect('proposals-filter-category', t('proposals.filterCategory'), categoryFilter, setCategoryFilter, t('proposals.filterCategoryAll'),
            CATEGORIES.map((c) => ({ value: c, label: t(`proposal.category_${c}`) })))}

        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-b border-t border-line bg-sunken px-4 py-2.5">
          <span className="font-mono text-xs tabular-nums text-ink-soft" data-testid="proposals-result-count">
            {t('proposals.resultCount', { count: filtered.length })}
          </span>
          <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
            <SelectTrigger
              data-testid="proposals-sort"
              aria-label={t('proposals.sort')}
              className="h-7 w-auto gap-1 border-0 bg-transparent px-1 text-xs text-ink-soft shadow-none"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="created_desc">{t('proposals.sortNewest')}</SelectItem>
              <SelectItem value="created_asc">{t('proposals.sortOldest')}</SelectItem>
              <SelectItem value="score_desc">{t('proposals.sortScoreHigh')}</SelectItem>
              <SelectItem value="score_asc">{t('proposals.sortScoreLow')}</SelectItem>
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={clearFilters}
            data-testid="proposals-clear-filters"
            className="text-xs font-medium text-kyanos underline-offset-2 hover:underline"
          >
            {t('proposals.clearFilters')}
          </button>
        </div>
      </section>

      {loading ? (
        <LoadingState label={t('general.loading')} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-12 w-12" />}
          title={t('proposals.empty')}
          action={
            /* Clear-filters already lives in the filter bar above. */
            <button
              type="button"
              onClick={() => navigate('/proposals/new')}
              data-testid="proposals-empty-cta"
              className="inline-flex items-center gap-2 rounded bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors duration-[120ms] hover:bg-kyanos-deep"
            >
              {t('home.submitProposal')}
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          }
        />
      ) : (
        <div className="space-y-6" data-testid="proposals-list">
          {/* ── The register ── */}
          {/* Cards, not a bordered register with dividers — same card language
              and the same CARD_STACK gap as the feed and the rails. */}
          <div className={CARD_STACK}>
            {visible.map((proposal) => {
              const score = parseScore(proposal.llmScore);
              return (
                <EntityCard
                  key={proposal.id}
                  subject="proposal"
                  kindLabel={proposalEyebrow(t, (proposal as { kind?: string }).kind)}
                  id={proposal.id}
                  title={proposal.question}
                  excerpt={proposal.solution}
                  href={`/proposals/${proposal.id}`}
                  ctaLabel={t('rail.learnMore')}
                  tag={communityName(proposal.communityId, proposal.communityName)}
                  tagHref={`/communities/${proposal.communityId}`}
                  badge={<StatusBadge status={proposal.status} />}
                  bookmarkKind="proposal"
                  thumbnailKey={(proposal as { thumbnailKey?: string | null }).thumbnailKey}
                  meta={
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-faint">
                      <time dateTime={proposal.createdAt} className="font-mono tabular-nums">
                        {new Date(proposal.createdAt).toLocaleDateString()}
                      </time>
                      <span>
                        {t('proposal.by')}{' '}
                        {proposal.authorName ?? proposal.authorUsername ?? t('proposal.userWithId', { id: proposal.authorId })}
                        {publicHandle({ name: proposal.authorName, username: proposal.authorUsername }) && (
                          <span className="ml-1.5 text-ink-faint">
                            {publicHandle({ name: proposal.authorName, username: proposal.authorUsername })}
                          </span>
                        )}
                      </span>
                      {score !== null && (
                        <span className="font-mono tabular-nums" data-testid={`proposals-score-${proposal.id}`}>
                          {t('proposals.score')}: {Math.round(score)}/100
                        </span>
                      )}
                    </span>
                  }
                />
              );
            })}
          </div>

          {hasMore && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setPageLimit((n) => n + PAGE_SIZE)}
                data-testid="proposals-load-more"
                className="rounded border border-ink px-4 py-2 text-sm font-medium text-ink transition-colors duration-[120ms] hover:bg-sunken"
              >
                {t('proposals.loadMore')}
              </button>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
