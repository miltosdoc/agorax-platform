import { useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Mic, Video, Clock, Search, Loader2, ArrowUpRight } from 'lucide-react';
import type { ActivityItem, ActivityPage, FeedScope } from '@shared/activity-feed';
import AppShell from '@/components/layout/AppShell';
import { useTranslation } from '@/hooks/use-translation';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SaveButton, ShareButton } from '@/components/cards/card-actions';
import { CommunityJoinAction } from '@/components/community/CommunityJoinAction';
import { MediaUploadDialog } from '@/components/media/MediaUploadDialog';
import { initials } from '@/lib/initials';

function MediaCard({ item, kind }: { item: ActivityItem; kind: 'podcast' | 'video' }) {
  const { t, locale } = useTranslation();
  const author = item.actorName || item.uploaderName || t('redesignMedia.authorUnknown');
  const title = item.title || item.proposalQuestion || t(kind === 'video' ? 'nav.videos' : 'nav.podcasts');
  const destination = item.proposalId ? `/proposals/${item.proposalId}?tab=media` : `/communities/${item.communityId}?tab=library#library-item-${item.id}`;
  const date = new Date(item.createdAt);
  const dateLabel = date.toLocaleString(locale === 'en' ? 'en-GB' : 'el-GR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const seconds = item.durationS ? Number(item.durationS) : 0;
  const duration = seconds > 0 ? `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}` : '';
  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-surface" id={`media-${item.source}-${item.id}`} data-testid={`card-media-${item.id}`} data-feed-key={item.feedKey}>
      <div className="px-5 pt-5 sm:px-6 sm:pt-6">
        <div className="mb-4 flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-kyanos-wash text-sm font-semibold text-kyanos" aria-hidden="true">{initials(author)}</span>
          <div className="min-w-0">
            <p className="m-0 flex flex-wrap items-baseline gap-x-2 text-sm leading-relaxed"><span className="font-semibold text-ink">{author}</span>{item.actorUsername && <span className="text-ink-faint">@{item.actorUsername}</span>}<time dateTime={date.toISOString()} title={dateLabel} className="text-ink-faint">· {dateLabel}</time></p>
            {item.communityId && <Link href={`/communities/${item.communityId}`} className="mt-0.5 inline-flex items-center gap-1 text-sm font-medium text-kyanos hover:underline">{item.communityName}</Link>}
          </div>
        </div>
        <h2 className="mb-4 text-xl font-semibold leading-snug text-ink sm:text-2xl">{title}</h2>
      </div>
      {kind === 'video' ? (
        <video controls playsInline preload="none" poster={item.thumbPath ? `/media/${item.thumbPath}` : undefined} src={`/media/${item.filePath}`} className="aspect-video max-h-[520px] w-full bg-black object-contain" aria-label={title} />
      ) : (
        <div className="mx-5 rounded-xl bg-kyanos-wash p-4 sm:mx-6 sm:p-5"><div className="mb-4 flex items-center gap-3 text-kyanos"><Mic className="h-6 w-6" aria-hidden="true" /><span className="text-sm font-semibold">{t('nav.podcasts')}</span></div><audio controls preload="none" src={`/media/${item.filePath}`} className="w-full" aria-label={title} /></div>
      )}
      <div className="space-y-4 p-5 sm:p-6">
        {item.proposalId ? (
          <Link href={`/proposals/${item.proposalId}`} className="block text-sm leading-relaxed text-ink-soft hover:text-kyanos" data-testid={`media-proposal-link-${item.id}`}><span className="text-ink-faint">{t('redesignMedia.forProposal')}: </span><span className="font-medium">{item.proposalQuestion}</span></Link>
        ) : <p className="m-0 text-sm text-ink-faint">{t('redesignMedia.librarySource')}</p>}
        {item.description && <p className="m-0 text-base leading-relaxed text-ink-soft">{item.description}</p>}
        {duration && <span className="inline-flex items-center gap-1.5 text-sm text-ink-faint"><Clock className="h-4 w-4" aria-hidden="true" />{duration}</span>}
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {item.communityId && !item.viewerIsMember && <CommunityJoinAction communityId={item.communityId} compact />}
          <Button asChild variant="outline"><Link href={destination}>{t(item.proposalId ? 'media.openProposal' : 'redesignMedia.openCommunity')}<ArrowUpRight className="h-4 w-4" /></Link></Button>
          <span className="ml-auto flex items-center gap-2">
            {item.source === 'proposal-media' && <SaveButton entityType="media" entityId={item.id} />}
            <ShareButton url={destination} title={title} />
          </span>
        </div>
      </div>
    </article>
  );
}

