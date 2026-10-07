/**
 * Community Library — media posted inside a community (audio, video,
 * documents), with clear authorship and dates. Pinned items
 * render first with a pin badge; founder/admins pin and curate, members
 * upload, uploaders manage their own items.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { api } from '@/lib/api';
import { uploadProposalFile } from '@/lib/upload-media';
import { FileAudio, FileText, FileUp, FileVideo, Pin, PinOff, Trash2, Upload, ChevronDown } from 'lucide-react';
import { MediaUploadDialog } from '@/components/media/MediaUploadDialog';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';

type LibraryKind = 'podcast' | 'video' | 'document';

interface LibraryItem {
  id: number;
  communityId: number;
  uploaderId: number;
  kind: LibraryKind;
  title: string;
  description: string | null;
  filePath: string;
  thumbPath: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  status: 'published' | 'hidden';
  pinned: boolean;
  createdAt: string;
  uploaderName?: string | null;
  uploaderUsername?: string | null;
}

function kindForFile(file: File): LibraryKind {
  if (file.type.startsWith('audio/')) return 'podcast';
  if (file.type.startsWith('video/')) return 'video';
  return 'document';
}

/** Download name keeps the stored file's extension, so e.g. an Anki deck
 *  saves as "Title.apkg" and opens in Anki on double-click. */
function downloadName(item: LibraryItem): string {
  const ext = item.filePath.slice(item.filePath.lastIndexOf('.'));
  return item.title.toLowerCase().endsWith(ext.toLowerCase()) ? item.title : item.title + ext;
}

const KIND_ICON: Record<LibraryKind, typeof FileAudio> = {
  podcast: FileAudio,
  video: FileVideo,
  document: FileText,
};

interface Props {
  communityId: number;
  isMember: boolean;
  canManage: boolean;
  contentHidden: boolean;
}

