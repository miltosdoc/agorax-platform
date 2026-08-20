/**
 * Language Switcher Component
 * 
 * Renders a dropdown/toggle between Greek and English.
 * Placed in the header navigation bar.
 */

import { useTranslation } from '@/hooks/use-translation';
import { LOCALE_NAMES, LOCALE_FLAGS, SUPPORTED_LOCALES, type Locale } from '@/lib/i18n-types';
import { useState, useRef, useEffect } from 'react';

export function LanguageSwitcher() {
  const { locale, setLocale } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (newLocale: Locale) => {
    setLocale(newLocale);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium rounded-lg
                   hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        aria-label="Switch language"
      >
        <span className="text-base">{LOCALE_FLAGS[locale]}</span>
        <span className="hidden sm:inline">{LOCALE_NAMES[locale]}</span>
        <svg
          className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-40 bg-white dark:bg-gray-900 rounded-lg shadow-lg 
                        border border-gray-200 dark:border-gray-700 py-1 z-50">
          {SUPPORTED_LOCALES.map((loc) => (
            <button
              key={loc}
              onClick={() => handleSelect(loc)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors
                ${locale === loc
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
            >
              <span className="text-base">{LOCALE_FLAGS[loc]}</span>
              <span>{LOCALE_NAMES[loc]}</span>
              {locale === loc && (
                <svg className="w-4 h-4 ml-auto text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
