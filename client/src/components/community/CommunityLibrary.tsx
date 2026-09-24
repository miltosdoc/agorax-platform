/**
 * Community Library — media posted inside a community (audio, video,
 * documents), decoupled from proposals and the global feed. Pinned items
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
import { FileAudio, FileText, FileUp, FileVideo, Pin, PinOff, Trash2, Upload } from 'lucide-react';
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
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [uploading, setUploading] = useState(false);
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
    setUploading(true);
    try {
      const kind = kindForFile(file);
      await uploadProposalFile(file, `/api/communities/${communityId}/media?kind=${kind}`, title.trim());
      toast({ title: t('library.uploadSuccess') });
      setTitle('');
      setFileName(null);
      if (fileRef.current) fileRef.current.value = '';
      await load();
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
    } catch (err: any) {
      toast({ title: t('library.actionFailed'), description: err?.message, variant: 'destructive' });
    }
  }

  async function remove(item: LibraryItem) {
    if (!window.confirm(t('library.deleteConfirm'))) return;
    try {
      await api.delete(`/api/communities/${communityId}/media/${item.id}`);
      await load();
    } catch (err: any) {
      toast({ title: t('library.actionFailed'), description: err?.message, variant: 'destructive' });
    }
  }

  return (
    <div className="space-y-4">
      {isMember && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Upload className="h-4 w-4" /> {t('library.uploadTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{t('library.uploadHint')}</p>
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
                  accept="audio/*,video/*,.mp3,.m4a,.mp4,.mov,.pdf,.doc,.docx,.odt,.txt,.apkg"
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
      )}

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
          {items.map((item) => {
            const Icon = KIND_ICON[item.kind] ?? FileText;
            const src = `/media/${item.filePath}`;
            const canCurateItem = canManage || item.uploaderId === user?.id;
            return (
              <Card key={item.id} data-testid={`library-item-${item.id}`}>
                <CardContent className="space-y-2 py-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate font-medium">{item.title}</span>
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
                        <Button variant="ghost" size="sm" onClick={() => togglePin(item)} data-testid={`library-pin-${item.id}`}>
                          {item.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                        </Button>
                      )}
                      {canCurateItem && (
                        <Button variant="ghost" size="sm" onClick={() => remove(item)} data-testid={`library-delete-${item.id}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {item.kind === 'podcast' && (
                    <audio controls preload="none" className="w-full" src={src} />
                  )}
                  {item.kind === 'video' && (
                    <video
                      controls
                      preload="none"
                      className="max-h-80 w-full rounded-sm bg-black"
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
                  <p className="text-xs text-muted-foreground">
                    {new Date(item.createdAt).toLocaleDateString()}
                    {item.sizeBytes ? ` · ${(item.sizeBytes / 1024 / 1024).toFixed(1)} MB` : ''}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
