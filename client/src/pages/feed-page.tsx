/**
 * Global activity feed — newest first across three streams:
 *   media     user-produced podcasts / video teasers (inline player, share)
 *   proposal  every proposal that entered deliberation (non-draft)
 *   survey    live & closed polls (with the community/certified tier badge)
 * /api/feed merges them by date; podcast/video filters keep the original
 * cursor-paginated media-only behavior.
 *
 * Composition: an editorial register — one bordered ledger of divided rows
 * under an underline tab rail, not a stack of floating cards. Every row
 * leads with a tracked eyebrow + mono date meta line, then a serif title.
 */

import { useEffect, useState, useCallback } from 'react';
import { Link } from 'wouter';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useErrorToast } from '@/hooks/use-error-toast';
import { useTranslation } from '@/hooks/use-translation';
import AppShell from '@/components/layout/AppShell';
import { EntityCard } from '@/components/cards/entity-card';
import { CARD_STACK } from '@/components/rails/rail-section';
import { DiscoveryRail } from '@/components/rails/discovery-rail';
import { MyAgoraRail } from '@/components/rails/personal-rails';
import { GuideCard } from '@/components/GuideCard';
import ShareButton from '@/components/ShareButton';
import StatusBadge from '@/components/proposal/StatusBadge';
import TierBadge from '@/components/surveys/TierBadge';
import { EmptyState } from '@/components/ui/empty-state';
import { Mic, Video, Share2, Star, Loader2, FileText, BarChart3 } from 'lucide-react';

interface MediaFeedItem {
  feedType: 'media';
  id: number;
  proposalId: number;
  uploaderId: number;
  kind: 'podcast' | 'video';
  title: string | null;
  filePath: string;
  thumbPath: string | null;
  mimeType: string;
  sizeBytes: number;
  durationS: string | null;
  isFeatured: boolean;
  createdAt: string;
  proposalQuestion: string;
  proposalSolution: string | null;
  communityId: number;
  communityName: string;
  uploaderName: string;
}

interface ProposalFeedItem {
  feedType: 'proposal';
  id: number;
  question: string;
  solution: string;
  status: string;
  createdAt: string;
  communityId: number;
  communityName: string;
  authorName: string;
}

interface SurveyFeedItem {
  feedType: 'survey';
  id: number;
  title: string;
  topicTag: string;
  tier: string;
  status: string;
  createdAt: string;
}

type FeedItem = MediaFeedItem | ProposalFeedItem | SurveyFeedItem;

interface FeedResponse {
  items: FeedItem[];
  nextCursor: number | null;
}

type Filter = 'all' | 'proposal' | 'survey' | 'podcast' | 'video';



