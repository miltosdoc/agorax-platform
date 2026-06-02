/**
 * Compact media preview shown on the proposal Overview tab.
 *
 * Surfaces the featured podcast + video for the proposal (or, when no
 * row is featured, the most recent published one of each kind). Each
 * tile has an inline player and a share button. The full gallery,
 * scripts, and upload UI live in the dedicated Media tab — this is
 * the at-a-glance surface.
 *
 * If the proposal has no published media at all, the component
 * renders nothing.
 */

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useErrorToast } from '@/hooks/use-error-toast';
import { useTranslation } from '@/hooks/use-translation';
import { api } from '@/lib/api';
import { Mic, Video, Share2, Star } from 'lucide-react';

interface MediaRow {
  id: number;
  proposalId: number;
  uploaderId: number;
  kind: 'podcast' | 'video';
  filePath: string;
  thumbPath: string | null;
  mimeType: string;
  sizeBytes: number;
  durationS: string | null;
  status: 'published' | 'hidden';
  isFeatured: boolean;
  createdAt: string;
}

interface Props {
  proposalId: number;
}

function pickHero(items: MediaRow[], kind: 'podcast' | 'video'): MediaRow | null {
  const pool = items.filter(m => m.kind === kind && m.status === 'published');
  if (pool.length === 0) return null;
  const featured = pool.find(m => m.isFeatured);
  return featured ?? pool[0];
}

function formatDuration(durationS: string | null): string {
  if (!durationS) return '';
  const n = parseFloat(durationS);
  if (!Number.isFinite(n) || n <= 0) return '';
  const m = Math.floor(n / 60);
  const s = Math.round(n - m * 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function MediaTile({ media }: { media: MediaRow }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const errorToast = useErrorToast();
  const Icon = media.kind === 'podcast' ? Mic : Video;
  const mediaUrl = `/media/${media.filePath}`;
  const thumbUrl = media.thumbPath ? `/media/${media.thumbPath}` : undefined;

  const handleShare = async () => {
    const url = `${window.location.origin}/p/${media.proposalId}/${media.kind}/${media.id}`;
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try {
        await (navigator as any).share({ url });
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

  return (
    <div className="border rounded-lg p-3 space-y-2" data-testid={`overview-media-${media.kind}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <Icon className="w-4 h-4" />
          <span className="font-medium">
            {media.kind === 'podcast' ? t('media.kindPodcast') : t('media.kindVideoShort')}
          </span>
          {media.isFeatured && (
            <Badge variant="default" className="bg-amber-500">
              <Star className="w-3 h-3 mr-1" />
              {t('media.featured')}
            </Badge>
          )}
          {formatDuration(media.durationS) && (
            <span className="text-xs text-muted-foreground">{formatDuration(media.durationS)}</span>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleShare}
          data-testid={`overview-share-${media.kind}`}
        >
          <Share2 className="w-3 h-3 mr-1" />
          {t('media.share')}
        </Button>
      </div>

      {media.kind === 'podcast' ? (
        <audio controls preload="metadata" src={mediaUrl} className="w-full" />
      ) : (
        <video
          controls
          preload="metadata"
          src={mediaUrl}
          poster={thumbUrl}
          className="w-full max-h-80 bg-black rounded"
        />
      )}
    </div>
  );
}

export function ProposalMediaPreview({ proposalId }: Props) {
  const { t } = useTranslation();
  const [items, setItems] = useState<MediaRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const resp = await api.get<MediaRow[]>(`/api/proposals/${proposalId}/media`);
      setItems(resp.data);
    } catch {
      setItems([]);
    }
  }, [proposalId]);

  useEffect(() => {
    refresh().finally(() => setLoaded(true));
  }, [refresh]);

  const podcast = pickHero(items, 'podcast');
  const video = pickHero(items, 'video');

  if (!loaded) return null;
  if (!podcast && !video) return null;

  return (
    <div className="space-y-3" data-testid="overview-media-preview">
      <h4 className="text-sm font-medium text-muted-foreground">{t('media.overviewHeading')}</h4>
      <div className="grid gap-3 md:grid-cols-2">
        {podcast && <MediaTile media={podcast} />}
        {video && <MediaTile media={video} />}
      </div>
    </div>
  );
}
