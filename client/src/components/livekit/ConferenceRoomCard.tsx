/**
 * Self-contained "Join → in-room → leave" widget around LiveKit.
 *
 * The host page passes in a `roomId` from our backend. We then:
 *   1. Fetch /api/livekit/rooms/:id/token to mint a join JWT.
 *   2. Render the LiveKit `<LiveKitRoom>` provider with the official
 *      pre-built `<VideoConference>` UI (it ships mic/cam/screen-share,
 *      grid layout, and a participant tray for free).
 *   3. Provide a "Leave room" button that tears down the connection.
 *
 * If LiveKit isn't configured on the server, the token endpoint returns
 * 503 and we render an informational fallback instead of crashing.
 */

import { useEffect, useState } from 'react';
import { LiveKitRoom, VideoConference } from '@livekit/components-react';
import '@livekit/components-styles';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mic, PhoneOff, Loader2, CalendarPlus } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useErrorToast } from '@/hooks/use-error-toast';
import { useTranslation } from '@/hooks/use-translation';

interface JoinTokenResponse {
  token: string;
  url: string;
  roomName: string;
  isHost: boolean;
}

interface Props {
  roomId: number;
  title: string;
  description?: string;
  badge?: string;
}

export function ConferenceRoomCard({ roomId, title, description, badge }: Props) {
  const { t } = useTranslation();
  const errorToast = useErrorToast();
  const [token, setToken] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [joined, setJoined] = useState(false);

  const handleJoin = async () => {
    setConnecting(true);
    try {
      const resp = await api.post<JoinTokenResponse>(`/api/livekit/rooms/${roomId}/token`);
      setToken(resp.data.token);
      setUrl(resp.data.url);
      setJoined(true);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 503) {
        errorToast(t('livekit.unavailableTitle'), t('livekit.unavailableBody'));
      } else {
        errorToast(t('livekit.joinFailed'), err?.message ?? t('media.tryAgain'));
      }
    } finally {
      setConnecting(false);
    }
  };

  const handleLeave = () => {
    setToken(null);
    setUrl(null);
    setJoined(false);
  };

  // ── In-room view ─────────────────────────────────────────────────────
  if (joined && token && url) {
    return (
      <Card data-testid={`livekit-room-${roomId}`}>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="truncate">{title}</CardTitle>
            {description && <CardDescription className="truncate">{description}</CardDescription>}
          </div>
          <Button type="button" variant="destructive" size="sm" onClick={handleLeave} data-testid="livekit-leave">
            <PhoneOff className="w-4 h-4 mr-1" />
            {t('livekit.leave')}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="h-[600px] rounded-lg overflow-hidden bg-black" data-lk-theme="default">
            <LiveKitRoom
              token={token}
              serverUrl={url}
              connect={true}
              video={true}
              audio={true}
              onDisconnected={handleLeave}
            >
              <VideoConference />
            </LiveKitRoom>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Pre-join view ────────────────────────────────────────────────────
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
          <Button type="button" onClick={handleJoin} disabled={connecting} data-testid="livekit-join">
            {connecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {t('livekit.join')}
          </Button>
          <a
            href={`/api/livekit/rooms/${roomId}/ics`}
            download={`agorax-room-${roomId}.ics`}
            className="inline-flex items-center gap-1 text-sm px-3 py-2 border rounded-md hover:bg-muted"
            data-testid="livekit-ics"
          >
            <CalendarPlus className="w-4 h-4" />
            {t('livekit.addToCalendar')}
          </a>
        </div>
        <p className="text-xs text-muted-foreground mt-2">{t('livekit.permissionsHint')}</p>
      </CardContent>
    </Card>
  );
}
