/**
 * Mobile OAuth deep-link handler.
 *
 * Google blocks OAuth inside webviews, so the Android app runs the flow in
 * the system browser (/auth/google?mobile=1). The server callback redirects
 * to agorax://auth?code=<one-time code>, Android reopens the app, and
 * Capacitor's App plugin fires appUrlOpen. This hook catches that event,
 * exchanges the code for a webview session, and navigates to returnTo.
 *
 * No-op on regular browsers (Capacitor isn't injected there).
 */
import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';

export function useMobileAuthDeepLink() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const cap = (window as any).Capacitor;
    const appPlugin = cap?.isNativePlatform?.() ? cap.Plugins?.App : undefined;
    if (!appPlugin?.addListener) return;

    const sub = appPlugin.addListener('appUrlOpen', async (event: { url: string }) => {
      let code: string | null = null;
      try {
        const url = new URL(event.url);
        if (url.protocol !== 'agorax:' || url.host !== 'auth') return;
        code = url.searchParams.get('code');
      } catch {
        return;
      }
      if (!code) return;

      try {
        const resp = await api.post<{ returnTo?: string }>('/api/auth/mobile-exchange', { code });
        queryClient.setQueryData(['/api/user'], resp.data);
        await queryClient.invalidateQueries({ queryKey: ['/api/user'] });
        setLocation(resp.data.returnTo || '/feed');
      } catch (err) {
        console.error('[mobile-auth] code exchange failed', err);
      }
    });

    return () => {
      sub?.remove?.();
      // Older Capacitor versions return a promise of the handle
      if (typeof sub?.then === 'function') sub.then((h: any) => h?.remove?.());
    };
  }, [setLocation]);
}
