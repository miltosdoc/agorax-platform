/**
 * Compact conference summary card. The actual call experience lives on the
 * dedicated /conference/:roomId page (full video grid, chat, screen share);
 * this card is the entry point from community dashboards and sortition
 * bodies — title, status, share/calendar actions, and the admin end-call.
 */

import { useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mic, CalendarPlus, XCircle, Video } from 'lucide-react';
import { api } from '@/lib/api';
import { useErrorToast } from '@/hooks/use-error-toast';
import { useTranslation } from '@/hooks/use-translation';
import ShareButton from '@/components/ShareButton';

interface Props {
  roomId: number;
  title: string;
  description?: string;
  badge?: string;
  viewerIsAdmin?: boolean;
  onEnded?: () => void;
  shareUrl?: string;
}

export function ConferenceRoomCard({
  roomId,
  title,
  description,
  badge,
  viewerIsAdmin = false,
  onEnded,
  shareUrl,
}: Props) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const errorToast = useErrorToast();
  const [ending, setEnding] = useState(false);

  const conferenceUrl = `/conference/${roomId}`;

  const handleEnd = async () => {
    if (!window.confirm(t('conference.end_confirm') || 'Να τερματιστεί η συνάντηση για όλους;')) return;
    setEnding(true);
    try {
      await api.patch(`/api/livekit/rooms/${roomId}`, { status: 'closed' });
      onEnded?.();
    } catch (err: any) {
      errorToast(t('livekit.endFailed') || 'Αποτυχία τερματισμού', err?.message);
    } finally {
      setEnding(false);
    }
  };

  return (
    <Card data-testid={`livekit-room-${roomId}`}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2">
            <Mic className="w-5 h-5" />
            {title}
          </CardTitle>
          {badge && <Badge variant="outline">{badge}</Badge>}
        </div>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => navigate(conferenceUrl)} data-testid="livekit-join">
            <Video className="w-4 h-4 mr-1" />
            {t('conference.open_room') || 'Είσοδος στη συνάντηση'}
          </Button>
          <ShareButton url={shareUrl ?? conferenceUrl} title={title} text={description} size="sm" variant="outline" />
          <a
            href={`/api/livekit/rooms/${roomId}/ics`}
            download={`agorax-room-${roomId}.ics`}
            className="inline-flex items-center gap-1 text-sm px-3 py-2 border rounded-md hover:bg-muted"
            data-testid="livekit-ics"
          >
            <CalendarPlus className="w-4 h-4" />
            {t('livekit.addToCalendar')}
          </a>
          {viewerIsAdmin && (
            <Button
              type="button"
              variant="outline"
              onClick={handleEnd}
              disabled={ending}
              className="text-red-700 border-red-200 hover:bg-red-50"
              data-testid="livekit-end-prejoin"
            >
              <XCircle className="w-4 h-4 mr-1" />
              {t('livekit.endCall')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
