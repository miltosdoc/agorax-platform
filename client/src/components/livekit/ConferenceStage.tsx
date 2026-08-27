/**
 * Everything inside a live call that AgoraX adds on top of LiveKit's own
 * <VideoConference /> — the header, the raise-hand button, the speaking queue
 * and the participant list.
 *
 * It has to live in its own component because all of that reads from the
 * LiveKit room context, which only exists below <LiveKitRoom>.
 *
 * The design bias: a video grid is a bad chair. Tiles reorder themselves
 * around whoever is loudest, which is precisely the wrong ordering for a
 * meeting where the point is that quiet people get a turn. So the queue is
 * rendered as an ordered list, in the open, above the grid — the same
 * information a raised hand carries in a room with chairs in it.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  VideoConference,
  useLocalParticipant,
  useParticipants,
} from '@livekit/components-react';
import type { Participant } from 'livekit-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Hand,
  Mic,
  MicOff,
  Users,
  Video as VideoIcon,
  VideoOff,
  X,
  XCircle,
} from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';
import { useErrorToast } from '@/hooks/use-error-toast';
import {
  HAND_ATTRIBUTE,
  handAttributePatch,
  parseHandRaisedAt,
  queuePositionOf,
  speakerQueue,
} from '@shared/conference';

interface Props {
  title: string;
  subtitle?: string | null;
  capacity: number;
  isHost: boolean;
  ending: boolean;
  onEndForAll: () => void;
}

export function ConferenceStage({ title, subtitle, capacity, isHost, ending, onEndForAll }: Props) {
  const { t } = useTranslation();
  const errorToast = useErrorToast();
  const { localParticipant } = useLocalParticipant();
  const participants = useParticipants();
  const [panelOpen, setPanelOpen] = useState(false);
  const [handBusy, setHandBusy] = useState(false);

  const queue = useMemo(() => speakerQueue(participants), [participants]);
  const myPosition = localParticipant ? queuePositionOf(queue, localParticipant.identity) : null;
  const handUp = myPosition !== null;

  const toggleHand = useCallback(async () => {
    if (!localParticipant || handBusy) return;
    setHandBusy(true);
    try {
      // Spread the existing map: setAttributes replaces what it is given, and
      // a hand raise must not quietly wipe an attribute something else wrote.
      await localParticipant.setAttributes({
        ...localParticipant.attributes,
        ...handAttributePatch(!handUp, Date.now()),
      });
    } catch (err: any) {
      errorToast(t('conference.hand_failed'), err?.message);
    } finally {
      setHandBusy(false);
    }
  }, [localParticipant, handUp, handBusy, errorToast, t]);

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-2 px-3 py-2 border-b border-white/10 text-white flex-wrap">
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold truncate">{title}</h1>
          {subtitle && <p className="text-xs text-white/60 truncate">{subtitle}</p>}
        </div>

        <Badge variant="outline" className="border-white/20 text-white/80 gap-1" data-testid="conference-headcount">
          <Users className="w-3 h-3" />
          {participants.length}/{capacity}
        </Badge>
        <Badge variant="outline" className="border-red-400/50 text-red-300">
          {t('livekit.live')}
        </Badge>

        <Button
          type="button"
          size="sm"
          variant={handUp ? 'default' : 'outline'}
          onClick={toggleHand}
          disabled={handBusy}
          className={handUp ? '' : 'bg-transparent text-white border-white/25 hover:bg-white/10 hover:text-white'}
          data-testid="conference-raise-hand"
          aria-pressed={handUp}
        >
          <Hand className="w-4 h-4 mr-1" />
          {handUp
            ? t('conference.hand_lower').replace('{position}', String(myPosition))
            : t('conference.hand_raise')}
        </Button>

        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setPanelOpen(open => !open)}
          className="bg-transparent text-white border-white/25 hover:bg-white/10 hover:text-white"
          data-testid="conference-participants-toggle"
          aria-expanded={panelOpen}
        >
          <Users className="w-4 h-4 mr-1" />
          {t('conference.participants')}
        </Button>

        {isHost && (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onEndForAll}
            disabled={ending}
            data-testid="conference-end-for-all"
          >
            <XCircle className="w-4 h-4 mr-1" />
            {t('conference.end_for_all')}
          </Button>
        )}
      </header>

      {queue.length > 0 && (
        <div
          className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/15 border-b border-amber-400/30 text-amber-100 text-xs overflow-x-auto"
          data-testid="conference-queue"
        >
          <Hand className="w-3.5 h-3.5 shrink-0" />
          <span className="shrink-0 font-medium">{t('conference.queue_label')}</span>
          <ol className="flex items-center gap-2 min-w-0">
            {queue.map((entry, index) => (
              <li key={entry.identity} className="whitespace-nowrap">
                <span className="opacity-60">{index + 1}.</span> {entry.name}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="flex-1 min-h-0 relative">
        <VideoConference />
        {panelOpen && (
          <ParticipantPanel
            participants={participants}
            capacity={capacity}
            onClose={() => setPanelOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

function ParticipantPanel({
  participants,
  capacity,
  onClose,
}: {
  participants: Participant[];
  capacity: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  // Hands first, in the order they went up; then everyone else by name, so
  // the list does not reshuffle every time somebody speaks.
  const ordered = useMemo(() => {
    return [...participants].sort((a, b) => {
      const ah = parseHandRaisedAt(a.attributes?.[HAND_ATTRIBUTE]);
      const bh = parseHandRaisedAt(b.attributes?.[HAND_ATTRIBUTE]);
      if (ah && bh) return ah - bh;
      if (ah) return -1;
      if (bh) return 1;
      return (a.name || a.identity).localeCompare(b.name || b.identity);
    });
  }, [participants]);

  return (
    <aside
      className="absolute inset-y-0 right-0 z-10 w-72 max-w-[85vw] bg-black/85 backdrop-blur border-l border-white/10 text-white flex flex-col"
      data-testid="conference-participants-panel"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <h2 className="text-sm font-semibold">
          {t('conference.participants')} · {participants.length}/{capacity}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-white/10"
          aria-label={t('common.close')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <ul className="flex-1 overflow-y-auto py-1">
        {ordered.map(p => {
          const hand = parseHandRaisedAt(p.attributes?.[HAND_ATTRIBUTE]);
          return (
            <li
              key={p.identity}
              className={`flex items-center gap-2 px-3 py-2 text-sm ${p.isSpeaking ? 'bg-white/10' : ''}`}
              data-testid={`conference-participant-${p.identity}`}
            >
              {hand ? (
                <Hand className="w-4 h-4 shrink-0 text-amber-300" />
              ) : (
                <span className="w-4 shrink-0" />
              )}
              <span className="min-w-0 flex-1 truncate">
                {p.name || p.identity}
                {p.isLocal && <span className="text-white/50"> {t('conference.you')}</span>}
              </span>
              {p.isMicrophoneEnabled
                ? <Mic className="w-3.5 h-3.5 shrink-0 text-white/60" />
                : <MicOff className="w-3.5 h-3.5 shrink-0 text-white/30" />}
              {p.isCameraEnabled
                ? <VideoIcon className="w-3.5 h-3.5 shrink-0 text-white/60" />
                : <VideoOff className="w-3.5 h-3.5 shrink-0 text-white/30" />}
            </li>
          );
        })}
      </ul>
      <p className="px-3 py-2 border-t border-white/10 text-[11px] leading-snug text-white/50">
        {t('conference.panel_hint')}
      </p>
    </aside>
  );
}
