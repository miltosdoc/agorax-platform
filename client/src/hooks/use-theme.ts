/**
 * The colour theme as a tiny external store.
 *
 * Not a provider: the theme is read before React mounts (index.html applies
 * it pre-paint from localStorage so the first frame is already the right
 * colour) and written from one control, so a module-level value with
 * subscribers is enough and every component that asks sees the same answer.
 */

import { useSyncExternalStore } from 'react';
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  isAccentTheme,
  type AccentTheme,
} from '@shared/theme';

function readStored(): AccentTheme {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return isAccentTheme(raw) ? raw : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function applyToDocument(theme: AccentTheme) {
  const root = document.documentElement;
  if (theme === DEFAULT_THEME) root.removeAttribute('data-accent');
  else root.setAttribute('data-accent', theme);
}

let current: AccentTheme = typeof window !== 'undefined' ? readStored() : DEFAULT_THEME;
const listeners = new Set<() => void>();

if (typeof window !== 'undefined') applyToDocument(current);

export function getTheme(): AccentTheme {
  return current;
}

export function setTheme(theme: AccentTheme) {
  if (!isAccentTheme(theme) || theme === current) return;
  current = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private mode or blocked storage: the theme still applies for this page.
  }
  applyToDocument(theme);
  listeners.forEach((l) => l());
}

/**
 * Quick Look: paint the page in a theme without choosing it. Pass null to
 * return to the chosen one. Used by the Appearance gallery on hover, so a
 * member sees teal on the real page before committing to it.
 */
export function previewTheme(theme: AccentTheme | null) {
  applyToDocument(theme ?? current);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getTheme, () => DEFAULT_THEME);
  return { theme, setTheme };
}
