/**
 * MediaStudioPanel — author/contributor workflow for proposal podcasts
 * and short video teasers.
 *
 * Two cards (Podcast / Video Teaser):
 *  • "Generate script" pulls a Greek script from the server using the
 *    proposal text + top arguments. The text is editable so the user can
 *    tweak it before pasting into NotebookLM / ElevenLabs / similar.
 *  • Copy-to-clipboard.
 *  • Upload the resulting MP3 / MP4.
 *
 * Below the two cards: gallery of all media attached to the proposal.
 * The proposal author can feature one entry per kind, hide, or delete;
 * uploaders can hide or delete their own row.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useErrorToast } from '@/hooks/use-error-toast';
import { useAuth } from '@/hooks/use-auth';
import { useTranslation } from '@/hooks/use-translation';
import { api, ApiError } from '@/lib/api';
import { Mic, Video, Copy, Upload, Star, EyeOff, Trash2, Loader2, Share2 } from 'lucide-react';

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

interface ScriptResponse {
  proposalId: number;
  kind: 'podcast' | 'video';
  language: 'el';
  script: string;
  source?: 'llm' | 'template';
}

interface MediaStudioPanelProps {
  proposalId: number;
  userIsAuthor: boolean;
}

const KIND_CONFIG = {
  podcast: {
    icon: Mic,
    titleKey: 'media.podcastTitle',
    descriptionKey: 'media.podcastDescription',
    scriptHintKey: 'media.podcastScriptHint',
    accept: 'audio/mpeg,audio/mp3,audio/mp4,audio/x-m4a,.mp3,.m4a',
  },
  video: {
    icon: Video,
    titleKey: 'media.videoTitle',
    descriptionKey: 'media.videoDescription',
    scriptHintKey: 'media.videoScriptHint',
    accept: 'video/mp4,video/quicktime,.mp4,.mov',
  },
} as const;

function formatDuration(durationS: string | null): string {
  if (!durationS) return '';
  const n = parseFloat(durationS);
  if (!Number.isFinite(n) || n <= 0) return '';
  const m = Math.floor(n / 60);
  const s = Math.round(n - m * 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes)) return '';
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

async function uploadMultipart(url: string, formData: FormData): Promise<MediaRow> {
  const csrf = readCsrfCookie();
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: csrf ? { 'X-CSRF-Token': csrf } : {},
    body: formData,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const json = await res.json();
      msg = json.message || msg;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return await res.json();
}

function readCsrfCookie(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  for (const part of document.cookie.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === 'agorax_csrf') return decodeURIComponent(v.join('='));
  }
  return undefined;
}

function MediaKindCard(props: {
  proposalId: number;
  kind: 'podcast' | 'video';
  onUploaded: () => void;
}) {
  const { proposalId, kind, onUploaded } = props;
  const cfg = KIND_CONFIG[kind];
  const Icon = cfg.icon;
  const { t } = useTranslation();
  const { toast } = useToast();
  const errorToast = useErrorToast();
  const [script, setScript] = useState('');
  const [source, setSource] = useState<'llm' | 'template' | null>(null);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [includeAmendments, setIncludeAmendments] = useState(false);
  const [includeThreads, setIncludeThreads] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const include: string[] = [];
      if (includeAmendments) include.push('amendments');
      if (includeThreads) include.push('threads');
      const qs = include.length ? `?include=${include.join(',')}` : '';
      const resp = await api.get<ScriptResponse>(`/api/proposals/${proposalId}/scripts/${kind}${qs}`);
      setScript(resp.data.script);
      setSource(resp.data.source ?? null);
    } catch (err: any) {
      errorToast(t('media.scriptGenError'), err?.message || t('media.tryAgain'));
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!script) return;
    try {
      await navigator.clipboard.writeText(script);
      toast({ title: t('media.copiedToClipboard') });
    } catch (err: any) {
      errorToast(t('media.copyFailed'), err?.message);
    }
  };

  const handleUploadClick = () => fileRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('kind', kind);
      fd.append('file', file);
      await uploadMultipart(`/api/proposals/${proposalId}/media`, fd);
      toast({ title: t('media.uploadSuccess'), description: file.name });
      onUploaded();
    } catch (err: any) {
      errorToast(t('media.uploadFailed'), err?.message || t('media.tryAgain'));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Card data-testid={`media-card-${kind}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="w-5 h-5" />
          {t(cfg.titleKey)}
        </CardTitle>
        <CardDescription>{t(cfg.descriptionKey)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="text-xs text-muted-foreground">{t('media.includeLabel')}</span>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={includeAmendments}
              onCheckedChange={(v) => setIncludeAmendments(v === true)}
              data-testid={`media-include-amendments-${kind}`}
            />
            <span>{t('media.includeAmendments')}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={includeThreads}
              onCheckedChange={(v) => setIncludeThreads(v === true)}
              data-testid={`media-include-threads-${kind}`}
            />
            <span>{t('media.includeThreads')}</span>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            data-testid={`media-generate-${kind}`}
          >
            {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {script ? t('media.regenerate') : t('media.generate')}
          </Button>
          {script && (
            <Button type="button" variant="outline" onClick={handleCopy} data-testid={`media-copy-${kind}`}>
              <Copy className="w-4 h-4 mr-2" />
              {t('media.copyScript')}
            </Button>
          )}
        </div>
        <Textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder={t('media.scriptPlaceholder')}
          rows={10}
          className="font-mono text-xs"
          data-testid={`media-script-${kind}`}
        />
        {script && (
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <p className="text-xs text-muted-foreground flex-1">{t(cfg.scriptHintKey)}</p>
            {source && (
              <Badge variant="outline" className="text-xs">
                {source === 'llm' ? t('media.sourceLlm') : t('media.sourceTemplate')}
              </Badge>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
          <input
            ref={fileRef}
            type="file"
            accept={cfg.accept}
            className="hidden"
            onChange={handleFileChange}
            data-testid={`media-file-${kind}`}
          />
          <Button
            type="button"
            variant="default"
            onClick={handleUploadClick}
            disabled={uploading}
            data-testid={`media-upload-${kind}`}
          >
            {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            {kind === 'podcast' ? t('media.uploadMp3') : t('media.uploadMp4')}
          </Button>
          <span className="text-xs text-muted-foreground">{t('media.sizeLimit')}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function MediaGalleryItem(props: {
  media: MediaRow;
  userIsAuthor: boolean;
  currentUserId: number | undefined;
  onChange: () => void;
}) {
  const { media, userIsAuthor, currentUserId, onChange } = props;
  const { t } = useTranslation();
  const { toast } = useToast();
  const errorToast = useErrorToast();
  const [acting, setActing] = useState(false);
  const isUploader = currentUserId === media.uploaderId;
  const canCurate = userIsAuthor || isUploader;

  const handleFeature = async () => {
    setActing(true);
    try {
      await api.patch(`/api/proposals/${media.proposalId}/media/${media.id}`, {
        isFeatured: !media.isFeatured,
      });
      toast({ title: media.isFeatured ? t('media.featuredOff') : t('media.featuredOn') });
      onChange();
    } catch (err: any) {
      errorToast(t('media.errorGeneric'), err?.message);
    } finally {
      setActing(false);
    }
  };

  const handleHide = async () => {
    setActing(true);
    try {
      await api.patch(`/api/proposals/${media.proposalId}/media/${media.id}`, {
        status: media.status === 'hidden' ? 'published' : 'hidden',
      });
      toast({ title: media.status === 'hidden' ? t('media.wasPublished') : t('media.wasHidden') });
      onChange();
    } catch (err: any) {
      errorToast(t('media.errorGeneric'), err?.message);
    } finally {
      setActing(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t('media.deleteConfirm'))) return;
    setActing(true);
    try {
      await api.delete(`/api/proposals/${media.proposalId}/media/${media.id}`);
      toast({ title: t('media.deleted') });
      onChange();
    } catch (err: any) {
      errorToast(t('media.errorGeneric'), err?.message);
    } finally {
      setActing(false);
    }
  };

  const handleCopyShare = async () => {
    const url = `${window.location.origin}/p/${media.proposalId}/${media.kind}/${media.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: t('media.linkCopied') });
    } catch (err: any) {
      errorToast(t('media.copyFailed'), err?.message);
    }
  };

  const Icon = media.kind === 'podcast' ? Mic : Video;
  const mediaUrl = `/media/${media.filePath}`;
  const thumbUrl = media.thumbPath ? `/media/${media.thumbPath}` : undefined;

  return (
    <div
      className={`border rounded-lg p-3 ${media.status === 'hidden' ? 'opacity-60' : ''}`}
      data-testid={`media-item-${media.id}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 text-sm">
          <Icon className="w-4 h-4" />
          <span className="font-medium">
            {media.kind === 'podcast' ? t('media.kindPodcast') : t('media.kindVideo')}
          </span>
          {media.isFeatured && (
            <Badge variant="default" className="bg-amber-500">
              <Star className="w-3 h-3 mr-1" />
              {t('media.featured')}
            </Badge>
          )}
          {media.status === 'hidden' && (
            <Badge variant="outline">{t('media.hidden')}</Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {formatDuration(media.durationS)} · {formatSize(media.sizeBytes)}
          </span>
        </div>
      </div>

      {media.kind === 'podcast' ? (
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

      <div className="flex flex-wrap gap-2 mt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCopyShare}
          data-testid={`media-share-${media.id}`}
        >
          <Share2 className="w-3 h-3 mr-1" />
          {t('media.copyLink')}
        </Button>

        {userIsAuthor && (
          <Button
            type="button"
            variant={media.isFeatured ? 'default' : 'outline'}
            size="sm"
            onClick={handleFeature}
            disabled={acting || media.status === 'hidden'}
            data-testid={`media-feature-${media.id}`}
          >
            <Star className="w-3 h-3 mr-1" />
            {media.isFeatured ? t('media.unfeature') : t('media.feature')}
          </Button>
        )}

        {canCurate && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleHide}
            disabled={acting}
            data-testid={`media-hide-${media.id}`}
          >
            <EyeOff className="w-3 h-3 mr-1" />
            {media.status === 'hidden' ? t('media.unhide') : t('media.hide')}
          </Button>
        )}

        {canCurate && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDelete}
            disabled={acting}
            data-testid={`media-delete-${media.id}`}
          >
            <Trash2 className="w-3 h-3 mr-1" />
            {t('media.delete')}
          </Button>
        )}
      </div>
    </div>
  );
}

export function MediaStudioPanel({ proposalId, userIsAuthor }: MediaStudioPanelProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [items, setItems] = useState<MediaRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const resp = await api.get<MediaRow[]>(`/api/proposals/${proposalId}/media`);
      setItems(resp.data);
    } catch {
      setItems([]);
    }
  }, [proposalId]);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('media.studio')}</CardTitle>
          <CardDescription>{t('media.studioDescription')}</CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <MediaKindCard proposalId={proposalId} kind="podcast" onUploaded={refresh} />
        <MediaKindCard proposalId={proposalId} kind="video" onUploaded={refresh} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('media.gallery')}</CardTitle>
          <CardDescription>
            {t('media.galleryAllUploaded')}{' '}
            {userIsAuthor ? t('media.galleryAuthorHint') : t('media.galleryViewerHint')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && <p className="text-sm text-muted-foreground">{t('media.loading')}</p>}
          {!loading && items.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('media.galleryEmpty')}</p>
          )}
          {items.map((m) => (
            <MediaGalleryItem
              key={m.id}
              media={m}
              userIsAuthor={userIsAuthor}
              currentUserId={user?.id}
              onChange={refresh}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
