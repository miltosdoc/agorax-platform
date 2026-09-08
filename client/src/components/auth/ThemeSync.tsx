/**
 * Adopts the signed-in member's stored colour theme once the session loads.
 *
 * Same shape and same reasoning as LocaleSync: the account is the stated
 * preference, the device is whatever this browser last saw, and the account
 * wins so a member gets their own colours on a new phone. Choosing a theme
 * after that writes back through ThemeSwitcher, so the two never drift.
 *
 * Renders nothing.
 */

import { useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { isAccentTheme } from '@shared/theme';

export function ThemeSync() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();

  // Once per signed-in account, for the reason LocaleSync gives: re-adopting
  // on every render would snap a fresh choice back before its save lands.
  const adoptedFor = useRef<number | null>(null);

  useEffect(() => {
    if (!user) { adoptedFor.current = null; return; }
    if (adoptedFor.current === user.id) return;

    adoptedFor.current = user.id;

    const stored = (user as { theme?: string }).theme;
    if (!stored || stored === theme) return;
    if (!isAccentTheme(stored)) return;

    setTheme(stored);
  }, [user, theme, setTheme]);

  return null;
}
