/**
 * Push notifications opt-in card.
 *
 * Rendered on the notifications page. Shows a single toggle button
 * whose label changes with the current PushStatus. Hidden entirely
 * when the browser doesn't support push or the server has no VAPID
 * keys — push is a progressive enhancement on top of the in-app feed.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { usePush } from '@/hooks/use-push';
import { useTranslation } from '@/hooks/use-translation';

export function PushOptIn() {
  const { t } = useTranslation();
  const { status, busy, subscribe, unsubscribe } = usePush();

  if (status === 'unsupported' || status === 'unconfigured') return null;

  const isOn = status === 'subscribed';
  const isDenied = status === 'denied';

  return (
    <Card data-testid="push-opt-in">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="w-4 h-4" />
          {t('push.title')}
        </CardTitle>
        <CardDescription>{t('push.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {isDenied ? (
          <p className="text-sm text-amber-700">{t('push.deniedHint')}</p>
        ) : (
          <Button
            type="button"
            onClick={isOn ? unsubscribe : subscribe}
            disabled={busy}
            variant={isOn ? 'outline' : 'default'}
            data-testid={isOn ? 'push-disable' : 'push-enable'}
          >
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> :
             isOn ? <BellOff className="w-4 h-4 mr-2" /> : <Bell className="w-4 h-4 mr-2" />}
            {isOn ? t('push.disable') : t('push.enable')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
