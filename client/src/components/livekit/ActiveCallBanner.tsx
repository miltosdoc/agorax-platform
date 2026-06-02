/**
 * Slim banner that surfaces any *currently-active* community room at
 * the top of the community dashboard. Hides itself when nothing is
 * live so the layout stays compact.
 *
 * The Συναντήσεις / Conferences tab still owns the full list + create
 * UX; this is just the at-a-glance "your community has a call right
 * now" signal.
 */

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mic, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useTranslation } from '@/hooks/use-translation';

interface LivekitRoom {
  id: number;
  kind: 'community' | 'sortition';
  title: string;
  status: 'scheduled' | 'active' | 'closed';
}

interface Props {
  communityId: number;
  /** Called when the user clicks "Join" — host page can switch tabs etc. */
  onJoinClick?: (roomId: number) => void;
}

export function ActiveCallBanner({ communityId, onJoinClick }: Props) {
  const { t } = useTranslation();
  const [active, setActive] = useState<LivekitRoom[]>([]);

  const refresh = useCallback(async () => {
    try {
      const resp = await api.get<LivekitRoom[]>(`/api/communities/${communityId}/rooms`);
      setActive((resp.data ?? []).filter(r => r.status === 'active'));
    } catch {
      setActive([]);
    }
  }, [communityId]);

  useEffect(() => {
    refresh();
    // Soft-poll once a minute so the banner appears within seconds of a
    // host starting a call elsewhere.
    const interval = setInterval(refresh, 60_000);
    return () => clearInterval(interval);
  }, [refresh]);

  if (active.length === 0) return null;

  return (
    <div className="space-y-2 mb-4" data-testid="active-call-banner">
      {active.map(room => (
        <Card key={room.id} className="border-teal-300 bg-teal-50">
          <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <span className="relative inline-flex items-center justify-center w-8 h-8 rounded-full bg-teal-500/20 text-teal-700">
                <Mic className="w-4 h-4" />
                <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{room.title}</div>
                <div className="text-xs text-teal-700">{t('livekit.liveNow')}</div>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => onJoinClick?.(room.id)}
              data-testid={`active-call-join-${room.id}`}
            >
              {t('livekit.join')}
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
