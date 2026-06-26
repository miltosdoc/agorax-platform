/**
 * Self-contained "Join → in-room → leave" widget using livekit-client
 * loaded from CDN (window.LivekitClient). This avoids needing the
 * @livekit/components-react package while giving full camera/mic access.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Loader2, CalendarPlus, XCircle, MonitorUp } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useErrorToast } from '@/hooks/use-error-toast';
import { useTranslation } from '@/hooks/use-translation';

interface JoinTokenResponse {
  token: string;
  url: string;
  roomName: string;
  isHost: boolean;
  participationId?: number | null;
  turnUrl?: string;
}

function readCsrfCookie(): string {
  if (typeof document === 'undefined') return '';
  const part = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('agorax_csrf='));
  return part ? decodeURIComponent(part.slice('agorax_csrf='.length)) : '';
}

function fireLeaveBeacon(roomId: number) {
  try {
    fetch(`/api/livekit/rooms/${roomId}/leave`, {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers: { 'X-CSRF-Token': readCsrfCookie() },
    }).catch(() => {});
  } catch { /* noop */ }
}

// ── Participant tile ──────────────────────────────────────────────────────────

interface ParticipantTileProps {
  participant: any;
  isLocal: boolean;
}

function ParticipantTile({ participant, isLocal }: ParticipantTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [hasVideo, setHasVideo] = useState(false);

  useEffect(() => {
    if (!participant) return;

    const attachAll = () => {
      const LK = (window as any).LivekitClient;
      const CameraSource = LK?.Track?.Source?.Camera ?? 'camera';
      const MicSource = LK?.Track?.Source?.Microphone ?? 'microphone';

      // Camera
      let camAttached = false;
      for (const pub of participant.videoTrackPublications?.values?.() ?? []) {
        if ((pub.source === CameraSource || pub.source === 'camera') && pub.track) {
          if (videoRef.current) {
            pub.track.attach(videoRef.current);
            camAttached = true;
          }
          break;
        }
      }
      setHasVideo(camAttached);

      // Audio (skip for local — we don't play our own mic back)
      if (!isLocal) {
        for (const pub of participant.audioTrackPublications?.values?.() ?? []) {
          if ((pub.source === MicSource || pub.source === 'microphone') && pub.track) {
            if (audioRef.current) pub.track.attach(audioRef.current);
            break;
          }
        }
      }
    };

    attachAll();

    // Re-attach whenever tracks change
    const handler = () => attachAll();
    participant.on?.('trackPublished', handler);
    participant.on?.('trackSubscribed', handler);
    participant.on?.('trackUnpublished', () => setHasVideo(false));

    return () => {
      participant.off?.('trackPublished', handler);
      participant.off?.('trackSubscribed', handler);
      participant.off?.('trackUnpublished', handler);
      // Detach
      if (videoRef.current) {
        try { videoRef.current.srcObject = null; } catch { /* noop */ }
      }
    };
  }, [participant, isLocal]);

  const name: string = participant?.identity ?? (isLocal ? 'Εσείς' : 'Συμμετέχων');

  return (
    <div className="relative bg-gray-900 rounded-lg overflow-hidden aspect-video flex items-center justify-center">
      {!hasVideo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-400">
          <VideoOff className="w-8 h-8" />
          <span className="text-sm">{name}</span>
        </div>
      )}
      <video
        ref={videoRef}
        autoPlay
        muted={isLocal}
        playsInline
        className={`w-full h-full object-cover ${hasVideo ? 'block' : 'hidden'}`}
      />
      {!isLocal && <audio ref={audioRef} autoPlay />}
      <div className="absolute bottom-2 left-2 text-white text-xs bg-black/60 px-2 py-0.5 rounded max-w-[80%] truncate">
        {name}{isLocal ? ' (Εσείς)' : ''}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  roomId: number;
  title: string;
  description?: string;
  badge?: string;
  viewerIsAdmin?: boolean;
  onEnded?: () => void;
}

