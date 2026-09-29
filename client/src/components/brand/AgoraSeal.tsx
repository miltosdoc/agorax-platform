/**
 * The logo's mark set as a seal: a ring, a finer dotted ring inside it and
 * the mark in the middle, in the text colour. It stamps the documents that
 * vouch for a vote: the ballot receipt and the verification page.
 */
import { cn } from '@/lib/utils';
import { MARK } from './logo-paths';

// The mark (204.8 × 229.76) scaled to 46 high and centred in a 100 box.
const SCALE = 46 / 229.76;
const X = 50 - (204.8 * SCALE) / 2;
const Y = 50 - 23;

export function AgoraSeal({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" width="100" height="100" className={cn('block', className)} aria-hidden="true" focusable="false">
      <circle cx="50" cy="50" r="47" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <circle cx="50" cy="50" r="40.5" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="0.1 3.2" strokeLinecap="round" />
      <path d={MARK} fill="currentColor" transform={`translate(${X} ${Y}) scale(${SCALE})`} />
    </svg>
  );
}
