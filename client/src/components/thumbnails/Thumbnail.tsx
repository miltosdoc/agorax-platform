import { useMemo } from "react";
import { MotifIcon } from "@/components/icons/MotifIcon";
import { useTranslation } from "@/hooks/use-translation";
import {
  THUMBNAIL_MOTIFS,
  THUMBNAIL_PALETTES,
  THUMBNAIL_PALETTE_KEYS,
  parseThumbnailKey,
  resolveThumbnailKey,
  thumbnailKeyOf,
  motifPaths,
  type ThumbnailMotif,
  type ThumbnailPalette,
} from "@shared/thumbnails";

export type ThumbnailRatio = "1:1" | "2:1" | "16:9";

const RATIO_CLASS: Record<ThumbnailRatio, string> = {
  "1:1": "aspect-square",
  "2:1": "aspect-[2/1]",
  "16:9": "aspect-video",
};

/**
 * A generated thumbnail: a soft tinted ground carrying one low-contrast icon
 * of what the thing is.
 *
 * Two rules make it read as a designed placeholder rather than noise:
 *
 *   1. The icon is centred at a fixed size and never stretched, whatever the
 *      frame's aspect. A squashed icon looks like a bug.
 *   2. Contrast stays low. This sits behind a title in a card; if it competes
 *      with the text it is wrong, even when it is pretty.
 *
 * `src` always wins — an author who uploaded a photograph gets it.
 */
export function Thumbnail({
  thumbnailKey,
  seed,
  subject,
  src,
  alt = "",
  ratio = "1:1",
  className = "",
  rounded = true,
  /** Shrinks the icon for small frames (rail avatars) where the default reads heavy. */
  compact = false,
}: {
  thumbnailKey?: string | null;
  /** Stable identity for the fallback — normally `community-12`, `proposal-7`. */
  seed: string | number;
  /** Category or kind, so the derived icon is about the thing, not arbitrary. */
  subject?: string | null;
  src?: string | null;
  alt?: string;
  ratio?: ThumbnailRatio;
  className?: string;
  rounded?: boolean;
  compact?: boolean;
}) {
  const key = useMemo(
    () => resolveThumbnailKey(thumbnailKey, seed, subject),
    [thumbnailKey, seed, subject],
  );
  const parsed = parseThumbnailKey(key)!;
  const { ground, ink } = THUMBNAIL_PALETTES[parsed.palette];
  const shape = useMemo(() => motifPaths(parsed.motif), [parsed.motif]);

  const frame = `${RATIO_CLASS[ratio]} w-full overflow-hidden ${rounded ? "rounded-sm" : ""} border border-line ${className}`;

  if (src) {
    return <img src={src} alt={alt} loading="lazy" className={`${frame} object-cover`} />;
  }

  // The icon keeps its own square regardless of the frame: the outer div holds
  // the aspect, the inner svg is centred and unstretched.
  const scale = compact ? 0.5 : 0.42;

  return (
    <div
      className={`${frame} relative flex items-center justify-center`}
      style={{ backgroundColor: ground }}
      role={alt ? "img" : "presentation"}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      data-thumbnail-key={key}
    >
      <svg
        viewBox="0 0 48 48"
        className="h-full w-auto"
        style={{ maxHeight: "100%", aspectRatio: "1 / 1" }}
        aria-hidden="true"
      >
        <g
          fill="none"
          stroke={ink}
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
          transform={`translate(24 24) scale(${scale}) translate(-24 -24)`}
          dangerouslySetInnerHTML={{ __html: shape }}
        />
      </svg>
    </div>
  );
}

/**
 * The chooser: two independent axes rather than one wall of 128 swatches.
 *
 * Icon and colour are separate decisions — "this community is about the
 * environment" and "this community is green" are not the same thought, and a
 * combined grid forces them to be made together while hiding both. Splitting
 * them also makes the whole catalogue visible in two short rows instead of a
 * scrolling wall nobody reaches the bottom of.
 */
export function ThumbnailPicker({
  value,
  onChange,
  seed,
  subject,
  label,
}: {
  value: string | null | undefined;
  onChange: (key: string) => void;
  seed: string | number;
  subject?: string | null;
  label: string;
}) {
  const { t } = useTranslation();
  const current = parseThumbnailKey(resolveThumbnailKey(value, seed, subject))!;

  const setMotif = (motif: ThumbnailMotif) => onChange(thumbnailKeyOf(motif, current.palette));
  const setPalette = (palette: ThumbnailPalette) => onChange(thumbnailKeyOf(current.motif, palette));

  return (
    <div>
      <p className="mb-2 font-sans text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
        {label}
      </p>

      <div className="flex items-start gap-4 rounded-sm border border-line bg-sunken p-3">
        {/* Live preview at the size it will actually be seen. */}
        <div className="w-20 flex-shrink-0">
          <Thumbnail thumbnailKey={thumbnailKeyOf(current.motif, current.palette)} seed={seed} ratio="1:1" />
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="mb-1.5 text-[11px] uppercase tracking-[0.1em] text-ink-faint">
              {t('appearance.icon')}
            </p>
            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={t('appearance.icon')}>
              {THUMBNAIL_MOTIFS.map((motif) => {
                const selected = motif === current.motif;
                return (
                  <button
                    key={motif}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={motif}
                    title={motif}
                    onClick={() => setMotif(motif)}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-sm border transition-colors duration-[120ms] ${
                      selected
                        ? "border-kyanos bg-kyanos-wash text-kyanos"
                        : "border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink"
                    }`}
                    data-testid={`thumbnail-motif-${motif}`}
                  >
                    <MotifIcon motif={motif} size={16} />
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] uppercase tracking-[0.1em] text-ink-faint">
              {t('appearance.colour')}
            </p>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('appearance.colour')}>
              {THUMBNAIL_PALETTE_KEYS.map((palette) => {
                const selected = palette === current.palette;
                const { ground, ink } = THUMBNAIL_PALETTES[palette];
                return (
                  <button
                    key={palette}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={palette}
                    title={palette}
                    onClick={() => setPalette(palette)}
                    className={`h-8 w-8 rounded-sm border-2 transition-colors duration-[120ms] ${
                      selected ? "border-kyanos" : "border-line hover:border-line-strong"
                    }`}
                    style={{ backgroundColor: ground }}
                    data-testid={`thumbnail-palette-${palette}`}
                  >
                    <span
                      className="mx-auto block h-3 w-3 rounded-full"
                      style={{ backgroundColor: ink }}
                      aria-hidden="true"
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
