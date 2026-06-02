/**
 * "Αίθουσα συσκέψεων / Deliberation Room" — single-room widget for a
 * sortition body's detail page.
 *
 * Behaviour:
 *   • If a room already exists, show it inline.
 *   • If not, show a "Start the deliberation room" button. Clicking
 *     `POST /api/sortition/:bodyId/room` creates the row (idempotent
 *     server-side) and then renders the ConferenceRoomCard.
 *   • Hides itself when LiveKit isn't configured AND no room exists.
 */

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mic, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useTranslation } from '@/hooks/use-translation';
import { useErrorToast } from '@/hooks/use-error-toast';
import { ConferenceRoomCard } from './ConferenceRoomCard';

interface LivekitRoom {
  id: number;
  roomName: string;
  kind: 'community' | 'sortition';
  title: string;
  status: 'scheduled' | 'active' | 'closed';
}

interface Props {
  bodyId: number;
}

export function SortitionRoomSection({ bodyId }: Props) {
  const { t } = useTranslation();
  const errorToast = useErrorToast();
  const [room, setRoom] = useState<LivekitRoom | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [starting, setStarting] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    try {
      const resp = await api.get<LivekitRoom | null>(`/api/sortition/${bodyId}/room`);
      setRoom(resp.data);
    } catch {
      setRoom(null);
    }
  }, [bodyId]);

  useEffect(() => {
    refresh().finally(() => setLoaded(true));
    api.get<{ available: boolean }>('/api/livekit/config')
      .then(r => setAvailable(r.data.available))
      .catch(() => setAvailable(false));
  }, [refresh]);

  const handleStart = async () => {
    setStarting(true);
    try {
      const resp = await api.post<LivekitRoom>(`/api/sortition/${bodyId}/room`);
      setRoom(resp.data);
    } catch (err: any) {
      errorToast(t('livekit.createFailed'), err?.message);
    } finally {
      setStarting(false);
    }
  };

  if (!loaded) return null;
  if (!room && available === false) return null;

  return (
    <section data-testid="sortition-room-section" className="space-y-3">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <Users className="w-5 h-5" />
        {t('livekit.sortitionSectionTitle')}
      </h3>
      {room ? (
        <ConferenceRoomCard
          roomId={room.id}
          title={room.title}
          description={t('livekit.sortitionRoomDescription')}
          badge={room.status === 'active' ? t('livekit.live') : t('livekit.scheduled')}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Mic className="w-4 h-4" />
              {t('livekit.sortitionStartTitle')}
            </CardTitle>
            <CardDescription>{t('livekit.sortitionStartDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" onClick={handleStart} disabled={starting} data-testid="livekit-sortition-start">
              {t('livekit.startRoom')}
            </Button>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