export function ConferenceRoomCard({ roomId, title, description, badge, viewerIsAdmin, onEnded }: Props) {
  const { t } = useTranslation();
  const errorToast = useErrorToast();

  // Pre-join state
  const [connecting, setConnecting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [joined, setJoined] = useState(false);
  const [isHost, setIsHost] = useState(false);

  // Room state
  const roomRef = useRef<any>(null);
  const [localParticipant, setLocalParticipant] = useState<any>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<any[]>([]);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [roomError, setRoomError] = useState<string | null>(null);

  const refreshParticipants = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    setLocalParticipant(room.localParticipant ?? null);
    setRemoteParticipants(Array.from(room.remoteParticipants?.values?.() ?? []));
  }, []);

  const handleLeave = useCallback(() => {
    if (joined) fireLeaveBeacon(roomId);
    if (roomRef.current) {
      try { roomRef.current.disconnect(); } catch { /* noop */ }
      roomRef.current = null;
    }
    setJoined(false);
    setLocalParticipant(null);
    setRemoteParticipants([]);
    setRoomError(null);
  }, [joined, roomId]);

  // Connect to LiveKit when joined becomes true
  useEffect(() => {
    if (!joined) return;

    const LK = (window as any).LivekitClient;
    if (!LK?.Room) {
      setRoomError('Η βιβλιοθήκη βιντεοκλήσης δεν φορτώθηκε. Ανανεώστε τη σελίδα.');
      setJoined(false);
      return;
    }

    // Fetch token then connect
    let cancelled = false;
    let token: string;
    let url: string;

    api.post<JoinTokenResponse>(`/api/livekit/rooms/${roomId}/token`)
      .then(async (resp) => {
        if (cancelled) return;
        token = resp.data.token;
        url = resp.data.url;
        setIsHost(!!resp.data.isHost);

        // Build ICE server config — use the proxied TURN server when available
        const rtcConfig: RTCConfiguration | undefined = resp.data.turnUrl ? {
          iceServers: [{ urls: [`turn:${resp.data.turnUrl.replace(/^wss?:\/\//, '')}?transport=tcp`], username: 'livekit', credential: 'livekit' }],
          iceTransportPolicy: 'relay',
        } : undefined;

        const room = new LK.Room({ adaptiveStream: true, dynacast: true, rtcConfig });
        roomRef.current = room;

        const RE = LK.RoomEvent ?? {};
        const onUpdate = () => { if (!cancelled) refreshParticipants(); };
        const onDisconnect = () => { if (!cancelled) handleLeave(); };

        room.on(RE.ParticipantConnected ?? 'participantConnected', onUpdate);
        room.on(RE.ParticipantDisconnected ?? 'participantDisconnected', onUpdate);
        room.on(RE.TrackSubscribed ?? 'trackSubscribed', onUpdate);
        room.on(RE.TrackUnsubscribed ?? 'trackUnsubscribed', onUpdate);
        room.on(RE.LocalTrackPublished ?? 'localTrackPublished', onUpdate);
        room.on(RE.LocalTrackUnpublished ?? 'localTrackUnpublished', onUpdate);
        room.on(RE.Disconnected ?? 'disconnected', onDisconnect);

        await room.connect(url, token);
        if (cancelled) { room.disconnect(); return; }

        // Enable camera and microphone
        try {
          await room.localParticipant.enableCameraAndMicrophone();
        } catch (mediaErr: any) {
          console.warn('[livekit] media permissions denied or unavailable', mediaErr);
          // Try audio-only fallback
          try {
            await room.localParticipant.setMicrophoneEnabled(true);
          } catch { /* noop */ }
        }

        if (!cancelled) refreshParticipants();
      })
      .catch((err: any) => {
        if (cancelled) return;
        console.error('[livekit] connection failed', err);
        const status = err instanceof ApiError ? err.status : undefined;
        if (status === 503) errorToast(t('livekit.unavailableTitle'), t('livekit.unavailableBody'));
        else if (status === 403) errorToast(t('livekit.joinFailed'), `403: ${err?.message}`);
        else if (status === 410) errorToast(t('livekit.joinFailed'), 'Room is closed.');
        else errorToast(t('livekit.joinFailed'), err?.message ?? String(err));
        setJoined(false);
      });

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined, roomId]);

  // Pagehide beacon
  useEffect(() => {
    if (!joined) return;
    const onPageHide = () => fireLeaveBeacon(roomId);
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [joined, roomId]);

  const toggleCamera = async () => {
    const lp = roomRef.current?.localParticipant;
    if (!lp) return;
    const next = !cameraOn;
    try {
      await lp.setCameraEnabled(next);
      setCameraOn(next);
      refreshParticipants();
    } catch (e) { console.warn('[livekit] camera toggle failed', e); }
  };

  const toggleMic = async () => {
    const lp = roomRef.current?.localParticipant;
    if (!lp) return;
    const next = !micOn;
    try {
      await lp.setMicrophoneEnabled(next);
      setMicOn(next);
    } catch (e) { console.warn('[livekit] mic toggle failed', e); }
  };

  const toggleScreenShare = async () => {
    const lp = roomRef.current?.localParticipant;
    if (!lp) return;
    try {
      const LK = (window as any).LivekitClient;
      const isSharing = lp.isScreenShareEnabled ?? false;
      await lp.setScreenShareEnabled(!isSharing);
      refreshParticipants();
    } catch (e) { console.warn('[livekit] screenshare failed', e); }
  };

  const handleJoin = () => {
    setConnecting(true);
    // Defer to avoid flicker; the useEffect above handles actual connection
    setTimeout(() => {
      setConnecting(false);
      setJoined(true);
    }, 100);
  };

  const handleEnd = async () => {
    if (!window.confirm(t('livekit.endConfirm'))) return;
    setEnding(true);
    try {
      await api.patch(`/api/livekit/rooms/${roomId}`, { status: 'closed' });
      handleLeave();
      onEnded?.();
    } catch (err: any) {
      const status = err instanceof ApiError ? err.status : undefined;
      errorToast(t('livekit.endFailed'), `${status ?? ''} ${err?.message ?? ''}`.trim());
    } finally {
      setEnding(false);
    }
  };

  // ── In-room view ────────────────────────────────────────────────────────────
  if (joined) {
    const allParticipants = [
      ...(localParticipant ? [{ p: localParticipant, isLocal: true }] : []),
      ...remoteParticipants.map(p => ({ p, isLocal: false })),
    ];

    const gridCols = allParticipants.length <= 1 ? 'grid-cols-1'
      : allParticipants.length <= 2 ? 'grid-cols-1 sm:grid-cols-2'
      : allParticipants.length <= 4 ? 'grid-cols-2'
      : 'grid-cols-2 sm:grid-cols-3';

    return (
      <Card data-testid={`livekit-room-${roomId}`}>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{title}</CardTitle>
            {description && <CardDescription className="truncate text-xs">{description}</CardDescription>}
          </div>
          <div className="flex flex-wrap gap-2">
            {isHost && (
              <Button type="button" variant="destructive" size="sm" onClick={handleEnd} disabled={ending} data-testid="livekit-end-inroom">
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

        <CardContent className="space-y-3">
          {roomError && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{roomError}</div>
          )}

          {/* Participant grid */}
          <div className={`grid gap-2 ${gridCols}`}>
            {allParticipants.length === 0 ? (
              <div className="aspect-video bg-gray-900 rounded-lg flex items-center justify-center text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                Σύνδεση…
              </div>
            ) : (
              allParticipants.map(({ p, isLocal }) => (
                <ParticipantTile key={p.identity ?? (isLocal ? '__local' : Math.random())} participant={p} isLocal={isLocal} />
              ))
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 flex-wrap justify-center pt-1">
            <Button type="button" variant={micOn ? 'outline' : 'destructive'} size="sm" onClick={toggleMic} title={micOn ? 'Σίγαση' : 'Ενεργοποίηση μικρόφωνου'}>
              {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            </Button>
            <Button type="button" variant={cameraOn ? 'outline' : 'destructive'} size="sm" onClick={toggleCamera} title={cameraOn ? 'Απενεργοποίηση κάμερας' : 'Ενεργοποίηση κάμερας'}>
              {cameraOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={toggleScreenShare} title="Κοινή χρήση οθόνης">
              <MonitorUp className="w-4 h-4" />
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleLeave} className="ml-4 text-red-600 border-red-200 hover:bg-red-50">
              <PhoneOff className="w-4 h-4 mr-1" />
              {t('livekit.leave')}
            </Button>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            {remoteParticipants.length} {remoteParticipants.length === 1 ? 'άτομο' : 'άτομα'} στην κλήση
          </p>
        </CardContent>
      </Card>
    );
  }

  // ── Pre-join view ───────────────────────────────────────────────────────────
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
