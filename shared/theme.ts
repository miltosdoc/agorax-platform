/**
 * The member's colour theme.
 *
 * Eight palettes: four from the colours of the AGORA logo set, and four
 * born as design sketches for two audiences — Marble and Parliament for
 * members who want an institution, Spray and Poster for members who want
 * a movement. A theme re-inks the
 * whole interface — the ink family, the paper and line tints, the accent and
 * its wash, the dark ceremony ground — through the tokens in index.css. The
 * vote colours (yper green, kata red) and the ceremony bronze stay fixed in
 * every theme, so no palette can be mistaken for a ballot choice.
 *
 * Shared so the server validates exactly the set the client offers.
 */

export const ACCENT_THEMES = ['navy', 'teal', 'burgundy', 'brown', 'marble', 'parliament', 'spray', 'poster'] as const;
export type AccentTheme = (typeof ACCENT_THEMES)[number];

/** Navy is the kyanós the platform has always used; it is the no-attribute state. */
export const DEFAULT_THEME: AccentTheme = 'navy';

/** localStorage key; also read by the pre-paint script in index.html. */
export const THEME_STORAGE_KEY = 'agorax-theme';

export function isAccentTheme(value: unknown): value is AccentTheme {
  return typeof value === 'string' && (ACCENT_THEMES as readonly string[]).includes(value);
}

/** The accent itself, for swatches in the picker. Mirrors --kyanos in index.css. */
export const THEME_SWATCH: Record<AccentTheme, string> = {
  navy: '#0B4C8C',
  teal: '#1F7A6C',
  burgundy: '#8B2F4A',
  brown: '#8A6530',
  marble: '#8A6420',
  parliament: '#D0AB4F',
  spray: '#C6FF00',
  poster: '#2D3BFF',
};

/** Which themes paint a dark ground; the picker groups by audience, not by this. */
export const DARK_THEMES: readonly AccentTheme[] = ['parliament', 'spray'];
