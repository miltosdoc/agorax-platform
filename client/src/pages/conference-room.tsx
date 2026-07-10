/**
 * Dedicated conference page — /conference/:roomId
 *
 * The full-blown meeting experience for community conferences and sortition
 * deliberation rooms: lobby with camera/mic preview, then a full-screen
 * LiveKit VideoConference (video grid, screen-share rendering, chat over the
 * data channel, participant list, device menus). Entry points around the app
 * (community dashboard, active-call banner, notifications, calendar files)
 * link here instead of embedding the call inline.
 *
 * Uses the npm livekit-client + @livekit/components-react — NOT the legacy
 * window.LivekitClient CDN build (v2.5.5) the old inline card relied on.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import AppShell from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, CalendarPlus, Loader2, PhoneOff, XCircle } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useTranslation } from '@/hooks/use-translation';
import { useErrorToast } from '@/hooks/use-error-toast';
import { useAuth } from '@/hooks/use-auth';
import ShareButton from '@/components/ShareButton';
import {
  LiveKitRoom,
  PreJoin,
  VideoConference,
  type LocalUserChoices,
} from '@livekit/components-react';
import '@livekit/components-styles';

interface RoomInfo {
  id: number;
  roomName: string;
  kind: 'community' | 'sortition';
  title: string;
  status: 'scheduled' | 'active' | 'closed';
  communityId: number;
  sortitionBodyId: number | null;
  scheduledAt: string | null;
  communityName: string | null;
  canJoin: boolean;
  isHost: boolean;
}

interface JoinTokenResponse {
  token: string;
  url: string;
  roomName: string;
  isHost: boolean;
}

function readCsrfCookie(): string {
  if (typeof document === 'undefined') return '';
  const part = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('agorax_csrf='));
  return part ? decodeURIComponent(part.slice('agorax_csrf='.length)) : '';
}

/** Best-effort participation-leave signal that survives tab close. */
function fireLeave(roomId: number) {
  try {
    fetch(`/api/livekit/rooms/${roomId}/leave`, {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers: { 'X-CSRF-Token': readCsrfCookie() },
    }).catch(() => {});
  } catch { /* noop */ }
}

type Stage = 'loading' | 'error' | 'lobby' | 'connecting' | 'in-call' | 'left';

