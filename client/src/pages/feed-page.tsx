/**
 * Global activity feed — newest first across three streams:
 *   media     user-produced podcasts / video teasers (inline player, share)
 *   proposal  every proposal that entered deliberation (non-draft)
 *   survey    live & closed polls (with the community/certified tier badge)
 * /api/feed merges them by date; podcast/video filters keep the original
 * cursor-paginated media-only behavior.
 */

import { useEffect, useState, useCallback } from 'react';
import { Link } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useErrorToast } from '@/hooks/use-error-toast';
import { useTranslation } from '@/hooks/use-translation';
import AppShell from '@/components/layout/AppShell';
import { Mic, Video, Share2, Star, Loader2, FileText, BarChart3 } from 'lucide-react';

interface MediaFeedItem {
  feedType: 'media';
  id: number;
  proposalId: number;
  uploaderId: number;
  kind: 'podcast' | 'video';
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

const PROPOSAL_STATUS_LABELS: Record<string, string> = {
  review: 'Σε επικύρωση',
  author_review: 'Κρίση συγγραφέα',
  community_signal: 'Σήμα κοινότητας',
  sortition_synthesis: 'Κληρωτό σώμα',
  voting: 'Σε ψηφοφορία',
  decided: 'Αποφασίστηκε',
  archived: 'Αρχειοθετήθηκε',
};

function formatDuration(durationS: string | null): string {
  if (!durationS) return '';
  const n = parseFloat(durationS);
  if (!Number.isFinite(n) || n <= 0) return '';
  const m = Math.floor(n / 60);
  const s = Math.round(n - m * 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function ProposalFeedCard({ item }: { item: ProposalFeedItem }) {
  const { t, locale } = useTranslation();
  const dateLocale = locale === 'en' ? 'en-US' : 'el-GR';
  return (
    <Card data-testid={`feed-proposal-${item.id}`}>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
          <FileText className="w-4 h-4" />
          <Badge variant="outline">{t('feed.newProposal')}</Badge>
          <Link href={`/communities/${item.communityId}`} className="hover:underline">
            {item.communityName}
          </Link>
          <span>·</span>
          <span>{new Date(item.createdAt).toLocaleDateString(dateLocale)}</span>
          <Badge variant="secondary">{PROPOSAL_STATUS_LABELS[item.status] ?? item.status}</Badge>
        </div>
        <Link href={`/proposals/${item.id}`} className="block">
          <h3 className="text-lg font-semibold hover:underline">{item.question}</h3>
        </Link>
        {item.solution && <p className="text-sm text-muted-foreground line-clamp-2">{item.solution}</p>}
        <div className="flex justify-end">
          <Link href={`/proposals/${item.id}`}>
            <Button size="sm" variant="default">{t('feed.openProposal')}</Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function SurveyFeedCard({ item }: { item: SurveyFeedItem }) {
  const { t, locale } = useTranslation();
  const dateLocale = locale === 'en' ? 'en-US' : 'el-GR';
  return (
    <Card data-testid={`feed-survey-${item.id}`}>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
          <BarChart3 className="w-4 h-4" />
          <Badge variant="outline">{t('feed.newSurvey')}</Badge>
          {item.tier === 'certified' ? (
            <Badge className="bg-primary">Πιστοποιημένη</Badge>
          ) : (
            <Badge variant="outline" className="border-amber-400 text-amber-700 bg-amber-50">
              Κοινοτική · Ανεπίσημη
            </Badge>
          )}
          <span>{new Date(item.createdAt).toLocaleDateString(dateLocale)}</span>
        </div>
        <Link href={`/surveys/${item.id}`} className="block">
          <h3 className="text-lg font-semibold hover:underline">{item.title}</h3>
        </Link>
        <p className="text-sm text-muted-foreground">{item.topicTag}</p>
        <div className="flex justify-end gap-2">
          {item.status === 'live' ? (
            <Link href={`/surveys/${item.id}/take`}>
              <Button size="sm">{t('feed.openSurvey')}</Button>
            </Link>
          ) : (
            <Link href={`/surveys/${item.id}`}>
              <Button size="sm" variant="outline">{t('feed.surveyResults')}</Button>
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function FeedItemCard({ item, onShare }: { item: MediaFeedItem; onShare: (item: MediaFeedItem) => void }) {
  const { t, locale } = useTranslation();
  const Icon = item.kind === 'podcast' ? Mic : Video;
  const mediaUrl = `/media/${item.filePath}`;
  const thumbUrl = item.thumbPath ? `/media/${item.thumbPath}` : undefined;
  const dateLocale = locale === 'en' ? 'en-US' : 'el-GR';
  const created = new Date(item.createdAt).toLocaleDateString(dateLocale);
  const byline = t('feed.byUploader', { uploader: item.uploaderName });

  return (
    <Card data-testid={`feed-item-${item.id}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon className="w-4 h-4" />
            <Link
              href={`/communities/${item.communityId}`}
              className="hover:underline"
            >
              {item.communityName}
            </Link>
            <span>·</span>
            <span>{created}</span>
            {item.isFeatured && (
              <Badge variant="default" className="bg-amber-500">
                <Star className="w-3 h-3 mr-1" />
                {t('media.featured')}
              </Badge>
            )}
          </div>
        </div>

        <Link
          href={`/proposals/${item.proposalId}`}
          className="block"
        >
          <h3 className="text-lg font-semibold hover:underline">
            {item.proposalQuestion}
          </h3>
        </Link>

        {item.kind === 'podcast' ? (
          <audio controls preload="metadata" src={mediaUrl} className="w-full" />
        ) : (
          <video
            controls
            preload="metadata"
            src={mediaUrl}
            poster={thumbUrl}
            className="w-full max-h-96 bg-black rounded"
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            {formatDuration(item.durationS)}
            {item.durationS ? ' · ' : ''}
            {byline}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onShare(item)}
              data-testid={`feed-share-${item.id}`}
            >
              <Share2 className="w-3 h-3 mr-1" />
              {t('media.share')}
            </Button>
            <Link href={`/proposals/${item.proposalId}`}>
              <Button size="sm" variant="default" data-testid={`feed-open-${item.id}`}>
                {t('feed.openProposal')}
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
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
    <AppShell breadcrumb={[{ label: t('feed.breadcrumb') }]}>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold mb-1">{t('feed.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('feed.subtitle')}</p>
        </div>

        <div className="flex gap-2" data-testid="feed-filter">
          {filters.map(f => (
            <Button
              key={f.key}
              variant={filter === f.key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(f.key)}
              data-testid={`feed-filter-${f.key}`}
            >
              {t(f.labelKey)}
            </Button>
          ))}
        </div>

        <div className="space-y-4" data-testid="feed-list">
          {items.length === 0 && !loading && (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                {t('feed.empty')}
              </CardContent>
            </Card>
          )}
          {items.map(item => (
            item.feedType === 'proposal' ? (
              <ProposalFeedCard key={`p-${item.id}`} item={item} />
            ) : item.feedType === 'survey' ? (
              <SurveyFeedCard key={`s-${item.id}`} item={item} />
            ) : (
              <FeedItemCard key={`m-${item.id}`} item={item} onShare={handleShare} />
            )
          ))}
          {loading && (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loading && !reachedEnd && cursor !== null && (
            <div className="flex justify-center py-2">
              <Button
                variant="outline"
                onClick={() => fetchPage({ cursor, reset: false })}
                data-testid="feed-load-more"
              >
                {t('feed.loadMore')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
