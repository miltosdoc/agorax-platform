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
import { Mic, PhoneOff, Loader2, CalendarPlus, XCircle } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useErrorToast } from '@/hooks/use-error-toast';
import { useTranslation } from '@/hooks/use-translation';

interface JoinTokenResponse {
  token: string;
  url: string;
  roomName: string;
  isHost: boolean;
  participationId?: number | null;
}

function readCsrfCookie(): string {
  if (typeof document === 'undefined') return '';
  const part = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('agorax_csrf='));
  return part ? decodeURIComponent(part.slice('agorax_csrf='.length)) : '';
}

/**
 * Fire-and-forget leave beacon. `keepalive: true` is the modern
 * equivalent of navigator.sendBeacon and still lets us set the CSRF
 * header (sendBeacon doesn't). We don't await — the user has already
 * disconnected, the network call's fate doesn't matter to them.
 */
function fireLeaveBeacon(roomId: number) {
  try {
    fetch(`/api/livekit/rooms/${roomId}/leave`, {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers: {
        'X-CSRF-Token': readCsrfCookie(),
      },
    }).catch(() => { /* fire-and-forget */ });
  } catch { /* noop */ }
}

interface Props {
  roomId: number;
  title: string;
  description?: string;
  badge?: string;
  /**
   * Hint that the viewer can host this room (community admin/founder).
   * The server still gates the action — this just shows the End button
   * in the pre-join view. In-room, we trust the server-issued isHost.
   */
  viewerIsAdmin?: boolean;
  /** Called after the room has been ended so the parent can refresh. */
  onEnded?: () => void;
}

export function ConferenceRoomCard({
  roomId,
  title,
  description,
  badge,
  viewerIsAdmin,
  onEnded,
}: Props) {
  const { t } = useTranslation();
  const errorToast = useErrorToast();
  const [token, setToken] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [joined, setJoined] = useState(false);
  const [ending, setEnding] = useState(false);
  const [isHost, setIsHost] = useState(false);

  const handleJoin = async () => {
    setConnecting(true);
    try {
      const resp = await api.post<JoinTokenResponse>(`/api/livekit/rooms/${roomId}/token`);
      // eslint-disable-next-line no-console
      console.info('[livekit] join token received', { roomName: resp.data.roomName, url: resp.data.url, isHost: resp.data.isHost });
      setToken(resp.data.token);
      setUrl(resp.data.url);
      setIsHost(!!resp.data.isHost);
      setJoined(true);
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('[livekit] join failed', err);
      const status = err instanceof ApiError ? err.status : undefined;
      const detail = err?.message ?? String(err);
      if (status === 503) {
        errorToast(t('livekit.unavailableTitle'), t('livekit.unavailableBody'));
      } else if (status === 403) {
        errorToast(t('livekit.joinFailed'), `403: ${detail}`);
      } else if (status === 410) {
        errorToast(t('livekit.joinFailed'), `Room is closed.`);
      } else {
        errorToast(t('livekit.joinFailed'), `${status ?? ''} ${detail}`.trim());
      }
    } finally {
      setConnecting(false);
    }
  };

  const handleRoomError = (err: Error) => {
    // eslint-disable-next-line no-console
    console.error('[livekit] in-room error', err);
    errorToast(t('livekit.joinFailed'), err.message);
    handleLeave();
  };

  const handleLeave = () => {
    // Fire the participation-end beacon before tearing down state.
    if (joined) fireLeaveBeacon(roomId);
    setToken(null);
    setUrl(null);
    setJoined(false);
  };

  // Fire the leave beacon if the tab is closing while still joined. The
  // LiveKitRoom's onDisconnected won't run for a hard tab kill, but
  // fetch({keepalive:true}) inside pagehide survives the unload.
  useEffect(() => {
    if (!joined) return;
    const onPageHide = () => fireLeaveBeacon(roomId);
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [joined, roomId]);

  const handleEnd = async () => {
    if (!window.confirm(t('livekit.endConfirm'))) return;
    setEnding(true);
    try {
      await api.patch(`/api/livekit/rooms/${roomId}`, { status: 'closed' });
      // Kick our own session — onDisconnected from the SFU will fire too,
      // but doing this here makes the UI snap before the network round-trip.
      handleLeave();
      onEnded?.();
    } catch (err: any) {
      const status = err instanceof ApiError ? err.status : undefined;
      errorToast(t('livekit.endFailed'), `${status ?? ''} ${err?.message ?? ''}`.trim());
    } finally {
      setEnding(false);
    }
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
          <div className="flex flex-wrap gap-2">
            {isHost && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleEnd}
                disabled={ending}
                data-testid="livekit-end-inroom"
              >
                <XCircle className="w-4 h-4 mr-1" />
                {t('livekit.endCall')}
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" onClick={handleLeave} data-testid="livekit-leave">
              <PhoneOff className="w-4 h-4 mr-1" />
              {t('livekit.leave')}
            </Button>
          </div>
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
              onError={handleRoomError}
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
        <p className="text-xs text-muted-foreground mt-2">{t('livekit.permissionsHint')}</p>
      </CardContent>
    </Card>
  );
}