export default function ConferenceRoomPage() {
  const params = useParams();
  const roomId = parseInt(params.roomId ?? '', 10);
  const [, navigate] = useLocation();
  const { t } = useTranslation();
  const errorToast = useErrorToast();
  const { user } = useAuth();
  // Guards: single in-flight token fetch; distinguish connect-failure from a
  // normal leave; fire the leave signal exactly once per join.
  const joiningRef = useRef(false);
  const connectFailedRef = useRef(false);
  const inCallRef = useRef(false);

  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [stage, setStage] = useState<Stage>('loading');
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<LocalUserChoices | null>(null);
  const [conn, setConn] = useState<{ token: string; url: string } | null>(null);
  const [ending, setEnding] = useState(false);

  const backUrl = room
    ? (room.kind === 'sortition' && room.sortitionBodyId
        ? `/sortition/body/${room.sortitionBodyId}`
        : `/communities/${room.communityId}?tab=conferences`)
    : '/communities';

  const loadRoom = useCallback(async () => {
    if (!Number.isFinite(roomId)) {
      setError(t('conference.not_found') || 'Η συνάντηση δεν βρέθηκε.');
      setStage('error');
      return;
    }
    try {
      const resp = await api.get<RoomInfo>(`/api/livekit/rooms/${roomId}`);
      setRoom(resp.data);
      setStage('lobby');
    } catch (err: any) {
      const message = err instanceof ApiError && err.status === 403
        ? (t('conference.members_only') || 'Η συνάντηση είναι διαθέσιμη μόνο στα μέλη της κοινότητας.')
        : err instanceof ApiError && err.status === 404
          ? (t('conference.not_found') || 'Η συνάντηση δεν βρέθηκε.')
          : (err?.message || 'Failed to load');
      setError(message);
      setStage('error');
    }
  }, [roomId, t]);

  useEffect(() => { void loadRoom(); }, [loadRoom]);

  // When the pre-join form is submitted, mint a token and connect.
  const handlePreJoinSubmit = useCallback(async (userChoices: LocalUserChoices) => {
    if (joiningRef.current) return; // PreJoin's button stays clickable — dedupe
    joiningRef.current = true;
    setChoices(userChoices);
    setStage('connecting');
    try {
      const resp = await api.post<JoinTokenResponse>(`/api/livekit/rooms/${roomId}/token`, {});
      connectFailedRef.current = false;
      inCallRef.current = true;
      setConn({ token: resp.data.token, url: resp.data.url });
      setStage('in-call');
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 410) {
        // Closed while we sat in the lobby — refetch so the lobby shows the
        // real "ended" state instead of a joinable preview loop.
        errorToast(t('conference.join_failed') || 'Αποτυχία σύνδεσης', t('conference.closed') || 'Η συνάντηση έχει ολοκληρωθεί.');
        setStage('loading');
        void loadRoom();
        return;
      }
      const message = err instanceof ApiError && err.status === 503
        ? (t('livekit.unavailableBody') || 'Video conferencing is not configured on this instance.')
        : (err?.message || 'Failed to join');
      errorToast(t('conference.join_failed') || 'Αποτυχία σύνδεσης', message);
      setStage('lobby');
    } finally {
      joiningRef.current = false;
    }
  }, [roomId, t, errorToast, loadRoom]);

  const leaveOnce = useCallback(() => {
    if (!inCallRef.current) return;
    inCallRef.current = false;
    fireLeave(roomId);
  }, [roomId]);

  const handleDisconnected = useCallback(() => {
    leaveOnce();
    setConn(null);
    // A failed connect also emits Disconnected — onError already routed the
    // user back to the lobby with a toast, don't overwrite it with 'left'.
    setStage(s => (connectFailedRef.current ? s : 'left'));
  }, [leaveOnce]);

  const handleConnectError = useCallback((err: Error) => {
    connectFailedRef.current = true;
    leaveOnce();
    setConn(null);
    setStage('lobby');
    errorToast(
      t('conference.join_failed') || 'Αποτυχία σύνδεσης',
      err?.message || (t('conference.connect_failed') || 'Η σύνδεση με τον διακομιστή βίντεο απέτυχε.'),
    );
  }, [leaveOnce, errorToast, t]);

  // Leave signal on hard tab close, and on SPA unmount (browser back /
  // in-app navigation) where LiveKitRoom's Disconnected event never fires.
  useEffect(() => {
    if (stage !== 'in-call') return;
    window.addEventListener('pagehide', leaveOnce);
    return () => window.removeEventListener('pagehide', leaveOnce);
  }, [stage, leaveOnce]);
  useEffect(() => () => leaveOnce(), [leaveOnce]);

  const handleEndForAll = useCallback(async () => {
    if (!room) return;
    if (!window.confirm(t('conference.end_confirm') || 'Να τερματιστεί η συνάντηση για όλους;')) return;
    setEnding(true);
    try {
      await api.patch(`/api/livekit/rooms/${room.id}`, { status: 'closed' });
      leaveOnce();
      setConn(null);
      setStage('left');
    } catch (err: any) {
      errorToast(t('livekit.endFailed') || 'Αποτυχία τερματισμού', err?.message);
    } finally {
      setEnding(false);
    }
  }, [room, t, errorToast, leaveOnce]);

  // ── Full-screen call — rendered above the app chrome (incl. BottomNav) ──
  if (stage === 'in-call' && conn && room) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-[#111]" data-lk-theme="default" data-testid="conference-call">
        <header className="flex items-center gap-3 px-4 py-2 border-b border-white/10 text-white">
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-semibold truncate">{room.title}</h1>
            {room.communityName && (
              <p className="text-xs text-white/60 truncate">{room.communityName}</p>
            )}
          </div>
          <Badge variant="outline" className="border-red-400/50 text-red-300">
            {t('livekit.live') || 'Σε εξέλιξη'}
          </Badge>
          {room.isHost && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleEndForAll}
              disabled={ending}
              data-testid="conference-end-for-all"
            >
              <XCircle className="w-4 h-4 mr-1" />
              {t('conference.end_for_all') || 'Τερματισμός για όλους'}
            </Button>
          )}
        </header>
        <div className="flex-1 min-h-0">
          <LiveKitRoom
            serverUrl={conn.url}
            token={conn.token}
            connect
            video={choices?.videoEnabled ?? true}
            audio={choices?.audioEnabled ?? true}
            options={{
              videoCaptureDefaults: choices?.videoDeviceId ? { deviceId: choices.videoDeviceId } : undefined,
              audioCaptureDefaults: choices?.audioDeviceId ? { deviceId: choices.audioDeviceId } : undefined,
            }}
            onDisconnected={handleDisconnected}
            onError={handleConnectError}
            style={{ height: '100%' }}
          >
            <VideoConference />
          </LiveKitRoom>
        </div>
      </div>
    );
  }

  // ── Lobby / status shells share the standard page chrome ──
  return (
    <AppShell
      breadcrumb={[
        { label: t('nav.communities'), href: '/communities' },
        ...(room?.communityName
          ? [{ label: room.communityName, href: `/communities/${room.communityId}` }]
          : []),
        { label: room?.title ?? (t('conference.title') || 'Συνάντηση') },
      ]}
    >
      <Button variant="ghost" className="mb-4" onClick={() => navigate(backUrl)} data-testid="conference-back">
        <ArrowLeft className="w-4 h-4 mr-2" />
        {t('common.back')}
      </Button>

      {stage === 'loading' && (
        <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          {t('common.loading')}
        </div>
      )}

      {stage === 'error' && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">{error}</CardContent>
        </Card>
      )}

      {(stage === 'lobby' || stage === 'connecting') && room && (
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-2xl font-serif">{room.title}</h1>
              {room.communityName && (
                <p className="text-sm text-muted-foreground mt-1">{room.communityName}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={room.status === 'active' ? 'default' : 'outline'}>
                {room.status === 'active'
                  ? (t('livekit.live') || 'Σε εξέλιξη')
                  : room.status === 'scheduled'
                    ? (t('livekit.scheduled') || 'Προγραμματισμένη')
                    : (t('conference.closed_badge') || 'Ολοκληρώθηκε')}
              </Badge>
              <ShareButton url={`/conference/${room.id}`} title={room.title} size="sm" variant="outline" />
              <a
                href={`/api/livekit/rooms/${room.id}/ics`}
                download={`agorax-room-${room.id}.ics`}
                className="inline-flex items-center gap-1 text-sm px-3 py-1.5 border rounded-md hover:bg-muted"
              >
                <CalendarPlus className="w-4 h-4" />
                {t('livekit.addToCalendar')}
              </a>
            </div>
          </div>

          {room.status === 'closed' ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                {t('conference.closed') || 'Η συνάντηση έχει ολοκληρωθεί.'}
              </CardContent>
            </Card>
          ) : !room.canJoin ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                {t('conference.join_members_only') || 'Μόνο τα μέλη της κοινότητας μπορούν να συμμετάσχουν. Γίνετε μέλος από τη σελίδα της κοινότητας.'}
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-lg overflow-hidden border" data-lk-theme="default" data-testid="conference-prejoin">
              <PreJoin
                defaults={{ username: user?.name || user?.username || '', videoEnabled: true, audioEnabled: true }}
                joinLabel={stage === 'connecting'
                  ? (t('common.loading') || '…')
                  : (t('livekit.join') || 'Συμμετοχή')}
                micLabel={t('conference.mic') || 'Μικρόφωνο'}
                camLabel={t('conference.camera') || 'Κάμερα'}
                userLabel={t('conference.display_name') || 'Όνομα'}
                onSubmit={handlePreJoinSubmit}
                onError={(err) => errorToast(t('conference.device_error') || 'Πρόβλημα με κάμερα/μικρόφωνο', err?.message)}
              />
            </div>
          )}
          <p className="text-xs text-muted-foreground">{t('livekit.permissionsHint')}</p>
        </div>
      )}

      {stage === 'left' && (
        <Card className="max-w-xl mx-auto">
          <CardContent className="p-8 text-center space-y-4">
            <PhoneOff className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="text-lg font-medium">{t('conference.left_title') || 'Αποχωρήσατε από τη συνάντηση'}</p>
            <div className="flex justify-center gap-2">
              <Button variant="outline" onClick={() => { setStage('loading'); void loadRoom(); }} data-testid="conference-rejoin">
                {t('conference.rejoin') || 'Επανασύνδεση'}
              </Button>
              <Button onClick={() => navigate(backUrl)}>
                {t('common.back')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
