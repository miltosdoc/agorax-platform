/**
 * The AgoraX logo, drawn inline so it takes the theme's colours: the
 * network mark, the ΑΓΟΡΑ letters and, where there is room to read it, the
 * line underneath («Πλατφόρμα Ψηφιακής Δημοκρατίας»). The designer drew it
 * in two inks; here the mark and most letters take the theme's accent and
 * the rest its ink, so it belongs to every theme (navy and blue, lime on
 * Spray, gold on Parliament) and follows a data-accent wrapper too.
 *
 * tone: 'paper' sits on the page's own background;
 *       'ink' sits on a bg-ink surface such as the footer, in its text colour;
 *       'current' takes the CSS color around it (one ink).
 */
import { cn } from '@/lib/utils';
import { LETTERS_A, LETTERS_B, MARK, TAGLINE } from './logo-paths';

type Tone = 'paper' | 'ink' | 'current';

// [accent part, ink part, opacity of the ink part]
const INKS: Record<Tone, [string, string, number]> = {
  paper: ['var(--kyanos)', 'var(--ink)', 1],
  ink: ['var(--paper)', 'var(--paper)', 0.72],
  current: ['currentColor', 'currentColor', 1],
};

interface Props {
  tone?: Tone;
  className?: string;
  /** The accessible name; leave empty where a link or text around says it. */
  title?: string;
}

function a11y(title?: string) {
  return title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true as const };
}

/** The mark and the letters; with `tagline`, the line underneath as well. */
export function AgoraLogo({ tone = 'paper', tagline = false, className, title }: Props & { tagline?: boolean }) {
  const [a, b, soft] = INKS[tone];
  return (
    <svg viewBox="0 0 1000 229.76" width="1000" height="229.76" className={cn('block', className)} focusable="false" {...a11y(title)}>
      <path d={MARK + LETTERS_A} style={{ fill: a }} />
      <path d={LETTERS_B + (tagline ? TAGLINE : '')} style={{ fill: b, fillOpacity: soft }} />
    </svg>
  );
}

/** The network mark alone, for square places. */
export function AgoraMark({ tone = 'paper', className, title }: Props) {
  return (
    <svg viewBox="0 0 204.8 229.76" width="204.8" height="229.76" className={cn('block', className)} focusable="false" {...a11y(title)}>
      <path d={MARK} style={{ fill: INKS[tone][0] }} />
    </svg>
  );
}
