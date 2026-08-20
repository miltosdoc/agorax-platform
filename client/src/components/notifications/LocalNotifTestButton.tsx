/**
 * Direct hardware-test button: bypasses SSE, the bell badge, the server, and
 * Web Push. Tapping it calls window.Capacitor.Plugins.LocalNotifications
 * .createChannel + .schedule synchronously and surfaces the result in a
 * visible <pre> on the page. Used to isolate "is the plugin chain working?"
 * from every upstream piece on Android.
 *
 * Renders as a no-op on regular browsers (Capacitor isn't injected there).
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';

const CHANNEL_ID = 'agorax-default-high';

export function LocalNotifTestButton() {
  const [log, setLog] = useState<string[]>([]);
  const append = (line: string) => setLog((l) => [...l, line]);

  const isNative = !!window.Capacitor?.isNativePlatform?.();
  if (!isNative) return null;

  const plugin = window.Capacitor?.Plugins?.LocalNotifications;

  const run = async () => {
    setLog([]);
    append(`isNative: ${isNative}`);
    append(`hasPlugin: ${!!plugin}`);
    if (!plugin) { append('STOP: plugin not present'); return; }

    try {
      const perm = await (plugin as any).requestPermissions?.();
      append(`permission: ${JSON.stringify(perm)}`);
    } catch (e: any) {
      append(`permission ERROR: ${e?.message ?? e}`);
    }

    try {
      await (plugin as any).createChannel?.({
        id: CHANNEL_ID,
        name: 'AgoraX',
        description: 'AgoraX notifications',
        importance: 5,
        visibility: 1,
        vibration: true,
        lights: true,
        sound: 'default',
      });
      append('createChannel: ok');
    } catch (e: any) {
      append(`createChannel ERROR: ${e?.message ?? e}`);
    }

    try {
      const res = await plugin.schedule({
        notifications: [{
          id: Math.floor(Math.random() * 2_000_000_000),
          title: 'AgoraX hardware test',
          body: `direct plugin call @ ${new Date().toLocaleTimeString()}`,
          channelId: CHANNEL_ID,
        }],
      });
      append(`schedule: ${JSON.stringify(res).slice(0, 120)}`);
    } catch (e: any) {
      append(`schedule ERROR: ${e?.message ?? e}`);
    }
  };

  return (
    <div className="border border-dashed rounded-lg p-3 mb-4 bg-muted/30">
      <div className="flex items-center gap-2 mb-2">
        <Button size="sm" onClick={run} data-testid="local-notif-test">
          Fire native test notification
        </Button>
        <span className="text-xs text-muted-foreground">
          (Android only — bypasses server)
        </span>
      </div>
      {log.length > 0 && (
        <pre className="text-xs whitespace-pre-wrap bg-background border rounded p-2 max-h-48 overflow-auto">
{log.join('\n')}
        </pre>
      )}
    </div>
  );
}
