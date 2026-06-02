/**
 * "Συναντήσεις / Conferences" section embedded in the community
 * dashboard. Lists open community rooms; if the viewer is an admin
 * they get a "New conference" form that scheduled-or-creates a room.
 */

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Mic, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { useErrorToast } from '@/hooks/use-error-toast';
import { ConferenceRoomCard } from './ConferenceRoomCard';

interface LivekitRoom {
  id: number;
  roomName: string;
  kind: 'community' | 'sortition';
  title: string;
  status: 'scheduled' | 'active' | 'closed';
  recordingEnabled: boolean;
  scheduledAt: string | null;
  createdAt: string;
}

interface Props {
  communityId: number;
  viewerIsAdmin: boolean;
}

export function CommunityRoomsSection({ communityId, viewerIsAdmin }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const errorToast = useErrorToast();
  const [rooms, setRooms] = useState<LivekitRoom[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    try {
      const resp = await api.get<LivekitRoom[]>(`/api/communities/${communityId}/rooms`);
      setRooms(resp.data ?? []);
    } catch {
      setRooms([]);
    }
  }, [communityId]);

  useEffect(() => {
    refresh().finally(() => setLoaded(true));
    api.get<{ available: boolean }>('/api/livekit/config')
      .then(r => setAvailable(r.data.available))
      .catch(() => setAvailable(false));
  }, [refresh]);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await api.post<LivekitRoom>(`/api/communities/${communityId}/rooms`, { title: newTitle.trim() });
      toast({ title: t('livekit.created') });
      setNewTitle('');
      await refresh();
    } catch (err: any) {
      errorToast(t('livekit.createFailed'), err?.message);
    } finally {
      setCreating(false);
    }
  };

  if (!loaded) return null;
  // Hide the entire section when no rooms exist AND the viewer can't create one
  // AND LiveKit isn't even configured — keeps the dashboard clean.
  if (rooms.length === 0 && !viewerIsAdmin && available !== true) return null;

  return (
    <section data-testid="community-rooms-section">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Mic className="w-5 h-5" />
          {t('livekit.communitySectionTitle')}
        </h2>
      </div>

      {available === false && (
        <Card className="mb-3">
          <CardContent className="p-4 text-sm text-muted-foreground">
            {t('livekit.unavailableBody')}
          </CardContent>
        </Card>
      )}

      {viewerIsAdmin && available !== false && (
        <Card className="mb-3">
          <CardHeader>
            <CardTitle className="text-base">{t('livekit.newRoom')}</CardTitle>
            <CardDescription>{t('livekit.newRoomDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={t('livekit.titlePlaceholder')}
                className="flex-1 min-w-[200px]"
                data-testid="livekit-new-title"
              />
              <Button type="button" onClick={handleCreate} disabled={creating || !newTitle.trim()} data-testid="livekit-create">
                <Plus className="w-4 h-4 mr-1" />
                {t('livekit.createButton')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {rooms.length === 0 ? (
        available !== false && (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              {t('livekit.noRooms')}
            </CardContent>
          </Card>
        )
      ) : (
        <div className="space-y-3">
          {rooms.map(room => (
            <ConferenceRoomCard
              key={room.id}
              roomId={room.id}
              title={room.title}
              badge={room.status === 'active' ? t('livekit.live') : t('livekit.scheduled')}
            />
          ))}
        </div>
      )}
    </section>
  );
}