export function CommunityLibrary({ communityId, isMember, canManage, contentHidden }: Props) {
  const { t, locale } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState<LibraryKind | 'all'>('all');
  const [title, setTitle] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [loadError, setLoadError] = useState(false);
  const load = useCallback(async () => {
    try {
      const res = await api.get<{ items: LibraryItem[] }>(`/api/communities/${communityId}/media`);
      setItems(res.data.items);
      setLoadError(false);
    } catch {
      setItems([]);
      setLoadError(true);
    }
  }, [communityId]);

  useEffect(() => { if (!contentHidden) void load(); }, [load, contentHidden]);

  useEffect(() => {
    if (!items?.length || !/^#library-item-\d+$/.test(window.location.hash)) return;
    // Library cards arrive after the route; native hash scrolling happens
    // before the target exists on a first visit.
    const target = document.getElementById(window.location.hash.slice(1));
    target?.scrollIntoView({ block: 'center' });
  }, [items]);

  if (contentHidden) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-muted-foreground">{t('library.membersOnly')}</p>
        </CardContent>
      </Card>
    );
  }

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast({ title: t('library.fileRequired'), variant: 'destructive' });
      return;
    }
    if (!title.trim()) {
      toast({ title: t('library.titleRequired'), variant: 'destructive' });
      return;
    }
    const kind = kindForFile(file);
    const maxMb = kind === 'document' ? 25 : 120;
    if (!file.size) {
      toast({ title: t('redesignMedia.emptyFile'), variant: 'destructive' });
      return;
    }
    if (file.size > maxMb * 1024 * 1024) {
      toast({ title: t('redesignMedia.fileTooLarge', { limit: maxMb }), variant: 'destructive' });
      return;
    }
    const allowed = kind === 'document' ? /\.(pdf|doc|docx|odt|txt|apkg)$/i : kind === 'video' ? /\.(mp4|mov)$/i : /\.(mp3|m4a)$/i;
    if (!allowed.test(file.name)) {
      toast({ title: t('redesignMedia.invalidFile'), variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      await uploadProposalFile(file, `/api/communities/${communityId}/media?kind=${kind}`, title.trim());
      toast({ title: t('library.uploadSuccess') });
      setTitle('');
      setFileName(null);
      if (fileRef.current) fileRef.current.value = '';
      await load();
      await queryClient.invalidateQueries({ queryKey: ['/api/feed'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/activity-feed'] });
    } catch (err: any) {
      toast({ title: t('library.uploadFailed'), description: err?.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  }

  async function togglePin(item: LibraryItem) {
    try {
      await api.patch(`/api/communities/${communityId}/media/${item.id}`, { pinned: !item.pinned });
      await load();
      await queryClient.invalidateQueries({ queryKey: ['/api/feed'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/activity-feed'] });
    } catch (err: any) {
      toast({ title: t('library.actionFailed'), description: err?.message, variant: 'destructive' });
    }
  }

  async function remove(item: LibraryItem) {
    if (!window.confirm(t('library.deleteConfirm'))) return;
    try {
      await api.delete(`/api/communities/${communityId}/media/${item.id}`);
      await load();
      await queryClient.invalidateQueries({ queryKey: ['/api/feed'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/activity-feed'] });
    } catch (err: any) {
      toast({ title: t('library.actionFailed'), description: err?.message, variant: 'destructive' });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="mb-0 text-base text-ink-soft">{t('redesignMedia.libraryIntro')}</p>
        {isMember && <MediaUploadDialog communityId={communityId} onUploaded={() => { void load(); }} />}
      </div>
      {isMember && (
        <details className="group rounded-xl border border-line bg-surface">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-sm font-semibold text-ink marker:content-none"><span className="flex items-center gap-2"><FileUp className="h-4 w-4" />{t('redesignMedia.uploadDocument')}</span><ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" /></summary>
        <Card className="rounded-t-none border-0 border-t border-line shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Upload className="h-4 w-4" /> {t('redesignMedia.uploadDocument')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{t('redesignMedia.documentLimit')}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="library-title">{t('library.itemTitle')}</Label>
                <Input
                  id="library-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                  placeholder={t('library.itemTitlePlaceholder')}
                  data-testid="library-title-input"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="library-file">{t('library.file')}</Label>
                {/* Hidden native input: its button text renders in the
                    browser's language, not the app locale. */}
                <input
                  id="library-file"
                  type="file"
                  ref={fileRef}
                  accept=".pdf,.doc,.docx,.odt,.txt,.apkg"
                  className="hidden"
                  onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
                  data-testid="library-file-input"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start font-normal"
                  onClick={() => fileRef.current?.click()}
                  data-testid="library-file-button"
                >
                  <FileUp className="h-4 w-4 mr-2 shrink-0" />
                  <span className="truncate">{fileName ?? t('library.chooseFile')}</span>
                </Button>
              </div>
            </div>
            <Button onClick={handleUpload} disabled={uploading} data-testid="library-upload-button">
              {uploading ? t('library.uploading') : t('library.uploadButton')}
            </Button>
          </CardContent>
        </Card>
        </details>
      )}
      {items && items.length > 0 && <div className="flex flex-wrap gap-2" aria-label={t('redesignMedia.kind')}>
        {(['all', 'video', 'podcast', 'document'] as const).map((kind) => <button key={kind} type="button" aria-pressed={filter === kind} onClick={() => setFilter(kind)} className={`min-h-11 rounded-full border px-4 text-sm font-medium ${filter === kind ? 'border-kyanos bg-kyanos-wash text-kyanos' : 'border-line bg-surface text-ink-soft hover:bg-sunken'}`}>{t(kind === 'all' ? 'redesignMedia.all' : kind === 'video' ? 'nav.videos' : kind === 'podcast' ? 'nav.podcasts' : 'redesignMedia.documents')}</button>)}
      </div>}

      {items === null ? (
        <p className="text-sm text-muted-foreground">{t('library.loading')}</p>
      ) : loadError ? (
        <Card>
          <CardContent className="flex items-center justify-between gap-3 py-6">
            <p className="text-muted-foreground">{t('library.loadError')}</p>
            <Button variant="outline" size="sm" onClick={() => load()}>{t('library.retry')}</Button>
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-muted-foreground">{t('library.empty')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3" data-testid="library-list">
          {items.filter((item) => filter === 'all' || item.kind === filter).length === 0 && <p className="rounded-xl border border-dashed border-line p-6 text-center text-ink-faint">{t('redesignMedia.empty')}</p>}
          {items.filter((item) => filter === 'all' || item.kind === filter).map((item) => {
            const Icon = KIND_ICON[item.kind] ?? FileText;
            const src = `/media/${item.filePath}`;
            const canCurateItem = canManage || item.uploaderId === user?.id;
            return (
              <Card key={item.id} id={`library-item-${item.id}`} className="overflow-hidden rounded-xl border-line bg-surface shadow-none" data-testid={`library-item-${item.id}`}>
                <CardContent className="space-y-4 p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="text-lg font-semibold leading-snug text-ink">{item.title}</span>
                      {item.pinned && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-primary/10 px-1.5 py-0.5 text-xs text-primary" data-testid={`library-pinned-${item.id}`}>
                          <Pin className="h-3 w-3" /> {t('library.pinned')}
                        </span>
                      )}
                      {item.status === 'hidden' && (
                        <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          {t('library.hidden')}
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {canManage && (
                        <Button variant="ghost" size="sm" onClick={() => togglePin(item)} aria-label={t(item.pinned ? 'redesignMedia.unpin' : 'redesignMedia.pin')} title={t(item.pinned ? 'redesignMedia.unpin' : 'redesignMedia.pin')} data-testid={`library-pin-${item.id}`}>
                          {item.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                        </Button>
                      )}
                      {canCurateItem && (
                        <Button variant="ghost" size="sm" onClick={() => remove(item)} aria-label={t('redesignMedia.remove')} title={t('redesignMedia.remove')} data-testid={`library-delete-${item.id}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="m-0 flex flex-wrap items-center gap-x-2 text-sm text-ink-faint" data-testid={`library-provenance-${item.id}`}>
                    <span className="font-medium text-ink-soft">{item.uploaderName || t('redesignMedia.authorUnknown')}</span>
                    {item.uploaderUsername && <span>@{item.uploaderUsername}</span>}
                    <time dateTime={item.createdAt}>· {new Date(item.createdAt).toLocaleString(locale === 'en' ? 'en-GB' : 'el-GR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
                  </p>
                  {item.kind === 'podcast' && (
                    <audio controls preload="none" className="w-full" src={src} />
                  )}
                  {item.kind === 'video' && (
                    <video
                      controls
                      playsInline
                      preload="none"
                      aria-label={item.title}
                      className="aspect-video max-h-[520px] w-full rounded-xl bg-black object-contain"
                      src={src}
                      poster={item.thumbPath ? `/media/${item.thumbPath}` : undefined}
                    />
                  )}
                  {item.kind === 'document' && (
                    <a
                      href={src}
                      download={downloadName(item)}
                      className="inline-flex items-center gap-1.5 text-sm text-primary underline underline-offset-2"
                    >
                      <FileText className="h-4 w-4" /> {t('library.download')}
                    </a>
                  )}
                  {item.description && <p className="m-0 text-base leading-relaxed text-ink-soft">{item.description}</p>}
                  {item.sizeBytes ? <p className="m-0 text-sm text-ink-faint">{(item.sizeBytes / 1024 / 1024).toFixed(1)} MB</p> : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
