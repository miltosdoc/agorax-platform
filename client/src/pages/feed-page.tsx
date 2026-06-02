/**
 * Global feed of user-produced podcasts and video teasers — newest first.
 *
 * Each card shows the proposal title, community, uploader, inline player,
 * share button, and a "Read full proposal" link. The feed sources its rows
 * from /api/feed, which already filters to published rows and sorts
 * featured-first then newest. Pagination is cursor-based.
 */

import { useEffect, useState, useCallback } from 'react';
import { Link } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useErrorToast } from '@/hooks/use-error-toast';
import AppShell from '@/components/layout/AppShell';
import { Mic, Video, Share2, Star, Loader2 } from 'lucide-react';

interface FeedItem {
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

interface FeedResponse {
  items: FeedItem[];
  nextCursor: number | null;
}

type Filter = 'all' | 'podcast' | 'video';

function formatDuration(durationS: string | null): string {
  if (!durationS) return '';
  const n = parseFloat(durationS);
  if (!Number.isFinite(n) || n <= 0) return '';
  const m = Math.floor(n / 60);
  const s = Math.round(n - m * 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function FeedItemCard({ item, onShare }: { item: FeedItem; onShare: (item: FeedItem) => void }) {
  const Icon = item.kind === 'podcast' ? Mic : Video;
  const mediaUrl = `/media/${item.filePath}`;
  const thumbUrl = item.thumbPath ? `/media/${item.thumbPath}` : undefined;
  const created = new Date(item.createdAt).toLocaleDateString('el-GR');

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
                Προτεινόμενο
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
            από {item.uploaderName}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onShare(item)}
              data-testid={`feed-share-${item.id}`}
            >
              <Share2 className="w-3 h-3 mr-1" />
              Κοινοποίηση
            </Button>
            <Link href={`/proposals/${item.proposalId}`}>
              <Button size="sm" variant="default" data-testid={`feed-open-${item.id}`}>
                Διαβάστε & ψηφίστε
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function FeedPage() {
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
      errorToast('Σφάλμα φόρτωσης', err?.message);
    } finally {
      setLoading(false);
    }
  }, [filter, errorToast]);

  useEffect(() => {
    setItems([]);
    setCursor(null);
    setReachedEnd(false);
    fetchPage({ cursor: null, reset: true });
  }, [filter, fetchPage]);

  const handleShare = async (item: FeedItem) => {
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
      toast({ title: 'Σύνδεσμος αντιγράφηκε' });
    } catch (err: any) {
      errorToast('Η αντιγραφή απέτυχε', err?.message);
    }
  };

  const filters: Array<{ key: Filter; label: string }> = [
    { key: 'all', label: 'Όλα' },
    { key: 'podcast', label: 'Podcast' },
    { key: 'video', label: 'Βίντεο' },
  ];

  return (
    <AppShell breadcrumb={[{ label: 'Ροή' }]}>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold mb-1">Ροή AgoraX</h1>
          <p className="text-sm text-muted-foreground">
            Σύντομα podcast και βίντεο από προτάσεις σε διαβούλευση. Επιλέξτε
            μια πρόταση για να διαβάσετε, να συζητήσετε και να ψηφίσετε.
          </p>
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
              {f.label}
            </Button>
          ))}
        </div>

        <div className="space-y-4" data-testid="feed-list">
          {items.length === 0 && !loading && (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                Δεν υπάρχουν ακόμη ανεβασμένα media. Από μια πρόταση, ανοίξτε
                το Media Studio για να δημιουργήσετε ένα podcast ή βίντεο.
              </CardContent>
            </Card>
          )}
          {items.map(item => (
            <FeedItemCard key={item.id} item={item} onShare={handleShare} />
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
                Περισσότερα
              </Button>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
