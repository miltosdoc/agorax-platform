/**
 * Proposal Index Page (/proposals)
 *
 * Lists all proposals across communities with client-side filtering by
 * status, community, date range, and a free-text search across the
 * question + solution. Sorting is client-side (the API only exposes a
 * `limit` parameter today). Pagination uses a simple "load more" cursor
 * over an in-memory list.
 *
 * Composition: a legislative docket — one hairline-bounded toolbar
 * (search line, filter grid, mono result-count strip) over a single
 * bordered register of divided rows.
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
import { FileText, Plus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { useTranslation, getStatusLabel } from '@/hooks/use-translation';
import { ORDERED_STATES } from '@/lib/proposal-status';
import StatusBadge from '@/components/proposal/StatusBadge';
import { EmptyState, LoadingState } from '@/components/ui/empty-state';

type SortOption = 'created_desc' | 'created_asc' | 'score_desc' | 'score_asc';

interface Proposal {
  id: number;
  question: string;
  solution: string;
  status: string;
  authorId: number;
  authorName?: string;
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
const STATUS_ALL = '__all__';
const COMMUNITY_ALL = '__all__';

/* Toolbar vocabulary: tracked eyebrow labels, flat token-bound controls. */
const FIELD_LABEL = 'text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint';
const FIELD_CONTROL = 'h-9 rounded border-line bg-surface text-sm text-ink';

function parseScore(value: Proposal['llmScore']): number | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

export default function ProposalsPage() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageLimit, setPageLimit] = useState(PAGE_SIZE);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(STATUS_ALL);
  const [communityFilter, setCommunityFilter] = useState<string>(COMMUNITY_ALL);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
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

  const communityName = useMemo(() => {
    const byId = new Map<number, string>();
    for (const c of communities) byId.set(c.id, c.name);
    return (id: number, fallback?: string) => byId.get(id) ?? fallback ?? `#${id}`;
  }, [communities]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : null;
    // Include the whole "to" day by adding 24h.
    const toTs = dateTo ? new Date(dateTo).getTime() + 24 * 60 * 60 * 1000 : null;

    const matches = proposals.filter((p) => {
      if (statusFilter !== STATUS_ALL && p.status !== statusFilter) return false;
      // Archived proposals are record, not feed: they appear only when the
      // archived filter is explicitly selected.
      if (statusFilter === STATUS_ALL && p.status === 'archived') return false;
      if (communityFilter !== COMMUNITY_ALL && String(p.communityId) !== communityFilter) return false;
      if (term) {
        const hay = `${p.question ?? ''} ${p.solution ?? ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (fromTs !== null) {
        const created = new Date(p.createdAt).getTime();
        if (Number.isFinite(created) && created < fromTs) return false;
      }
      if (toTs !== null) {
        const created = new Date(p.createdAt).getTime();
        if (Number.isFinite(created) && created >= toTs) return false;
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
  }, [proposals, search, statusFilter, communityFilter, dateFrom, dateTo, sort]);

  // Reset pagination whenever filters change.
  useEffect(() => {
    setPageLimit(PAGE_SIZE);
  }, [search, statusFilter, communityFilter, dateFrom, dateTo, sort]);

  const visible = filtered.slice(0, pageLimit);
  const hasMore = filtered.length > visible.length;

  const clearFilters = () => {
    setSearch('');
    setStatusFilter(STATUS_ALL);
    setCommunityFilter(COMMUNITY_ALL);
    setDateFrom('');
    setDateTo('');
    setSort('created_desc');
  };

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
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t('home.submitProposal')}
        </button>
      }
    >
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

        <div className="grid grid-cols-1 gap-x-4 gap-y-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label className={FIELD_LABEL}>{t('proposals.filterStatus')}</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger data-testid="proposals-filter-status" className={FIELD_CONTROL}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={STATUS_ALL}>{t('proposals.filterStatusAll')}</SelectItem>
                {ORDERED_STATES.map((state) => (
                  <SelectItem key={state} value={state}>
                    {getStatusLabel(state, t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className={FIELD_LABEL}>{t('proposals.filterCommunity')}</Label>
            <Select value={communityFilter} onValueChange={setCommunityFilter}>
              <SelectTrigger data-testid="proposals-filter-community" className={FIELD_CONTROL}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={COMMUNITY_ALL}>{t('proposals.filterCommunityAll')}</SelectItem>
                {communities.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className={FIELD_LABEL}>{t('proposals.dateFrom')}</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={`${FIELD_CONTROL} font-mono tabular-nums`}
              data-testid="proposals-date-from"
            />
          </div>

          <div className="space-y-1.5">
            <Label className={FIELD_LABEL}>{t('proposals.dateTo')}</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={`${FIELD_CONTROL} font-mono tabular-nums`}
              data-testid="proposals-date-to"
            />
          </div>

          <div className="space-y-1.5">
            <Label className={FIELD_LABEL}>{t('proposals.sort')}</Label>
            <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
              <SelectTrigger data-testid="proposals-sort" className={FIELD_CONTROL}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created_desc">{t('proposals.sortNewest')}</SelectItem>
                <SelectItem value="created_asc">{t('proposals.sortOldest')}</SelectItem>
                <SelectItem value="score_desc">{t('proposals.sortScoreHigh')}</SelectItem>
                <SelectItem value="score_asc">{t('proposals.sortScoreLow')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-b border-t border-line bg-sunken px-4 py-2.5">
          <span className="font-mono text-xs tabular-nums text-ink-soft" data-testid="proposals-result-count">
            {t('proposals.resultCount', { count: filtered.length })}
          </span>
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
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t('home.submitProposal')}
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
                  kindLabel={t('nav.proposals')}
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
                        {proposal.authorName ?? t('proposal.userWithId', { id: proposal.authorId })}
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
