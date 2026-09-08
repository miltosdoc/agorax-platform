import { ReactNode, useState } from "react";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * A rail card in the AGORA 2026 comps: a titled block that shows one item at a
 * time with a ‹ n/m › pager, or a plain list with a "more" link.
 *
 * The pager is deliberately not a timed carousel. These blocks sit beside the
 * page's actual content, and something that moves on its own while a reader is
 * mid-sentence is a nuisance rather than a feature.
 */
export function RailSection({
  title,
  moreHref,
  moreLabel,
  children,
}: {
  title: string;
  moreHref?: string;
  moreLabel?: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-6" data-testid={`rail-${title}`}>
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg leading-tight text-ink">{title}</h2>
        {moreHref && (
          <Link
            href={moreHref}
            className="flex-shrink-0 text-xs text-ink-faint transition-colors duration-[120ms] hover:text-kyanos"
          >
            {moreLabel} ›
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * The paged variant: title, ‹ 1/6 ›, one item shown.
 */
export function PagedRailSection<T>({
  title,
  items,
  renderItem,
  emptyLabel,
}: {
  title: string;
  items: T[];
  renderItem: (item: T) => ReactNode;
  emptyLabel: string;
}) {
  const [index, setIndex] = useState(0);
  const count = items.length;
  // A page that vanished under the reader (the list refetched shorter) must
  // not leave the pager pointing past the end.
  const safeIndex = count === 0 ? 0 : Math.min(index, count - 1);

  return (
    <section className="mb-6" data-testid={`rail-${title}`}>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h2 className="font-serif text-lg leading-tight text-ink">{title}</h2>
        {count > 1 && (
          <div className="flex flex-shrink-0 items-center gap-1 text-xs text-ink-faint">
            <button
              type="button"
              onClick={() => setIndex((i) => (i - 1 + count) % count)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-sm transition-colors duration-[120ms] hover:bg-sunken hover:text-ink"
              aria-label="Previous"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="font-mono tabular-nums">{safeIndex + 1} / {count}</span>
            <button
              type="button"
              onClick={() => setIndex((i) => (i + 1) % count)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-sm transition-colors duration-[120ms] hover:bg-sunken hover:text-ink"
              aria-label="Next"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {count === 0 ? (
        <p className="rounded-sm border border-dashed border-line px-4 py-6 text-center text-xs text-ink-faint">
          {emptyLabel}
        </p>
      ) : (
        renderItem(items[safeIndex])
      )}
    </section>
  );
}

/**
 * The gap between stacked cards — rails and the main feed alike.
 *
 * Exported as one constant rather than repeated: the feed and the side panel
 * sit next to each other on the same screen, so any drift between them is
 * visible at a glance.
 */
export const CARD_STACK = "space-y-3";

/** The bordered surface every rail item sits on. */
export function RailCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-sm border border-line bg-surface p-3.5 ${className}`}>
      {children}
    </div>
  );
}

/** The small uppercase pill used for category and status chips. */
export function Chip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "yper" | "kata" | "warn";
}) {
  const tones: Record<string, string> = {
    neutral: "border-line bg-sunken text-ink-soft",
    accent: "border-kyanos/30 bg-kyanos-wash text-kyanos",
    yper: "border-yper/30 bg-yper-wash text-yper",
    kata: "border-kata/30 bg-kata-wash text-kata",
    warn: "border-warn/30 bg-warn-wash text-warn",
  };
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 font-sans text-[10px] font-semibold uppercase leading-none tracking-[0.1em] ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * The 1:1 / 2:1 image slots of the comps. Renders the picture when there is
 * one and a labelled placeholder when there is not — the comps are full of
 * "ΦΩΤΟΓΡΑΦΙΑ 1:1" boxes, and a community with no cover should read as an
 * empty frame rather than a broken layout.
 */
export function ImageSlot({
  src,
  alt = "",
  ratio = "1:1",
  className = "",
}: {
  src?: string | null;
  alt?: string;
  ratio?: "1:1" | "2:1";
  className?: string;
}) {
  const aspect = ratio === "2:1" ? "aspect-[2/1]" : "aspect-square";
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className={`${aspect} w-full rounded-sm border border-line object-cover ${className}`}
      />
    );
  }
  return (
    <div
      className={`${aspect} w-full rounded-sm border border-line bg-sunken ${className}`}
      aria-hidden="true"
    />
  );
}
