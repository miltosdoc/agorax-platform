import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface PhaseCountdownProps {
  deadline: string | null | undefined;
  label?: string;
  onExpired?: () => void;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`;
  }
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function PhaseCountdown({ deadline, label, onExpired }: PhaseCountdownProps) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [fired, setFired] = useState(false);

  useEffect(() => {
    if (!deadline) { setRemaining(null); return; }

    const target = new Date(deadline).getTime();

    function tick() {
      const diff = target - Date.now();
      setRemaining(diff);
      if (diff <= 0 && !fired) {
        setFired(true);
        onExpired?.();
      }
    }

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadline, onExpired, fired]);

  if (!deadline || remaining === null) return null;

  const expired = remaining <= 0;
  const urgent = !expired && remaining < 2 * 3600 * 1000;

  return (
    <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-mono
      ${expired ? 'bg-red-50 border border-red-200 text-red-700' :
        urgent ? 'bg-amber-50 border border-amber-200 text-amber-800' :
                 'bg-blue-50 border border-blue-200 text-blue-800'}`}>
      <Clock className="w-4 h-4 shrink-0" />
      <span className="text-xs text-muted-foreground mr-1">{label || 'Χρόνος φάσης:'}</span>
      {expired
        ? <Badge variant="destructive" className="text-xs">Λήγνει — αυτόματη μετάβαση…</Badge>
        : <span className="font-semibold tracking-wider">{formatCountdown(remaining)}</span>}
    </div>
  );
}
