import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Search, Plus, Users, Loader2, SlidersHorizontal, ArrowRight, MessageCircle, ChevronDown } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import { EntityCard } from '@/components/cards/entity-card';
import { CommunityJoinAction } from '@/components/community/CommunityJoinAction';
import { MediaUploadDialog } from '@/components/media/MediaUploadDialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/hooks/use-translation';
import { useAuth } from '@/hooks/use-auth';
import { useCommunityDirectory } from '@/hooks/use-community-membership';
import { api } from '@/lib/api';
import { proposalEyebrow } from '@/lib/proposal-kind';
import StatusBadge from '@/components/proposal/StatusBadge';
import TierBadge from '@/components/surveys/TierBadge';
import type { ActivityItem, ActivityPage, FeedKind, FeedScope, FeedStage } from '@shared/activity-feed';

export function ActivityFeedCard({ item }: { item: ActivityItem }) {
  const { t, locale } = useTranslation();
  const media = item.feedType === 'media';
  const library = item.source === 'community-media';
  const completed = item.status === 'decided' || item.status === 'archived' || item.status === 'closed';
  const communityHref = `/communities/${item.communityId}`;
  const href = item.feedType === 'proposal' ? `/proposals/${item.id}`
    : item.feedType === 'survey' ? `/surveys/${item.id}`
    : library ? `${communityHref}?tab=library#library-item-${item.id}` : `/proposals/${item.proposalId}?tab=media`;
  const actor = item.actorName || item.actorUsername || item.uploaderName || item.authorName || t('activity.platform');
  const title = item.question || item.title || item.proposalQuestion || t('activity.platform');
  const date = new Date(item.createdAt);
  const dateLabel = date.toLocaleString(locale === 'el' ? 'el-GR' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const player = media && item.filePath ? item.kind === 'video'
    ? <video controls playsInline preload="none" poster={item.thumbPath ? `/media/${item.thumbPath}` : undefined} src={`/media/${item.filePath}`} className="aspect-video max-h-[480px] w-full rounded-xl bg-ink object-contain" aria-label={title} />
    : <audio controls preload="none" src={`/media/${item.filePath}`} className="w-full" aria-label={title} /> : undefined;
  const cta = media ? t(library ? 'activity.openLibrary' : 'media.openProposal')
    : completed ? t('activity.results')
    : item.feedType === 'survey' ? t('surveys.take')
    : !item.viewerIsMember ? t('activity.open')
    : t(item.status === 'voting' ? 'activity.vote' : item.status === 'community_signal' ? 'activity.discuss' : 'activity.open');
  return <EntityCard
    subject={media ? item.kind === 'video' ? 'video' : 'podcast' : item.feedType === 'proposal' ? 'proposal' : 'survey'}
    kindLabel={media ? t(item.kind === 'video' ? 'nav.videos' : 'nav.podcasts') : item.feedType === 'proposal' ? proposalEyebrow(t, item.kind) : t('surveys.title')}
    id={item.id} title={title} excerpt={item.solution || item.description || (media && !library ? item.proposalQuestion : item.topicTag)}
    href={href} ctaLabel={cta} tag={item.communityName || (item.feedType === 'survey' ? t('activity.platform') : undefined)}
    tagHref={item.communityId ? communityHref : undefined}
    badge={item.feedType === 'proposal' ? <StatusBadge status={item.status || 'review'} /> : item.feedType === 'survey' ? <TierBadge tier={item.tier || 'community'} /> : undefined}
    bookmarkKind={library ? undefined : media ? 'media' : item.feedType}
    thumbSrc={item.thumbPath} thumbnailKey={item.thumbnailKey} detail={player} inlineDetail={media}
    meta={<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-soft">
      <span className="font-medium text-ink">{actor}</span>
      {item.actorUsername && item.actorUsername !== actor && <span>@{item.actorUsername}</span>}
      <span aria-hidden="true">·</span><time dateTime={item.createdAt} title={date.toLocaleString()}>{dateLabel}</time>
      {media && <><span aria-hidden="true">·</span><span>{t(library ? 'activity.library' : 'activity.proposalMedia')}</span></>}
      {item.phaseDeadline && !completed && <span className="w-full pt-1 text-kyanos">{t('activity.until')}: {new Date(item.phaseDeadline).toLocaleString(locale === 'el' ? 'el-GR' : 'en-GB')}</span>}
    </div>}
    actions={item.communityId && !item.viewerIsMember ? <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="max-w-md text-sm leading-relaxed text-ink-soft">{t('activity.joinHint')}</p>
      <CommunityJoinAction communityId={item.communityId} />
    </div> : undefined}
  />;
}

export default function FeedPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const initial = useMemo(() => new URLSearchParams(window.location.search), []);
  const [scope, setScope] = useState<FeedScope>(['mine', 'discover', 'all'].includes(initial.get('scope') || '') ? initial.get('scope') as FeedScope : 'mine');
  const [stage, setStage] = useState<FeedStage>(['active', 'completed', 'all'].includes(initial.get('stage') || '') ? initial.get('stage') as FeedStage : 'active');
  const [kind, setKind] = useState<FeedKind>(['all', 'proposal', 'survey', 'video', 'podcast'].includes(initial.get('type') || '') ? initial.get('type') as FeedKind : 'all');
  const [community, setCommunity] = useState(initial.get('community') || '');
  const [search, setSearch] = useState(initial.get('q') || '');
  const [term, setTerm] = useState(search);
  const directory = useCommunityDirectory();
  useEffect(() => { const timer = setTimeout(() => setTerm(search.trim()), 300); return () => clearTimeout(timer); }, [search]);
  useEffect(() => {
    const params = new URLSearchParams();
    if (scope !== 'mine') params.set('scope', scope);
    if (stage !== 'active') params.set('stage', stage);
    if (kind !== 'all') params.set('type', kind);
    if (community) params.set('community', community);
    if (term) params.set('q', term);
    window.history.replaceState(null, '', `/feed${params.size ? `?${params}` : ''}`);
  }, [scope, stage, kind, community, term]);
  const query = useInfiniteQuery({
    queryKey: ['/api/activity-feed', { viewer: user?.id, scope, stage, kind, community, q: term }],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ scope, stage, type: kind, limit: '8' });
      if (pageParam) params.set('cursor', pageParam);
      if (community) params.set('community', community);
      if (term) params.set('q', term);
      return (await api.get<ActivityPage>(`/api/activity-feed?${params}`)).data;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!user,
  });
  const items = Array.from(new Map((query.data?.pages.flatMap(page => page.items) ?? []).map(item => [item.feedKey, item])).values());
  const openTopics = useQuery({
    queryKey: ['/api/activity-feed', 'open-topics', user?.id],
    queryFn: async () => (await api.get<ActivityPage>('/api/activity-feed?scope=mine&stage=active&type=proposal&limit=3')).data,
    enabled: !!user,
  });
  const reset = () => { setSearch(''); setCommunity(''); setKind('all'); setStage('active'); };
  const filters: Array<[FeedKind, string]> = [['all', 'feed.filterAll'], ['proposal', 'feed.filterProposals'], ['survey', 'feed.filterSurveys'], ['video', 'nav.videos'], ['podcast', 'nav.podcasts']];
  return <AppShell>
    <div className="mx-auto max-w-[780px] space-y-6 pb-4">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{t('activity.title')}</h1><p className="mt-2 hidden text-base leading-relaxed text-ink-soft sm:block">{t('activity.subtitle')}</p></div>
        <div className="hidden flex-wrap gap-2 sm:flex">
          <Button asChild><Link href="/proposals/new"><Plus className="mr-2 h-4 w-4" />{t('activity.new')}</Link></Button>
          <MediaUploadDialog kind="video" />
        </div>
      </header>
      {scope === 'mine' && !term && !community && kind === 'all' && stage === 'active' && (openTopics.data?.items.length ?? 0) > 0 && <details className="group hidden rounded-xl border border-kyanos/20 bg-kyanos-wash sm:block">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 py-3 text-base font-semibold text-ink marker:content-none"><MessageCircle className="h-5 w-5 shrink-0 text-kyanos" /><span className="flex-1">{t('activity.upNext')}</span><ChevronDown className="h-5 w-5 shrink-0 text-kyanos group-open:rotate-180" /></summary>
        <div className="border-t border-kyanos/10 px-5 pb-3">
          <ul className="divide-y divide-kyanos/10">{openTopics.data?.items.map(item => <li key={item.feedKey}><Link href={`/proposals/${item.id}`} className="flex min-h-14 items-center gap-3 py-3"><span className="min-w-0 flex-1"><span className="block text-base font-medium text-ink">{item.question}</span><span className="text-sm text-ink-soft">{item.communityName}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-kyanos" /></Link></li>)}</ul>
          <Link href="/proposals" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-kyanos">{t('rail.more')}<ArrowRight className="h-4 w-4" /></Link>
        </div>
      </details>}
      <section className="space-y-4" aria-label={t('activity.filters')}>
        <div className="flex flex-wrap gap-2 border-b border-line pb-3" role="group" aria-label={t('activity.scope')}>
          {(['mine', 'discover', 'all'] as FeedScope[]).map(value => <button key={value} type="button" aria-pressed={scope === value} onClick={() => { setScope(value); setCommunity(''); }} className={`min-h-11 rounded-full px-3 text-sm font-medium transition-colors sm:px-4 sm:text-base ${scope === value ? 'bg-ink text-paper' : 'bg-surface text-ink-soft hover:bg-sunken'}`} data-testid={`feed-scope-${value}`}><span className="sm:hidden">{t(value === 'all' ? 'feed.filterAll' : `activity.${value}`)}</span><span className="hidden sm:inline">{t(`activity.${value}`)}</span></button>)}
        </div>
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-3.5 h-5 w-5 text-ink-faint" /><Input aria-label={t('activity.searchLabel')} placeholder={t('activity.search')} value={search} onChange={event => setSearch(event.target.value)} className="pl-10" data-testid="feed-search" /></div>
        <div className="flex flex-wrap items-center gap-2" data-testid="feed-filter">{filters.map(([value, key]) => <button type="button" key={value} aria-pressed={kind === value} onClick={() => setKind(value)} className={`hidden min-h-11 items-center rounded-lg px-3 text-sm font-medium sm:inline-flex ${kind === value ? 'bg-kyanos-wash text-kyanos' : 'text-ink-soft hover:bg-sunken'}`}>{t(key)}</button>)}
          <details className="ml-auto"><summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-3 text-sm text-ink-soft"><SlidersHorizontal className="h-4 w-4" />{t('activity.filters')}</summary>
            <div className="mt-2 flex flex-wrap gap-3 rounded-xl border border-line bg-surface p-4">
              <label className="grid gap-2 text-sm text-ink-soft sm:hidden">{t('activity.contentLabel')}<select value={kind} onChange={event => setKind(event.target.value as FeedKind)} className="min-h-11 rounded-lg border border-line bg-surface px-3 text-base text-ink" data-testid="feed-kind-mobile">{filters.map(([value, key]) => <option key={value} value={value}>{t(key)}</option>)}</select></label>
              <label className="grid gap-2 text-sm text-ink-soft">{t('activity.stageLabel')}<select value={stage} onChange={event => setStage(event.target.value as FeedStage)} className="min-h-11 rounded-lg border border-line bg-surface px-3 text-base text-ink" data-testid="feed-stage"><option value="active">{t('activity.current')}</option><option value="all">{t('activity.everyStage')}</option><option value="completed">{t('activity.completed')}</option></select></label>
              <label className="grid gap-2 text-sm text-ink-soft">{t('activity.communityLabel')}<select value={community} onChange={event => setCommunity(event.target.value)} className="min-h-11 max-w-full rounded-lg border border-line bg-surface px-3 text-base text-ink" data-testid="feed-community"><option value="">{t('activity.allCommunities')}</option>{directory.data?.filter(c => scope !== 'mine' || c.viewerIsMember).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            </div>
          </details>
        </div>
      </section>
      {query.isPending ? <div className="space-y-4" aria-busy="true">{[0, 1, 2].map(i => <div key={i} className="h-56 animate-pulse rounded-xl border border-line bg-surface" />)}</div>
        : query.isError ? <div role="alert" className="rounded-xl border border-line bg-surface p-6"><p>{t('activity.loadFailed')}</p><Button variant="outline" onClick={() => void query.refetch()} className="mt-4">{t('activity.retry')}</Button></div>
        : items.length === 0 ? <div className="rounded-xl border border-dashed border-line bg-surface px-6 py-10 text-center"><Users className="mx-auto mb-4 h-8 w-8 text-kyanos" /><h2 className="text-xl font-semibold">{t(scope === 'mine' ? 'activity.emptyMine' : 'activity.empty')}</h2><p className="mt-3 text-base text-ink-soft">{t('activity.emptyHint')}</p><div className="mt-5 flex flex-wrap justify-center gap-3"><Button asChild><Link href="/communities?view=discover">{t('activity.exploreCommunities')}</Link></Button><Button variant="outline" onClick={reset}>{t('activity.reset')}</Button></div></div>
        : <div className="space-y-5" data-testid="activity-feed-list">{items.map(item => <ActivityFeedCard key={item.feedKey} item={item} />)}</div>}
      {query.hasNextPage && <div className="flex justify-center"><Button variant="outline" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('activity.loadMore')}</Button></div>}
    </div>
  </AppShell>;
}