function formatDuration(durationS: string | null): string {
  if (!durationS) return '';
  const n = parseFloat(durationS);
  if (!Number.isFinite(n) || n <= 0) return '';
  const m = Math.floor(n / 60);
  const s = Math.round(n - m * 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/* ── Shared row vocabulary ────────────────────────────────────────────── */

const ROW = 'p-5 sm:p-6 transition-colors duration-[120ms] hover:bg-sunken';
const EYEBROW = 'inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint';
const META_DATE = 'font-mono text-xs tabular-nums text-ink-faint';
const TITLE = 'font-serif text-lg sm:text-xl leading-snug';
const OPEN_LINK = 'text-sm font-medium text-kyanos hover:underline underline-offset-2';

/* Every feed row is an EntityCard: same picture, eyebrow, title, quick view
   and actions as the communities grid. The three kinds differ only in their
   verb and their badge, which is exactly what the card takes as props. */

function ProposalFeedRow({ item }: { item: ProposalFeedItem }) {
  const { t, locale } = useTranslation();
  const dateLocale = locale === 'en' ? 'en-US' : 'el-GR';
  return (
    <EntityCard
      subject="proposal"
      kindLabel={t('feed.newProposal')}
      id={item.id}
      title={item.question}
      excerpt={item.solution}
      href={`/proposals/${item.id}`}
      ctaLabel={t('feed.openProposal')}
      tag={item.communityName}
      tagHref={`/communities/${item.communityId}`}
      badge={<StatusBadge status={item.status} />}
      bookmarkKind="proposal"
      thumbnailKey={(item as { thumbnailKey?: string | null }).thumbnailKey}
      meta={
        <time dateTime={item.createdAt} className={META_DATE}>
          {new Date(item.createdAt).toLocaleDateString(dateLocale)}
        </time>
      }
    />
  );
}

function SurveyFeedRow({ item }: { item: SurveyFeedItem }) {
  const { t, locale } = useTranslation();
  const dateLocale = locale === 'en' ? 'en-US' : 'el-GR';
  const live = item.status === 'live';
  return (
    <EntityCard
      subject="survey"
      kindLabel={t('feed.newSurvey')}
      id={item.id}
      title={item.title}
      excerpt={item.topicTag}
      href={live ? `/surveys/${item.id}/take` : `/surveys/${item.id}`}
      ctaLabel={live ? t('feed.openSurvey') : t('feed.surveyResults')}
      tag={item.topicTag}
      badge={<TierBadge tier={item.tier} />}
      bookmarkKind="survey"
      thumbnailKey={(item as { thumbnailKey?: string | null }).thumbnailKey}
      meta={
        <time dateTime={item.createdAt} className={META_DATE}>
          {new Date(item.createdAt).toLocaleDateString(dateLocale)}
        </time>
      }
    />
  );
}

function MediaFeedRow({ item }: { item: MediaFeedItem }) {
  const { t, locale } = useTranslation();
  const src = `/media/${item.filePath}`;
  const thumbUrl = item.thumbPath ? `/media/${item.thumbPath}` : undefined;
  const dateLocale = locale === 'en' ? 'en-US' : 'el-GR';

  // The player belongs in the quick view, not on the card. A feed of ten
  // cards each holding a loaded <video> is a feed that cannot be scrolled.
  const player = item.kind === 'podcast' ? (
    <audio controls preload="none" src={src} className="w-full" />
  ) : (
    <video controls preload="none" src={src} poster={thumbUrl} className="max-h-96 w-full rounded-sm bg-ink" />
  );

  return (
    <EntityCard
      subject={item.kind}
      kindLabel={item.kind === 'podcast' ? t('nav.podcasts') : t('nav.videos')}
      id={item.id}
      title={item.title || item.proposalQuestion}
      excerpt={item.title ? item.proposalQuestion : item.proposalSolution}
      href={`/proposals/${item.proposalId}`}
      ctaLabel={t('feed.openProposal')}
      tag={item.communityName}
      tagHref={`/communities/${item.communityId}`}
      badge={item.isFeatured ? (
        <Badge variant="outline" className="gap-1 border-bronze bg-bronze-wash text-bronze">
          <Star className="h-3 w-3" />
          {t('media.featured')}
        </Badge>
      ) : undefined}
      bookmarkKind="media"
      thumbSrc={thumbUrl}
      detail={player}
      meta={
        <span className="flex flex-wrap items-center gap-x-2 text-xs text-ink-faint">
          {item.durationS && (
            <span className="font-mono tabular-nums">{formatDuration(item.durationS)}</span>
          )}
          {item.durationS ? <span aria-hidden="true">·</span> : null}
          <time dateTime={item.createdAt} className={META_DATE}>
            {new Date(item.createdAt).toLocaleDateString(dateLocale)}
          </time>
          <span aria-hidden="true">·</span>
          <span>{t('feed.byUploader', { uploader: item.uploaderName })}</span>
        </span>
      }
    />
  );
}

export default function FeedPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const errorToast = useErrorToast();
  const [filter, setFilter] = useState<Filter>('all');
  const [items, setItems] = useState<FeedItem[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);

  const fetchPage = useCallback(async (opts: { cursor?: number | null; reset?: boolean }) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('type', filter);
      if (opts.cursor) params.set('cursor', String(opts.cursor));
      const resp = await api.get<FeedResponse>(`/api/feed?${params.toString()}`);
      setItems(prev => opts.reset ? resp.data.items : [...prev, ...resp.data.items]);
      setCursor(resp.data.nextCursor);
      setReachedEnd(resp.data.nextCursor === null);
    } catch (err: any) {
      errorToast(t('feed.loadError'), err?.message);
    } finally {
      setLoading(false);
    }
  }, [filter, errorToast, t]);

  useEffect(() => {
    setItems([]);
    setCursor(null);
    setReachedEnd(false);
    fetchPage({ cursor: null, reset: true });
  }, [filter, fetchPage]);

  const handleShare = async (item: MediaFeedItem) => {
    const url = `${window.location.origin}/p/${item.proposalId}/${item.kind}/${item.id}`;
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try {
        await (navigator as any).share({
          title: item.proposalQuestion,
          text: item.proposalSolution?.slice(0, 200) || '',
          url,
        });
        return;
      } catch { /* fall through to clipboard */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: t('media.linkCopied') });
    } catch (err: any) {
      errorToast(t('media.copyFailed'), err?.message);
    }
  };

  const filters: Array<{ key: Filter; labelKey: string }> = [
    { key: 'all', labelKey: 'feed.filterAll' },
    { key: 'proposal', labelKey: 'feed.filterProposals' },
    { key: 'survey', labelKey: 'feed.filterSurveys' },
    { key: 'podcast', labelKey: 'feed.filterPodcast' },
    { key: 'video', labelKey: 'feed.filterVideo' },
  ];

  return (
    <AppShell
      leftRail={<DiscoveryRail />}
      rightRail={<MyAgoraRail />}
    >
      <div className="pb-8">
        {/* ── Page head: big serif statement over a quiet standfirst ── */}
        <header className="pt-4 sm:pt-8">
          <h1 className="text-4xl leading-[1.1] sm:text-5xl">{t('feed.title')}</h1>
          <p className="mb-0 mt-3 max-w-[60ch] text-base text-ink-soft">{t('feed.subtitle')}</p>
        </header>

        <GuideCard />

        {/* ── Underline tab rail ── */}
        <div className="mt-8 border-b border-line sm:mt-10" data-testid="feed-filter">
          <nav className="-mb-px flex gap-5 overflow-x-auto sm:gap-7" aria-label={t('feed.title')}>
            {filters.map(f => {
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  aria-pressed={active}
                  data-testid={`feed-filter-${f.key}`}
                  className={`shrink-0 whitespace-nowrap border-b-2 pb-2.5 text-sm transition-colors duration-[120ms] ${
                    active
                      ? 'border-ink font-medium text-ink'
                      : 'border-transparent text-ink-faint hover:text-ink-soft'
                  }`}
                >
                  {t(f.labelKey)}
                </button>
              );
            })}
          </nav>
        </div>

        {/* ── The register ── */}
        <div className="mt-6 space-y-6" data-testid="feed-list">
          {items.length === 0 && !loading && (
            <EmptyState title={t('feed.empty')} />
          )}
          {items.length > 0 && (
            /* Cards carry their own border and ground, so the old bordered
               register with dividers double-framed them and butted them
               together. Same gap as the rails — CARD_STACK is the one value. */
            <section className={CARD_STACK}>
              {items.map(item => (
                item.feedType === 'proposal' ? (
                  <ProposalFeedRow key={`p-${item.id}`} item={item} />
                ) : item.feedType === 'survey' ? (
                  <SurveyFeedRow key={`s-${item.id}`} item={item} />
                ) : (
                  <MediaFeedRow key={`m-${item.id}`} item={item} />
                )
              ))}
            </section>
          )}
          {loading && (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-ink-faint" />
            </div>
          )}
          {!loading && !reachedEnd && cursor !== null && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => fetchPage({ cursor, reset: false })}
                data-testid="feed-load-more"
                className="rounded border border-ink px-4 py-2 text-sm font-medium text-ink transition-colors duration-[120ms] hover:bg-sunken"
              >
                {t('feed.loadMore')}
              </button>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
