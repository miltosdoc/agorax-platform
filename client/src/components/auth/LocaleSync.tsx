/**
 * Adopts the signed-in member's stored language once the session loads.
 *
 * Without this, the language is whatever this particular browser happens to
 * have in local storage — so signing in on a phone, a library machine, or a
 * fresh profile shows Greek to someone who set English months ago, and the
 * emails arriving in English would not match the site in front of them.
 *
 * The account wins over the device: `users.locale` is the member's stated
 * preference and it is what the mail templates read, so the interface follows
 * it rather than the other way round. Switching the language after that
 * writes back through LanguageSwitcher, so the two never drift.
 *
 * Renders nothing.
 */

import { useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useTranslation } from '@/hooks/use-translation';
import { SUPPORTED_LOCALES, type Locale } from '@/lib/i18n-types';

export function LocaleSync() {
  const { user } = useAuth();
  const { locale, setLocale } = useTranslation();

  // Once per signed-in account. Re-adopting on every render would fight the
  // switcher: the member picks English, this pulls them back to the stored
  // Greek before the save lands, and the control appears broken.
  const adoptedFor = useRef<number | null>(null);

  useEffect(() => {
    if (!user) { adoptedFor.current = null; return; }
    if (adoptedFor.current === user.id) return;

    adoptedFor.current = user.id;

    const stored = (user as { locale?: string }).locale;
    if (!stored || stored === locale) return;
    if (!SUPPORTED_LOCALES.includes(stored as Locale)) return;

    setLocale(stored as Locale);
  }, [user, locale, setLocale]);

  return null;
}
