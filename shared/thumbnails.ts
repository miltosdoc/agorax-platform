/**
 * Thumbnail catalogue.
 *
 * Every community, proposal and poll needs a picture; the design has an image
 * slot on every card and a grey box in each one reads as broken.
 *
 * The rule this file follows: **a placeholder should be quiet and mean
 * something.** An earlier version drew loud abstract geometry — it filled the
 * slot but fought the card and told the reader nothing. What replaced it is a
 * soft tinted ground carrying one low-contrast icon of *what the thing is*: a
 * community of people, a document, a ballot, a soundwave. It recedes behind
 * the title, and where it is noticed it is informative.
 *
 * Still generated rather than photographed — no licences to audit, a few
 * hundred bytes each, and every one already in the platform's palette.
 *
 * A key is `<motif>-<palette>`, e.g. `people-aegean`. An author who chooses
 * nothing gets a key derived from the row id, so the same row always draws the
 * same picture and a grid never reshuffles between loads. An uploaded
 * photograph always wins.
 */

/**
 * The motifs. Each is a civic noun, not an abstraction — chosen so a card can
 * be given the icon of its own category or kind and have the picture say
 * something true.
 */
export const THUMBNAIL_MOTIFS = [
  'people',     // a community
  'assembly',   // a gathering / meeting
  'document',   // a proposal
  'ballot',     // a vote
  'chart',      // a poll or result
  'soundwave',  // a podcast
  'play',       // a video
  'leaf',       // environment
  'landmark',   // politics, institutions
  'scales',     // justice, solidarity
  'pulse',      // health
  'coins',      // economy
  'masks',      // culture
  'handshake',  // agreement
  'lightbulb',  // an idea
  'globe',      // the platform at large
] as const;

export type ThumbnailMotif = (typeof THUMBNAIL_MOTIFS)[number];

/**
 * Palettes, all from the AgoraX token family. `ground` is a wash, `ink` the
 * icon, `accent` its secondary strokes.
 *
 * Contrast here is deliberately low: this sits *behind* a title, not beside
 * it. Values are literal rather than CSS variables because a thumbnail is also
 * rendered into a standalone SVG that no stylesheet follows.
 */
export const THUMBNAIL_PALETTES = {
  aegean:     { ground: '#EDF2F8', ink: '#5C87B5', accent: '#A8C2DC' },
  mist:       { ground: '#F1F2ED', ink: '#7A8590', accent: '#B4BCC4' },
  marble:     { ground: '#FAFAF7', ink: '#8A9199', accent: '#C3C8CD' },
  olive:      { ground: '#EEF4EE', ink: '#6E9B7B', accent: '#AFCBB7' },
  clay:       { ground: '#F8EFEE', ink: '#B5827E', accent: '#DBBCB9' },
  bronze:     { ground: '#F6F1E4', ink: '#B09159', accent: '#D8C69C' },
  lilac:      { ground: '#F1EEF7', ink: '#8F7BB5', accent: '#C2B5DB' },
  slate:      { ground: '#E9ECEF', ink: '#6B7480', accent: '#A8AFB8' },
} as const;

export type ThumbnailPalette = keyof typeof THUMBNAIL_PALETTES;
export const THUMBNAIL_PALETTE_KEYS = Object.keys(THUMBNAIL_PALETTES) as ThumbnailPalette[];

/** Every combination the picker offers. 16 × 8 = 128. */
export const THUMBNAIL_KEYS: string[] = THUMBNAIL_MOTIFS.flatMap((motif) =>
  THUMBNAIL_PALETTE_KEYS.map((palette) => `${motif}-${palette}`),
);

export interface ParsedThumbnail {
  motif: ThumbnailMotif;
  palette: ThumbnailPalette;
}

export function isThumbnailKey(value: unknown): value is string {
  return typeof value === 'string' && parseThumbnailKey(value) !== null;
}

export function parseThumbnailKey(key: string | null | undefined): ParsedThumbnail | null {
  if (!key) return null;
  const dash = key.lastIndexOf('-');
  if (dash <= 0) return null;
  const motif = key.slice(0, dash) as ThumbnailMotif;
  const palette = key.slice(dash + 1) as ThumbnailPalette;
  if (!THUMBNAIL_MOTIFS.includes(motif)) return null;
  if (!(palette in THUMBNAIL_PALETTES)) return null;
  return { motif, palette };
}