/** Readable media stream, with the same source, membership and pagination contract as home. */
export default function MediaLibraryPage({ kind }: { kind: 'podcast' | 'video' }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [scope, setScope] = useState<FeedScope>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250); return () => window.clearTimeout(timer); }, [search]);
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery<ActivityPage>({
    queryKey: ['/api/feed', 'media-shelf', kind, scope, debouncedSearch, { viewerId: user?.id ?? 0 }],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ type: kind, scope, limit: '12' });
      if (pageParam) params.set('cursor', String(pageParam));
      if (debouncedSearch) params.set('q', debouncedSearch);
      const response = await fetch(`/api/feed?${params}`, { credentials: 'include' });
      if (!response.ok) throw new Error(t('redesignMedia.loadError'));
      return response.json();
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const items = data?.pages.flatMap((page) => page.items) ?? [];
  const title = t(kind === 'video' ? 'nav.videos' : 'nav.podcasts');
  const Icon = kind === 'video' ? Video : Mic;
  const scopeOptions = [{ key: 'all' as const, label: t('redesignMedia.all') }, ...(user ? [{ key: 'mine' as const, label: t('redesignMedia.mine') }, { key: 'discover' as const, label: t('redesignMedia.discover') }] : [])];
  return (
    <AppShell>
      <div className="mx-auto max-w-[760px]">
        <div className="mb-7 flex flex-col items-start justify-between gap-4 sm:flex-row">
          <div className="min-w-0 flex-1"><h1 className="flex items-center gap-3 text-3xl font-semibold text-ink"><Icon className="h-7 w-7 text-kyanos" aria-hidden="true" />{title}</h1><p className="mb-0 mt-3 max-w-[50ch] text-base leading-relaxed text-ink-soft">{t(kind === 'video' ? 'redesignMedia.videoIntro' : 'redesignMedia.podcastIntro')}</p></div>
          <MediaUploadDialog kind={kind} />
        </div>
        <div className="mb-6 space-y-4">
          <div className="flex flex-wrap gap-2" aria-label={t('redesignMedia.community')}>
            {scopeOptions.map((option) => <button key={option.key} type="button" onClick={() => setScope(option.key)} aria-pressed={scope === option.key} className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${scope === option.key ? 'border-kyanos bg-kyanos-wash text-kyanos' : 'border-line bg-surface text-ink-soft hover:bg-sunken'}`} data-testid={`media-scope-${option.key}`}>{option.label}</button>)}
          </div>
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-faint" aria-hidden="true" /><Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('redesignMedia.search')} aria-label={t('redesignMedia.search')} className="pl-10" data-testid="media-search" /></div>
        </div>
        {isLoading ? <div className="space-y-5" aria-busy="true" aria-label={t('redesignMedia.loading')}>{[0, 1].map((index) => <div key={index} className="h-96 animate-pulse rounded-2xl border border-line bg-sunken" />)}</div> : isError && items.length === 0 ? <div className="rounded-xl border border-line bg-surface p-7 text-center"><p className="text-ink-soft" role="alert">{t('redesignMedia.loadError')}</p><Button variant="outline" onClick={() => refetch()}>{t('redesignMedia.retry')}</Button></div> : items.length === 0 ? <p className="rounded-xl border border-dashed border-line bg-surface px-6 py-16 text-center text-base text-ink-faint">{t('redesignMedia.empty')}</p> : <div className="space-y-6">{items.map((item) => <MediaCard key={item.feedKey} item={item} kind={kind} />)}</div>}
        {isError && items.length > 0 && <p className="mt-5 text-center text-sm text-kata" role="alert">{t('redesignMedia.loadError')}</p>}
        {hasNextPage && <div className="mt-7 text-center"><Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>{isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" />}{t(isFetchingNextPage ? 'redesignMedia.loading' : 'redesignMedia.loadMore')}</Button></div>}
      </div>
    </AppShell>
  );
}
