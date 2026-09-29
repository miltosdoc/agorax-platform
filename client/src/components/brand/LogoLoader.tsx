/**
 * The loading sign, drawn from the logo's mark: the hub stays lit and the
 * five outer nodes light up in turn, arm first, as if the network were
 * connecting. The whole mark shows faintly underneath so the shape reads
 * from the first frame. It takes the text colour (className="text-kyanos").
 * Under reduced motion the mark simply shows, lit.
 *
 * The nodes are not separate shapes: each lit copy of the mark is clipped to
 * circles around one node and its arm (centres from the mark's geometry in
 * logo-paths.ts).
 */
import { useId } from 'react';
import { useTranslation } from '@/hooks/use-translation';
import { cn } from '@/lib/utils';
import { MARK } from './logo-paths';

const HUB: [number, number, number] = [107, 117.3, 50.5];

// Clockwise from top left: [node circle, arm circle], each [cx, cy, r].
const NODES: [number, number, number][][] = [
  [[34.2, 34.2, 35], [65.5, 70, 26]],
  [[168.8, 49, 28.5], [145.2, 75.5, 21]],
  [[184.6, 161.3, 21], [157.5, 145.9, 23]],
  [[86.4, 204.9, 25.5], [94.1, 171.8, 19]],
  [[27, 128.5, 19.5], [51.6, 125.1, 15.5]],
];

export function LogoLoader({ className, label }: { className?: string; label?: string }) {
  const { t } = useTranslation();
  const id = useId().replace(/:/g, '');
  return (
    <svg
      viewBox="0 0 204.8 229.76"
      width="204.8"
      height="229.76"
      className={cn('block', className)}
      role="status"
      aria-label={label ?? t('common.loading')}
    >
      <defs>
        <clipPath id={`${id}-hub`}>
          <circle cx={HUB[0]} cy={HUB[1]} r={HUB[2]} />
        </clipPath>
        {NODES.map((circles, i) => (
          <clipPath key={i} id={`${id}-n${i}`}>
            {circles.map(([cx, cy, r], j) => (
              <circle key={j} cx={cx} cy={cy} r={r} />
            ))}
          </clipPath>
        ))}
      </defs>
      <path d={MARK} fill="currentColor" opacity={0.18} />
      <path d={MARK} fill="currentColor" clipPath={`url(#${id}-hub)`} />
      {NODES.map((_, i) => (
        <path
          key={i}
          d={MARK}
          fill="currentColor"
          clipPath={`url(#${id}-n${i})`}
          className="agora-loader-node"
          style={{ animationDelay: `${i * 0.28}s` }}
        />
      ))}
    </svg>
  );
}

