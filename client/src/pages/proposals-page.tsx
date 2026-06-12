/**
 * Proposal Index Page (/proposals)
 *
 * Lists all proposals across communities with client-side filtering by
 * status, community, date range, and a free-text search across the
 * question + solution. Sorting is client-side (the API only exposes a
 * `limit` parameter today). Pagination uses a simple "load more" cursor
 * over an in-memory list.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import AppShell from '@/components/layout/AppShell';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
      title={t('proposals.title')}
      breadcrumb={[{ label: t('nav.home'), href: '/' }, { label: t('proposals.title') }]}
      actions={
        <Button onClick={() => navigate('/proposals/new')} data-testid="proposals-new-button">
          <Plus className="w-4 h-4 mr-2" />
          {t('home.submitProposal')}
        </Button>
      }
    >
      <Card className="mb-6">
        <CardContent className="p-4 sm:p-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder={t('proposals.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="proposals-search"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t('proposals.filterStatus')}</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger data-testid="proposals-filter-status">
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

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t('proposals.filterCommunity')}</Label>
              <Select value={communityFilter} onValueChange={setCommunityFilter}>
                <SelectTrigger data-testid="proposals-filter-community">
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

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t('proposals.dateFrom')}</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                data-testid="proposals-date-from"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t('proposals.dateTo')}</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                data-testid="proposals-date-to"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="space-y-1 sm:w-64">
              <Label className="text-xs text-muted-foreground">{t('proposals.sort')}</Label>
              <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
                <SelectTrigger data-testid="proposals-sort">
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
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground" data-testid="proposals-result-count">
                {t('proposals.resultCount', { count: filtered.length })}
              </span>
              <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="proposals-clear-filters">
                {t('proposals.clearFilters')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <LoadingState label={t('general.loading')} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-12 w-12" />}
          title={t('proposals.empty')}
          action={
            /* Clear-filters already lives in the filter bar above. */
            <Button onClick={() => navigate('/proposals/new')} data-testid="proposals-empty-cta">
              <Plus className="w-4 h-4 mr-2" />
              {t('home.submitProposal')}
            </Button>
          }
        />
      ) : (
        <div className="space-y-3" data-testid="proposals-list">
          {visible.map((proposal) => {
            const score = parseScore(proposal.llmScore);
            return (
              <Link
                key={proposal.id}
                href={`/proposals/${proposal.id}`}
                className="block"
                data-testid={`proposals-card-${proposal.id}`}
              >
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-base sm:text-lg mb-1 line-clamp-2">{proposal.question}</h3>
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                          {proposal.solution}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <FileText className="w-3.5 h-3.5" />
                            {communityName(proposal.communityId, proposal.communityName)}
                          </span>
                          <span>
                            {t('proposal.by')}{' '}
                            {proposal.authorName ?? t('proposal.userWithId', { id: proposal.authorId })}
                          </span>
                          <span>{new Date(proposal.createdAt).toLocaleDateString()}</span>
                          {score !== null && (
                            <span data-testid={`proposals-score-${proposal.id}`}>
                              {t('proposals.score')}: {Math.round(score)}/100
                            </span>
                          )}
                        </div>
                      </div>
                      <StatusBadge status={proposal.status} className="self-start" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}

          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                onClick={() => setPageLimit((n) => n + PAGE_SIZE)}
                data-testid="proposals-load-more"
              >
                {t('proposals.loadMore')}
              </Button>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}