/**
 * Which motif suits a community category or a media kind, so the derived
 * picture is about the thing rather than arbitrary. Falls through to null when
 * there is nothing to go on, and the hash picks instead.
 */
export function motifForSubject(subject: string | null | undefined): ThumbnailMotif | null {
  switch (subject) {
    case 'perivallon': return 'leaf';
    case 'politiki': return 'landmark';
    case 'allilengyi': return 'scales';
    case 'ygeia': return 'pulse';
    case 'oikonomia': return 'coins';
    case 'politismos': return 'masks';
    case 'koinonia': return 'people';
    case 'podcast': return 'soundwave';
    case 'video': return 'play';
    case 'document': return 'document';
    case 'proposal': return 'document';
    case 'survey': return 'chart';
    case 'community': return 'people';
    case 'meeting': return 'assembly';
    default: return null;
  }
}

function fnv1a(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

/**
 * The trailing integer of a seed like `community-17`, if there is one.
 *
 * This is what makes the colour rotate instead of scatter — see below.
 */
function seedOrdinal(seed: string | number): number | null {
  if (typeof seed === 'number') return Number.isFinite(seed) ? Math.abs(Math.trunc(seed)) : null;
  const match = /(\d+)\s*$/.exec(seed);
  return match ? Number.parseInt(match[1], 10) : null;
}

/**
 * The picture a row gets when nobody chose one.
 *
 * **Colour rotates, it does not hash.** An earlier version hashed the seed for
 * both axes, which only *hopes* for spread: with eight palettes and eighteen
 * communities the birthday problem all but guarantees neighbours in the same
 * colour, and a grid of them looks accidental. Taking `id % 8` instead means
 * consecutively created rows are always a different colour, and the wall reads
 * as designed. Where a seed carries no id (a picker swatch), the hash stands
 * in — nothing there is adjacent to anything.
 *
 * **The motif means something.** It comes from the subject — a community in
 * περιβάλλον gets the leaf, a podcast gets the soundwave — and falls back to
 * the hash only when there is nothing to go on.
 *
 * Both axes stay deterministic, so no row ever changes picture between loads
 * and nothing has to be stored for the default to be stable.
 */
export function thumbnailKeyFor(seed: string | number, subject?: string | null): string {
  const ordinal = seedOrdinal(seed);
  const hash = fnv1a(String(seed));

  const motif = motifForSubject(subject) ?? THUMBNAIL_MOTIFS[hash % THUMBNAIL_MOTIFS.length];
  const palette = THUMBNAIL_PALETTE_KEYS[
    (ordinal ?? hash) % THUMBNAIL_PALETTE_KEYS.length
  ];
  return `${motif}-${palette}`;
}

/** Split a key into its two axes, so each can be changed on its own. */
export function thumbnailAxes(key: string | null | undefined, seed: string | number, subject?: string | null) {
  const parsed = parseThumbnailKey(resolveThumbnailKey(key, seed, subject))!;
  return parsed;
}

/** Recombine the two axes into a key. */
export function thumbnailKeyOf(motif: ThumbnailMotif, palette: ThumbnailPalette): string {
  return `${motif}-${palette}`;
}

/** The author's choice if valid, otherwise one derived from the seed. */
export function resolveThumbnailKey(
  chosen: string | null | undefined,
  seed: string | number,
  subject?: string | null,
): string {
  return parseThumbnailKey(chosen) ? chosen! : thumbnailKeyFor(seed, subject);
}

/**
 * The icon geometry, drawn on a 0 0 48 48 grid.
 *
 * Stroked rather than filled, with round joins, at a weight that reads at
 * 40px and still holds together at 200px. Returned as markup so React, a
 * standalone .svg file and an email all render the identical drawing instead
 * of three implementations drifting apart.
 */
export function motifPaths(motif: ThumbnailMotif): string {
  switch (motif) {
    case 'people':
      return `
        <circle cx="18" cy="17" r="6"/>
        <path d="M7 39c0-6.1 4.9-11 11-11s11 4.9 11 11"/>
        <circle cx="33" cy="19" r="4.5"/>
        <path d="M31 28.6c5 .9 8.9 5.3 8.9 10.4"/>`;

    case 'assembly':
      // Seats curved around a speaker's floor.
      return `
        <path d="M9 34a15 15 0 0 1 30 0"/>
        <path d="M15 34a9 9 0 0 1 18 0"/>
        <circle cx="24" cy="14" r="4"/>
        <path d="M6 39h36"/>`;

    case 'document':
      return `
        <path d="M13 6h14l8 8v28H13z"/>
        <path d="M27 6v8h8"/>
        <path d="M19 24h10M19 30h10M19 18h5"/>`;

    case 'ballot':
      return `
        <path d="M8 20h32v20H8z"/>
        <path d="M18 20V9h12v11"/>
        <path d="M20 14.5l3 3 6-6"/>
        <path d="M20 30h8"/>`;

    case 'chart':
      return `
        <path d="M8 40h32"/>
        <path d="M14 40V26M24 40V14M34 40V21"/>`;

    case 'soundwave':
      // The podcast mark: bars rising and falling, the shape of sound.
      return `
        <path d="M7 24v3"/>
        <path d="M13 19v13"/>
        <path d="M19 12v27"/>
        <path d="M25 8v35"/>
        <path d="M31 14v23"/>
        <path d="M37 20v11"/>
        <path d="M43 23v5"/>`;

    case 'play':
      return `
        <rect x="6" y="11" width="36" height="26" rx="3"/>
        <path d="M20 19.5l9 5.5-9 5.5z"/>`;

    case 'leaf':
      return `
        <path d="M38 10c0 15-8 24-20 24-3 0-6-.8-8-2 2-14 10-22 28-22z"/>
        <path d="M10 40c4-10 10-17 20-22"/>`;

    case 'landmark':
      return `
        <path d="M6 18L24 8l18 10"/>
        <path d="M8 40h32"/>
        <path d="M13 22v14M21 22v14M27 22v14M35 22v14"/>`;

    case 'scales':
      return `
        <path d="M24 10v30M14 40h20"/>
        <path d="M9 17h30"/>
        <path d="M9 17l-5 10h10zM39 17l-5 10h10z"/>`;

    case 'pulse':
      return `
        <path d="M5 25h8l4-9 6 20 5-14 3 3h12"/>`;

    case 'coins':
      return `
        <ellipse cx="19" cy="15" rx="12" ry="5"/>
        <path d="M7 15v7c0 2.8 5.4 5 12 5s12-2.2 12-5v-7"/>
        <ellipse cx="29" cy="31" rx="12" ry="5"/>
        <path d="M17 31v7c0 2.8 5.4 5 12 5s12-2.2 12-5v-7"/>`;

    case 'masks':
      return `
        <path d="M6 12h16v12a8 8 0 0 1-16 0z"/>
        <path d="M11 18h.01M17 18h.01"/>
        <path d="M26 12h16v12a8 8 0 0 1-16 0z"/>
        <path d="M31 18h.01M37 18h.01"/>
        <path d="M11 33c2 2 6 2 8 0M31 33c2 2 6 2 8 0"/>`;

    case 'handshake':
      return `
        <path d="M4 20l8-6 6 4 6-2 6 2 6-4 8 6"/>
        <path d="M12 22l7 7 4-3 5 5 4-4 6-5"/>
        <path d="M18 29l-4 4M23 33l-3 3"/>`;

    case 'lightbulb':
      return `
        <path d="M24 6a12 12 0 0 0-7 21.8V32h14v-4.2A12 12 0 0 0 24 6z"/>
        <path d="M19 37h10M21 42h6"/>`;

    case 'globe':
    default:
      return `
        <circle cx="24" cy="24" r="17"/>
        <path d="M24 7c-5 5-7.5 11-7.5 17S19 36 24 41c5-5 7.5-11 7.5-17S29 12 24 7z"/>
        <path d="M7.5 24h33"/>`;
  }
}

/**
 * A complete standalone SVG for a key.
 *
 * The icon is centred on a square canvas at a fixed size. Because covers are
 * 2:1 and marks are 1:1, the renderer keeps `preserveAspectRatio` default
 * (meet) so the drawing is never stretched — an icon squashed into a banner
 * looks like a bug, unlike the abstract geometry this replaced.
 */
export function thumbnailSvg(key: string, seed: string | number = key): string {
  const parsed = parseThumbnailKey(key) ?? parseThumbnailKey(thumbnailKeyFor(seed))!;
  const { ground, ink, accent } = THUMBNAIL_PALETTES[parsed.palette];
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">',
    `<rect width="48" height="48" fill="${ground}"/>`,
    `<g fill="none" stroke="${ink}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"`,
    ` transform="translate(24 24) scale(0.62) translate(-24 -24)">`,
    motifPaths(parsed.motif),
    '</g>',
    '</svg>',
  ].join('');
}
