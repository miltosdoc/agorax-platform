/**
 * AgoraX Translation Hook
 * 
 * Provides the `t()` function for i18n across the app.
 * 
 * Usage:
 *   const { t, locale, setLocale } = useTranslation();
 *   <h1>{t('home.heroTitle')}</h1>
 *   <button onClick={() => setLocale('en')}>English</button>
 */

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import type { Locale, TranslationDictionary } from '../lib/i18n-types';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, getStoredLocale, setStoredLocale } from '../lib/i18n-types';
import en from '../locales/en';
import el from '../locales/el';

// ─── Translation Maps ───────────────────────────────────────────────────────

const translations: Record<Locale, TranslationDictionary> = { en, el };

// ─── Context ────────────────────────────────────────────────────────────────

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: keyof TranslationDictionary, params?: Record<string, string | number>) => string;
  isRTL: boolean;
}

const I18nContext = createContext<I18nContextType>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (key) => key,
  isRTL: false,
});

// ─── Provider ───────────────────────────────────────────────────────────────

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getStoredLocale);

  const setLocale = useCallback((newLocale: Locale) => {
    if (!SUPPORTED_LOCALES.includes(newLocale)) return;
    setLocaleState(newLocale);
    setStoredLocale(newLocale);
  }, []);

  // Update document lang on change
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback(
    (key: keyof TranslationDictionary, params?: Record<string, string | number>): string => {
      let value = translations[locale]?.[key] ?? translations[DEFAULT_LOCALE]?.[key] ?? String(key);
      
      // Simple parameter interpolation: {name} → value
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        });
      }
      
      return value;
    },
    [locale]
  );

  const isRTL = false; // Neither Greek nor English are RTL

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, isRTL }}>
      {children}
    </I18nContext.Provider>
  );
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useTranslation() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useTranslation must be used within an I18nProvider');
  }
  return context;
}

/**
 * Get a standalone t() function for use outside React components.
 * Uses the currently stored locale. Primarily for utility modules.
 */
export function getTranslationFunction() {
  const storedLocale = getStoredLocale();
  return (key: keyof TranslationDictionary, params?: Record<string, string | number>): string => {
    let value = translations[storedLocale]?.[key] ?? translations[DEFAULT_LOCALE]?.[key] ?? String(key);
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      });
    }
    return value;
  };
}

// ─── Status Label Helper ────────────────────────────────────────────────────

/**
 * Map proposal status strings to translation keys.
 * Used in proposal cards, lists, and detail views.
 */
export function getStatusLabel(
  status: string,
  t: (key: keyof TranslationDictionary) => string
): string {
  const statusMap: Record<string, keyof TranslationDictionary> = {
    'draft': 'proposal.status.draft',
    'review': 'proposal.status.review',
    'author_review': 'proposal.status.authorReview',
    'community_signal': 'proposal.status.communitySignal',
    'sortition_synthesis': 'proposal.status.sortitionSynthesis',
    'voting': 'proposal.status.voting',
    'decided': 'proposal.status.decided',
    'archived': 'proposal.status.archived',
  };
  
  const key = statusMap[status];
  return key ? t(key) : status;
}

/**
 * Map community type strings to translation keys.
 */
export function getCommunityTypeLabel(
  type: string,
  t: (key: keyof TranslationDictionary) => string
): string {
  const typeMap: Record<string, keyof TranslationDictionary> = {
    'autonomous': 'community.type.autonomous',
    'managed': 'community.type.managed',
    'hybrid': 'community.type.hybrid',
  };
  
  const key = typeMap[type];
  return key ? t(key) : type;
}

/**
 * Map governance model strings to translation keys.
 */
export function getGovernanceLabel(
  model: string,
  t: (key: keyof TranslationDictionary) => string
): string {
  const govMap: Record<string, keyof TranslationDictionary> = {
    'no_admin': 'community.governance.noAdmin',
    'admin_founded': 'community.governance.adminFounded',
    'admin_guided': 'community.governance.adminGuided',
  };
  
  const key = govMap[model];
  return key ? t(key) : model;
}
