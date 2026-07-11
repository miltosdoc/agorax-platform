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

function ProposalFeedRow({ item }: { item: ProposalFeedItem }) {
  const { t, locale } = useTranslation();
  const dateLocale = locale === 'en' ? 'en-US' : 'el-GR';
  return (
    <article data-testid={`feed-proposal-${item.id}`} className={ROW}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className={EYEBROW}>
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
          {t('feed.newProposal')}
        </span>
        <Link
          href={`/communities/${item.communityId}`}
          className="text-xs text-kyanos hover:underline underline-offset-2"
        >
          {item.communityName}
        </Link>
        <span className="text-xs text-ink-faint" aria-hidden="true">·</span>
        <time dateTime={item.createdAt} className={META_DATE}>
          {new Date(item.createdAt).toLocaleDateString(dateLocale)}
        </time>
        <span className="ml-auto">
          <StatusBadge status={item.status} />
        </span>
      </div>

      <Link href={`/proposals/${item.id}`} className="mt-2.5 block">
        <h3 className={`${TITLE} decoration-1 underline-offset-2 hover:underline`}>{item.question}</h3>
      </Link>

      {item.solution && (
        <p className="mb-0 mt-1.5 line-clamp-2 text-sm leading-relaxed text-ink-soft">{item.solution}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
        <ShareButton url={`/proposals/${item.id}`} title={item.question} text={item.solution} variant="ghost" />
        <Link href={`/proposals/${item.id}`} className={OPEN_LINK}>
          {t('feed.openProposal')}
        </Link>
      </div>
    </article>
  );
}

function SurveyFeedRow({ item }: { item: SurveyFeedItem }) {
  const { t, locale } = useTranslation();
  const dateLocale = locale === 'en' ? 'en-US' : 'el-GR';
  return (
    <article data-testid={`feed-survey-${item.id}`} className={ROW}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className={EYEBROW}>
          <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
          {t('feed.newSurvey')}
        </span>
        <time dateTime={item.createdAt} className={META_DATE}>
          {new Date(item.createdAt).toLocaleDateString(dateLocale)}
        </time>
        <span className="ml-auto">
          <TierBadge tier={item.tier} />
        </span>
      </div>

      <Link href={`/surveys/${item.id}`} className="mt-2.5 block">
        <h3 className={`${TITLE} decoration-1 underline-offset-2 hover:underline`}>{item.title}</h3>
      </Link>

      <p className="mb-0 mt-1.5 text-sm text-ink-soft">{item.topicTag}</p>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
        <ShareButton url={`/surveys/${item.id}`} title={item.title} text={item.topicTag} variant="ghost" />
        {item.status === 'live' ? (
          <Link
            href={`/surveys/${item.id}/take`}
            className="rounded bg-ink px-3 py-1.5 text-sm font-medium text-paper transition-colors duration-[120ms] hover:bg-kyanos-deep"
          >
            {t('feed.openSurvey')}
          </Link>
        ) : (
          <Link href={`/surveys/${item.id}`} className={OPEN_LINK}>
            {t('feed.surveyResults')}
          </Link>
        )}
      </div>
    </article>
  );
}

function MediaFeedRow({ item, onShare }: { item: MediaFeedItem; onShare: (item: MediaFeedItem) => void }) {
  const { t, locale } = useTranslation();
  const Icon = item.kind === 'podcast' ? Mic : Video;
  const mediaUrl = `/media/${item.filePath}`;
  const thumbUrl = item.thumbPath ? `/media/${item.thumbPath}` : undefined;
  const dateLocale = locale === 'en' ? 'en-US' : 'el-GR';
  const created = new Date(item.createdAt).toLocaleDateString(dateLocale);
  const byline = t('feed.byUploader', { uploader: item.uploaderName });

  return (
    <article data-testid={`feed-item-${item.id}`} className={ROW}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Icon className="h-3.5 w-3.5 text-ink-faint" aria-hidden="true" />
        <Link
          href={`/communities/${item.communityId}`}
          className="text-xs text-kyanos hover:underline underline-offset-2"
        >
          {item.communityName}
        </Link>
        <span className="text-xs text-ink-faint" aria-hidden="true">·</span>
        <time dateTime={item.createdAt} className={META_DATE}>{created}</time>
        {item.isFeatured && (
          <span className="ml-auto">
            <Badge variant="outline" className="border-bronze text-bronze bg-bronze-wash gap-1">
              <Star className="w-3 h-3" />
              {t('media.featured')}
            </Badge>
          </span>
        )}
      </div>

      <Link href={`/proposals/${item.proposalId}`} className="mt-2.5 block">
        <h3 className={`${TITLE} decoration-1 underline-offset-2 hover:underline`}>
          {item.title || item.proposalQuestion}
        </h3>
        {item.title && (
          <p className="mb-0 mt-1 text-sm text-ink-soft">{item.proposalQuestion}</p>
        )}
      </Link>

      <div className="mt-4">
        {item.kind === 'podcast' ? (
          <audio controls preload="metadata" src={mediaUrl} className="w-full" />
        ) : (
          <video
            controls
            preload="metadata"
            src={mediaUrl}
            poster={thumbUrl}
            className="w-full max-h-96 rounded-sm bg-ink"
          />
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="text-xs text-ink-faint">
          {item.durationS && (
            <span className="font-mono tabular-nums">{formatDuration(item.durationS)}</span>
          )}
          {item.durationS ? ' · ' : ''}
          {byline}
        </span>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="button"
            onClick={() => onShare(item)}
            data-testid={`feed-share-${item.id}`}
            className="inline-flex items-center gap-1.5 text-sm text-ink-soft transition-colors duration-[120ms] hover:text-ink"
          >
            <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
            {t('media.share')}
          </button>
          <Link
            href={`/proposals/${item.proposalId}`}
            className={OPEN_LINK}
            data-testid={`feed-open-${item.id}`}
          >
            {t('feed.openProposal')}
          </Link>
        </span>
      </div>
    </article>
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
    <AppShell>
      <div className="mx-auto max-w-3xl pb-8">
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
            <section className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
              {items.map(item => (
                item.feedType === 'proposal' ? (
                  <ProposalFeedRow key={`p-${item.id}`} item={item} />
                ) : item.feedType === 'survey' ? (
                  <SurveyFeedRow key={`s-${item.id}`} item={item} />
                ) : (
                  <MediaFeedRow key={`m-${item.id}`} item={item} onShare={handleShare} />
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
