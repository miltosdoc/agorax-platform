/**
 * «Συνδιασκέψεις» — the community's conference strip.
 *
 * Always visible directly under the community header (no longer buried in a
 * tab): live rooms pulse with a join button, scheduled rooms show with their
 * calendar link, admins create inline, and past calls collapse underneath.
 * The actual call experience lives on /conference/:roomId.
 */

import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { LinkedText } from '@/components/ui/linked-text';
import ShareButton from '@/components/ShareButton';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Mic, Plus, Clock, Users as UsersIcon, Video, CalendarPlus, ChevronDown, XCircle, Pencil } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { useErrorToast } from '@/hooks/use-error-toast';

interface LivekitRoom {
  id: number;
  roomName: string;
  kind: 'community' | 'sortition';
  title: string;
  description: string | null;
  createdById: number;
  status: 'scheduled' | 'active' | 'closed';
  recordingEnabled: boolean;
  scheduledAt: string | null;
  createdAt: string;
}

interface HistoryEntry extends LivekitRoom {
  closedAt: string | null;
  durationSeconds: number | null;
  participants: Array<{ userId: number; name: string; joinedAt: string; leftAt: string | null }>;
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  if (m < 1) return `${seconds}s`;
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

/**
 * `min` for the datetime-local picker: local wall-clock now, to the minute.
 * toISOString is UTC, so we shift by the zone offset first — otherwise the
 * floor lands hours off for anyone outside UTC.
 */
function localNowValue(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

/** `scheduledAt` (UTC ISO) → the wall-clock string datetime-local expects. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export interface RoomFormValues {
  title: string;
  description: string;
  when: string;
}

/**
 * The create and edit forms are the same three fields, so they're the same
 * component. `idPrefix` keeps label/input pairs unique when an edit form is
 * open next to the create form.
 */
function RoomForm({
  idPrefix,
  initial,
  busy,
  lockWhen = false,
  onSubmit,
  onCancel,
}: {
  idPrefix: string;
  initial?: RoomFormValues;
  busy: boolean;
  /** Live meetings can still be retitled, but the start time is history. */
  lockWhen?: boolean;
  onSubmit: (values: RoomFormValues) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [when, setWhen] = useState(initial?.when ?? '');

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-title`}>{t('livekit.titleLabel')}</Label>
        <Input
          id={`${idPrefix}-title`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('livekit.titlePlaceholder')}
          maxLength={200}
          data-testid="livekit-new-title"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-description`}>{t('livekit.descriptionLabel')}</Label>
        <Textarea
          id={`${idPrefix}-description`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('livekit.descriptionPlaceholder')}
          maxLength={2000}
          rows={4}
          data-testid="livekit-new-description"
        />
        <p className="text-xs text-muted-foreground">{t('livekit.descriptionHint')}</p>
      </div>

      {!lockWhen && (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-when`}>{t('livekit.whenLabel')}</Label>
          <Input
            id={`${idPrefix}-when`}
            type="datetime-local"
            value={when}
            min={localNowValue()}
            onChange={(e) => setWhen(e.target.value)}
            className="w-full sm:w-[240px]"
            data-testid="livekit-new-when"
          />
          <p className="text-xs text-muted-foreground">{t('livekit.whenHint')}</p>
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <Button
          type="button"
          onClick={() => onSubmit({ title, description, when })}
          disabled={busy || !title.trim()}
          data-testid="livekit-create"
        >
          {initial ? t('livekit.save') : when ? t('livekit.scheduleButton') : t('livekit.createButton')}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}

interface Props {
  communityId: number;
  viewerIsAdmin: boolean;
  /** Members can start conferences too — not an admin privilege. */
  viewerIsMember?: boolean;
}

export function CommunityRoomsSection({ communityId, viewerIsAdmin, viewerIsMember = false }: Props) {
  const canCreate = viewerIsAdmin || viewerIsMember;
  const { user } = useAuth();
  // Mirrors the server's host check for PATCH: admin, or whoever called the
  // meeting. Community founders also pass server-side; the client can't see
  // that, so they get the button only via viewerIsAdmin.
  const canEdit = (room: LivekitRoom) => viewerIsAdmin || room.createdById === user?.id;
  const { t } = useTranslation();
  const { toast } = useToast();
  const errorToast = useErrorToast();
  const [, navigate] = useLocation();
  const [rooms, setRooms] = useState<LivekitRoom[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [ending, setEnding] = useState<Record<number, boolean>>({});

  const refresh = useCallback(async () => {
    try {
      const resp = await api.get<LivekitRoom[]>(`/api/communities/${communityId}/rooms`);
      setRooms(resp.data ?? []);
    } catch {
      setRooms([]);
    }
    try {
      const resp = await api.get<HistoryEntry[]>(`/api/communities/${communityId}/rooms/history?limit=8`);
      setHistory(resp.data ?? []);
    } catch {
      setHistory([]);
    }
  }, [communityId]);

  useEffect(() => {
    refresh().finally(() => setLoaded(true));
    api.get<{ available: boolean }>('/api/livekit/config')
      .then(r => setAvailable(r.data.available))
      .catch(() => setAvailable(false));
    // Soft-poll so a call started elsewhere appears within a minute.
    const interval = setInterval(refresh, 60_000);
    return () => clearInterval(interval);
  }, [refresh]);

  /**
   * datetime-local hands us wall-clock text with no zone; new Date() reads it
   * in the browser's zone and toISOString turns it into the real instant the
   * server stores. Returns undefined for an empty field ("start now"), or
   * null if the value is unusable — the caller has already been told why.
   */
  const parseWhen = (when: string, failTitle: string): string | undefined | null => {
    if (!when) return undefined;
    const parsed = new Date(when);
    if (Number.isNaN(parsed.getTime())) {
      errorToast(failTitle, t('livekit.badDate'));
      return null;
    }
    if (parsed.getTime() <= Date.now()) {
      errorToast(failTitle, t('livekit.pastDate'));
      return null;
    }
    return parsed.toISOString();
  };

  const handleCreate = async (values: RoomFormValues) => {
    if (!values.title.trim()) return;
    const scheduledAt = parseWhen(values.when, t('livekit.createFailed'));
    if (scheduledAt === null) return;
    setCreating(true);
    try {
      await api.post<LivekitRoom>(`/api/communities/${communityId}/rooms`, {
        title: values.title.trim(),
        ...(values.description.trim() ? { description: values.description.trim() } : {}),
        ...(scheduledAt ? { scheduledAt } : {}),
      });
      toast({ title: scheduledAt ? t('livekit.scheduledCreated') : t('livekit.created') });
      setShowCreate(false);
      await refresh();
    } catch (err: any) {
      errorToast(t('livekit.createFailed'), err?.message);
    } finally {
      setCreating(false);
    }
  };

  const handleEdit = async (room: LivekitRoom, values: RoomFormValues) => {
    if (!values.title.trim()) return;
    // Send description even when emptied — that's how the agenda gets removed.
    const body: Record<string, unknown> = {
      title: values.title.trim(),
      description: values.description.trim(),
    };
    // Only scheduled meetings can move, and only if the time actually changed
    // — resending an unchanged date would re-notify the community for nothing.
    if (room.status === 'scheduled' && values.when !== toLocalInput(room.scheduledAt)) {
      const scheduledAt = parseWhen(values.when, t('livekit.editFailed'));
      if (scheduledAt === null) return;
      if (scheduledAt) body.scheduledAt = scheduledAt;
    }
    setCreating(true);
    try {
      await api.patch(`/api/livekit/rooms/${room.id}`, body);
      toast({ title: t('livekit.edited') });
      setEditingId(null);
      await refresh();
    } catch (err: any) {
      errorToast(t('livekit.editFailed'), err?.message);
    } finally {
      setCreating(false);
    }
  };

  const handleEnd = async (roomId: number) => {
    if (!window.confirm(t('livekit.endConfirm') || 'Τερματισμός της κλήσης για όλους;')) return;
    setEnding(s => ({ ...s, [roomId]: true }));
    try {
      await api.patch(`/api/livekit/rooms/${roomId}`, { status: 'closed' });
      await refresh();
    } catch (err: any) {
      errorToast(t('livekit.endFailed') || 'Ο τερματισμός απέτυχε', err?.message);
    } finally {
      setEnding(s => ({ ...s, [roomId]: false }));
    }
  };

  const live = rooms.filter(r => r.status === 'active');
  const scheduled = rooms.filter(r => r.status === 'scheduled');

  if (!loaded) return null;
  // Viewers with nothing live and no way to create see nothing at all when
  // LiveKit isn't even configured.
  if (rooms.length === 0 && history.length === 0 && !canCreate && available !== true) return null;

  return (
    <Card className="mb-6" data-testid="community-rooms-section">
      <CardContent className="p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Mic className="w-4 h-4" />
            {t('livekit.communitySectionTitle')}
          </h2>
          {canCreate && available !== false && (live.length > 0 || scheduled.length > 0 || showCreate) && (
            <Button size="sm" variant={showCreate ? 'secondary' : 'outline'} onClick={() => setShowCreate(v => !v)} data-testid="livekit-toggle-create">
              <Plus className="w-4 h-4 mr-1" />
              {t('livekit.newRoom')}
            </Button>
          )}
        </div>

        {available === false && (
          <p className="text-sm text-muted-foreground">{t('livekit.unavailableBody')}</p>
        )}

        {/* Inline create */}
        {showCreate && (
          <RoomForm
            idPrefix="livekit-create"
            busy={creating}
            onSubmit={handleCreate}
            onCancel={() => setShowCreate(false)}
          />
        )}

        {/* Live rooms — the loudest thing in the strip */}
        {live.map(room => editingId === room.id ? (
          <RoomForm
            key={room.id}
            idPrefix={`livekit-edit-${room.id}`}
            initial={{ title: room.title, description: room.description ?? '', when: '' }}
            busy={creating}
            lockWhen
            onSubmit={(values) => handleEdit(room, values)}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <div
            key={room.id}
            className="flex items-start justify-between gap-3 rounded-md border border-teal-300 bg-teal-50 px-3 py-2.5"
            data-testid={`live-room-${room.id}`}
          >
            <div className="flex items-start gap-3 min-w-0">
              <span className="relative inline-flex items-center justify-center w-9 h-9 rounded-full bg-teal-500/20 text-teal-700 shrink-0">
                <Video className="w-4 h-4" />
                <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{room.title}</div>
                <div className="text-xs text-teal-700">{t('livekit.liveNow')}</div>
                {room.description && (
                  <LinkedText
                    text={room.description}
                    className="block text-xs text-teal-900/80 mt-1"
                  />
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <ShareButton url={`/conference/${room.id}`} title={room.title} size="sm" variant="ghost" iconOnly />
              {canEdit(room) && (
                <Button size="sm" variant="ghost" title={t('livekit.edit')} onClick={() => setEditingId(room.id)} data-testid={`livekit-edit-${room.id}`}>
                  <Pencil className="w-4 h-4 text-muted-foreground" />
                </Button>
              )}
              {viewerIsAdmin && (
                <Button size="sm" variant="ghost" className="text-red-600" disabled={!!ending[room.id]} onClick={() => handleEnd(room.id)} data-testid={`livekit-end-${room.id}`}>
                  <XCircle className="w-4 h-4" />
                </Button>
              )}
              <Button size="sm" onClick={() => navigate(`/conference/${room.id}`)} data-testid={`live-room-join-${room.id}`}>
                {t('livekit.join')}
              </Button>
            </div>
          </div>
        ))}

        {/* Scheduled rooms — quiet rows */}
        {scheduled.map(room => editingId === room.id ? (
          <RoomForm
            key={room.id}
            idPrefix={`livekit-edit-${room.id}`}
            initial={{
              title: room.title,
              description: room.description ?? '',
              when: toLocalInput(room.scheduledAt),
            }}
            busy={creating}
            onSubmit={(values) => handleEdit(room, values)}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <div key={room.id} className="flex items-start justify-between gap-3 rounded-md border px-3 py-2.5" data-testid={`scheduled-room-${room.id}`}>
            <div className="min-w-0 flex items-start gap-3">
              <Clock className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{room.title}</div>
                <div className="text-xs text-muted-foreground">
                  {room.scheduledAt ? new Date(room.scheduledAt).toLocaleString() : t('livekit.scheduled')}
                </div>
                {room.description && (
                  <LinkedText
                    text={room.description}
                    className="block text-xs text-muted-foreground mt-1"
                  />
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <ShareButton url={`/conference/${room.id}`} title={room.title} size="sm" variant="ghost" iconOnly />
              {canEdit(room) && (
                <Button size="sm" variant="ghost" title={t('livekit.edit')} onClick={() => setEditingId(room.id)} data-testid={`livekit-edit-${room.id}`}>
                  <Pencil className="w-4 h-4 text-muted-foreground" />
                </Button>
              )}
              <a
                href={`/api/livekit/rooms/${room.id}/ics`}
                download={`agorax-room-${room.id}.ics`}
                className="inline-flex items-center p-2 rounded-md hover:bg-muted"
                title={t('livekit.addToCalendar')}
              >
                <CalendarPlus className="w-4 h-4 text-muted-foreground" />
              </a>
              <Button size="sm" variant="outline" onClick={() => navigate(`/conference/${room.id}`)}>
                {t('conference.open_room') || 'Είσοδος'}
              </Button>
            </div>
          </div>
        ))}

        {live.length === 0 && scheduled.length === 0 && available !== false && !showCreate && (
          canCreate ? (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="w-full rounded-md border-2 border-dashed border-teal-300/70 bg-teal-50/40 hover:bg-teal-50 px-4 py-5 flex flex-col items-center gap-1.5 transition-colors"
              data-testid="livekit-start-cta"
            >
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-teal-500/15 text-teal-700">
                <Video className="w-5 h-5" />
              </span>
              <span className="text-sm font-medium text-teal-900">
                {t('livekit.startCta') || 'Έναρξη συνδιάσκεψης'}
              </span>
              <span className="text-xs text-muted-foreground">
                {t('livekit.startCtaHint') || 'Βίντεο, συνομιλία και κοινή χρήση οθόνης — τα μέλη ειδοποιούνται αυτόματα.'}
              </span>
            </button>
          ) : (
            <p className="text-sm text-muted-foreground">{t('livekit.noRooms')}</p>
          )
        )}

        {/* Past calls — collapsed */}
        {history.length > 0 && (
          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" data-testid="livekit-history-toggle">
              <ChevronDown className="w-3.5 h-3.5" />
              {t('livekit.historyTitle')} ({history.length})
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 divide-y border rounded-md" data-testid="livekit-history">
                {history.map(h => (
                  <div key={h.id} className="p-2.5 flex items-start justify-between gap-3 flex-wrap" data-testid={`livekit-history-${h.id}`}>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm truncate">{h.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2">
                        <span>{h.closedAt ? new Date(h.closedAt).toLocaleString() : new Date(h.createdAt).toLocaleString()}</span>
                        <span>·</span>
                        <span>{formatDuration(h.durationSeconds)}</span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          <UsersIcon className="w-3 h-3" />
                          {h.participants.length}
                        </span>
                      </div>
                      {h.participants.length > 0 && (
                        <div className="text-xs text-muted-foreground mt-1 line-clamp-1">
                          {h.participants.map(p => p.name).join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}
