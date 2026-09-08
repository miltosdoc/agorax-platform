import { motifPaths, motifForSubject, type ThumbnailMotif } from "@shared/thumbnails";

/**
 * The catalogue's own drawings, at interface size.
 *
 * Lucide and Tabler cover the interface verbs — save, share, chevrons, close —
 * and this codebase already uses them for that. What neither draws the way
 * this product needs is the *kinds of thing* AgoraX deals in: a podcast is a
 * soundwave, not a microphone; a vote is a ballot going into a box, not a
 * generic tick. Those live in shared/thumbnails.ts so the icon on a card's
 * eyebrow is the identical drawing as the picture in its image slot, at a
 * different size.
 *
 * Stroke width scales inversely with size so a 14px mark stays as legible as
 * the 200px one — a fixed 1.7 on the 48-grid goes wispy when shrunk.
 */
export function MotifIcon({
  motif,
  subject,
  size = 14,
  className = "",
  strokeWidth,
}: {
  motif?: ThumbnailMotif;
  /** A category or kind ('podcast', 'proposal', 'perivallon'…) resolved to a motif. */
  subject?: string | null;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  const resolved: ThumbnailMotif = motif ?? motifForSubject(subject) ?? "globe";
  // 1.7 reads correctly around 48px; below that it needs proportionally more.
  const weight = strokeWidth ?? Math.max(1.7, (48 / size) * 0.55);

  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={`flex-shrink-0 ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={weight}
        strokeLinecap="round"
        strokeLinejoin="round"
        dangerouslySetInnerHTML={{ __html: motifPaths(resolved) }}
      />
    </svg>
  );
}
