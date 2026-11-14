import { useEffect, useMemo, useState } from 'react';
import { Link, useSearch } from 'wouter';
import { Plus, Search, Users, Compass, ArrowUpDown, X, Clock3 } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import { useTranslation } from '@/hooks/use-translation';
import { useAuth } from '@/hooks/use-auth';
import { useCommunityDirectory, pinnedFirst } from '@/hooks/use-community-membership';
import { CommunityCard, type CommunityCardData } from '@/components/cards/community-card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const CATEGORIES = ['all', 'koinonia', 'perivallon', 'politiki', 'politismos', 'oikonomia', 'allilengyi', 'ygeia'] as const;
const SORTS = [
  { key: 'suggested', labelKey: 'communities.sortSuggested' },
  { key: 'newest', labelKey: 'communities.sortNewest' },
  { key: 'largest', labelKey: 'communities.sortLargest' },
] as const;
const PAGE_SIZE = 8;
const searchable = (value: string) => value.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export default function CommunitiesPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('suggested');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const directory = useCommunityDirectory();
  const urlSearch = useSearch();
  useEffect(() => {
    const view = new URLSearchParams(urlSearch).get('view');
    if (directory.isLoading || (view !== 'mine' && view !== 'discover')) return;
    document.getElementById(view === 'mine' ? 'my-communities-heading' : 'discover-communities-heading')?.scrollIntoView({ block: 'start' });
  }, [urlSearch, directory.isLoading]);
  const all = directory.data ?? [];
  const mine = pinnedFirst(all.filter((community) => community.viewerIsMember));
  const pending = all.filter((community) => !community.viewerIsMember && community.viewerJoinStatus === 'pending');
  const searchMatches = (community: CommunityCardData) => {
    const query = searchable(search.trim());
    const normalized = searchable(`${community.name} ${community.description ?? ''} ${community.tagline ?? ''} ${community.region ?? ''}`);
    return (!query || normalized.includes(query)) && (category === 'all' || community.category === category);
  };
  const filteredMine = mine.filter(searchMatches);
  const filtered = useMemo(() => {
    const query = searchable(search.trim());
    const list = all.filter((community) => !community.viewerIsMember &&
      (category === 'all' || community.category === category) &&
      (!query || searchable(`${community.name} ${community.description ?? ''} ${community.tagline ?? ''} ${community.region ?? ''}`).includes(query)));
    return [...list].sort((a, b) => sort === 'newest'
      ? new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
      : sort === 'largest' ? (b.memberCount ?? 0) - (a.memberCount ?? 0)
      : (b.activeProposalCount ?? 0) - (a.activeProposalCount ?? 0) || (b.memberCount ?? 0) - (a.memberCount ?? 0));
  }, [directory.data, search, category, sort]);
  const loadingCards = <div className="grid grid-cols-1 gap-4 min-[700px]:grid-cols-2" aria-busy="true">{[0, 1].map((i) => <div key={i} className="h-64 animate-pulse rounded-2xl border border-line bg-sunken" />)}</div>;
  const resetFilters = () => { setSearch(''); setCategory('all'); setVisibleCount(PAGE_SIZE); };

  return <AppShell breadcrumb={[{ label: t('nav.communities') }]} actions={user ? <Link href="/communities/new" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-kyanos px-4 text-sm font-semibold text-white hover:bg-kyanos-deep" data-testid="button-create-community"><Plus className="h-4 w-4" />{t('communities.create')}</Link> : undefined}>
    <header className="mb-6">
      <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{t('nav.communities')}</h1>
      <p className="mt-2 max-w-2xl text-base leading-relaxed text-ink-soft">{t('communities.pageHelp')}</p>
    </header>
    <div className="mb-8 space-y-3 rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <label className="relative block">
        <span className="sr-only">{t('communities.searchLabel')}</span>
        <Search className="pointer-events-none absolute left-3.5 top-3.5 h-5 w-5 text-ink-faint" />
        <Input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setVisibleCount(PAGE_SIZE); }} placeholder={t('communities.searchPlaceholder')} className="h-12 rounded-xl pl-11 text-base" data-testid="search-communities" />
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Select value={category} onValueChange={(value) => { setCategory(value); setVisibleCount(PAGE_SIZE); }}><SelectTrigger className="h-11 rounded-xl sm:flex-1" aria-label={t('communities.browseByCategory')} data-testid="filter-community-category"><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map((key) => <SelectItem key={key} value={key}>{t(`category.${key}`)}</SelectItem>)}</SelectContent></Select>
        <Select value={sort} onValueChange={(value) => { setSort(value); setVisibleCount(PAGE_SIZE); }}><SelectTrigger className="h-11 rounded-xl sm:w-56" aria-label={t('communities.sort')} data-testid="button-sort"><ArrowUpDown className="mr-2 h-4 w-4" /><SelectValue /></SelectTrigger><SelectContent>{SORTS.map((option) => <SelectItem key={option.key} value={option.key}>{t(option.labelKey)}</SelectItem>)}</SelectContent></Select>
        {(search || category !== 'all') && <button type="button" onClick={resetFilters} className="inline-flex min-h-11 items-center justify-center gap-1.5 px-3 text-sm text-ink-soft hover:text-ink"><X className="h-4 w-4" />{t('communities.clearFilters')}</button>}
      </div>
    </div>
    {directory.isError ? <div className="rounded-2xl border border-line bg-surface p-6" role="alert"><p className="text-ink-soft">{t('communities.loadError')}</p><button type="button" onClick={() => void directory.refetch()} className="mt-3 min-h-11 rounded-xl bg-kyanos px-4 text-sm font-medium text-white">{t('membership.retry')}</button></div> : <>
      <section className="mb-10" aria-labelledby="my-communities-heading">
        <div className="mb-4 flex items-center gap-3"><Users className="h-6 w-6 text-kyanos" /><h2 id="my-communities-heading" className="text-2xl font-semibold text-ink">{t('communities.my')}</h2>{mine.length > 0 && <span className="rounded-full bg-kyanos-wash px-2.5 py-1 text-sm font-medium text-kyanos">{mine.length}</span>}</div>
        {directory.isLoading ? loadingCards : filteredMine.length ? <div className="grid grid-cols-1 gap-4 min-[700px]:grid-cols-2" data-testid="grid-my-communities">{filteredMine.map((community) => <CommunityCard key={community.id} community={community} />)}</div> : <div className="rounded-2xl border border-dashed border-line bg-surface p-6 text-base leading-relaxed text-ink-soft">{user ? (mine.length ? t('communities.noResults') : t('communities.noMemberships')) : <><p>{t('communities.signInHelp')}</p><Link href="/auth?returnTo=%2Fcommunities" className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-kyanos px-4 text-sm font-semibold text-white">{t('auth.login')}</Link></>}</div>}
      </section>
      {pending.length > 0 && !search && category === 'all' && <section className="mb-10"><h2 className="mb-3 flex items-center gap-2 text-xl font-semibold text-ink"><Clock3 className="h-5 w-5 text-ink-soft" />{t('communities.pendingTitle')}</h2><div className="flex flex-wrap gap-2">{pending.map((community) => <Link key={community.id} href={`/communities/${community.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm text-ink">{community.name}<span className="text-ink-faint">· {t('membership.pendingShort')}</span></Link>)}</div></section>}
      <section aria-labelledby="discover-communities-heading">
        <div className="mb-2 flex items-center gap-3"><Compass className="h-6 w-6 text-kyanos" /><h2 id="discover-communities-heading" className="text-2xl font-semibold text-ink">{t('communities.discover')}</h2></div>
        <p className="mb-5 text-base text-ink-soft">{t('communities.discoverHelp')}</p>
        <p className="mb-3 text-sm text-ink-faint" data-testid="text-community-count">{t('communities.count', { count: filtered.length })}</p>
        {directory.isLoading ? loadingCards : filtered.length ? <><div className="grid grid-cols-1 gap-4 min-[700px]:grid-cols-2" data-testid="grid-communities">{filtered.slice(0, visibleCount).map((community) => <CommunityCard key={community.id} community={community} />)}</div>{visibleCount < filtered.length && <button type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)} className="mt-5 min-h-11 w-full rounded-xl border border-line bg-surface px-4 text-base font-medium text-ink hover:bg-sunken">{t('communities.showMore')}</button>}</> : <p className="rounded-2xl border border-dashed border-line p-6 text-base text-ink-soft">{t('communities.noResults')}</p>}
      </section>
    </>}
  </AppShell>;
}
