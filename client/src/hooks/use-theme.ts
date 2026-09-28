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
  LANDING_LOOK_KEY,
  LANDING_THEMES,
  THEME_STORAGE_KEY,
  isAccentTheme,
  landingThemeOf,
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

/** Whether this browser holds a choice (menu or account), not just the default. */
function readChosen(): boolean {
  try {
    return isAccentTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return false;
  }
}

let current: AccentTheme = typeof window !== 'undefined' ? readStored() : DEFAULT_THEME;
let chosen = typeof window !== 'undefined' ? readChosen() : false;
const listeners = new Set<() => void>();

// On the landing page the pre-paint script has already painted the page's
// own look (see useLandingTheme); repainting the stored theme here would
// flash it for a frame before the page takes over.
if (typeof window !== 'undefined' && window.location.pathname !== '/') applyToDocument(current);

export function getTheme(): AccentTheme {
  return current;
}

export function setTheme(theme: AccentTheme) {
  // Picking the theme already showing still counts: it turns the default
  // into a choice, which the landing page's random look must then respect.
  if (!isAccentTheme(theme) || (theme === current && chosen)) return;
  current = theme;
  chosen = true;
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

/**
 * The look this visitor gets on the landing page, which comes in navy or
 * spray only. A theme they chose wins (another theme shows as navy there);
 * someone who never chose is dealt one of the two at random, once, and keeps
 * it on later visits. index.html deals it before the first paint, with the
 * same key, so the page never flashes the other look.
 */
let dealt: AccentTheme | null = null;

function dealtLook(): AccentTheme {
  if (dealt) return dealt;
  try {
    const kept = localStorage.getItem(LANDING_LOOK_KEY);
    if (isAccentTheme(kept) && LANDING_THEMES.includes(kept)) return (dealt = kept);
    dealt = LANDING_THEMES[Math.floor(Math.random() * LANDING_THEMES.length)];
    localStorage.setItem(LANDING_LOOK_KEY, dealt);
  } catch {
    dealt = DEFAULT_THEME;
  }
  return dealt;
}

export function useLandingTheme(): AccentTheme {
  const choice = useSyncExternalStore(subscribe, () => (chosen ? current : ''), () => '');
  return isAccentTheme(choice) ? landingThemeOf(choice) : dealtLook();
}
