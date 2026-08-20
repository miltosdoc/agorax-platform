/**
 * AgoraX i18n — Internationalization System
 * 
 * Supports: English (en), Greek (el)
 * Default: Greek (el) — the platform's primary audience
 * 
 * Usage:
 *   import { useTranslation } from '@/hooks/use-translation';
 *   const { t, locale, setLocale } = useTranslation();
 *   <h1>{t('home.heroTitle')}</h1>
 */

export type Locale = 'en' | 'el';

export const DEFAULT_LOCALE: Locale = 'el';
export const SUPPORTED_LOCALES: Locale[] = ['el', 'en'];

export const LOCALE_NAMES: Record<Locale, string> = {
  el: 'Ελληνικά',
  en: 'English',
};

export const LOCALE_FLAGS: Record<Locale, string> = {
  el: '🇬🇷',
  en: '🇬🇧',
};

// ─── Translation Dictionary Type ────────────────────────────────────────────
// Using Record<string, string> for flexibility — 150+ keys and growing.
// IDE autocomplete comes from the locale files themselves.

export type TranslationDictionary = Record<string, string>;

// ─── Storage helpers ────────────────────────────────────────────────────────

const STORAGE_KEY = 'agorax-locale';

export function getStoredLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  
  // 1. Check localStorage
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && SUPPORTED_LOCALES.includes(stored as Locale)) {
    return stored as Locale;
  }
  
  // 2. Check URL param (?lang=en)
  const params = new URLSearchParams(window.location.search);
  const urlLang = params.get('lang');
  if (urlLang && SUPPORTED_LOCALES.includes(urlLang as Locale)) {
    return urlLang as Locale;
  }
  
  // 3. Check browser language
  const browserLang = navigator.language.split('-')[0];
  if (SUPPORTED_LOCALES.includes(browserLang as Locale)) {
    return browserLang as Locale;
  }
  
  return DEFAULT_LOCALE;
}

export function setStoredLocale(locale: Locale): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, locale);
}
