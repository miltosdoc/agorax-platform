import { ReactNode, useState } from "react";
import { Link } from "wouter";
import { IconArrowsDiagonal, IconX } from "@tabler/icons-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "@/hooks/use-translation";
import { Chip } from "@/components/rails/rail-section";
import { Thumbnail } from "@/components/thumbnails/Thumbnail";
import { MotifIcon } from "@/components/icons/MotifIcon";
import { SaveButton, ShareButton, type BookmarkKind } from "@/components/cards/card-actions";

export interface EntityCardProps {
  /** What this is — drives the eyebrow icon and the fallback picture. */
  subject: "proposal" | "survey" | "podcast" | "video" | "document" | "community";
  kindLabel: string;
  id: number;
  title: string;
  excerpt?: string | null;
  href: string;
  /** Primary action label; defaults to "open". */
  ctaLabel?: string;
  /** The community or topic chip on the eyebrow row. */
  tag?: string | null;
  tagHref?: string;
  /** Right-hand slot on the eyebrow row — a status or tier badge. */
  badge?: ReactNode;
  /** Meta lines under the title (date, author, duration). */
  meta?: ReactNode;
  thumbnailKey?: string | null;
  thumbSrc?: string | null;
  bookmarkKind?: BookmarkKind;
  /** Extra content shown only in the quick-view popup — a player, a chart. */
  detail?: ReactNode;
}

/**
 * The card every feed and list row is built from.
 *
 * One component rather than a family of near-identical ones: proposals,
 * polls, podcasts and videos differ in their icon, their chip and their
 * primary verb, and nothing else. Three copies of this markup would drift
 * apart on the first change to the card language.
 *
 * The expand control opens a quick view rather than navigating. Scanning a
 * feed and wanting the rest of a paragraph is not the same intent as opening
 * the proposal, and making it cost a page load (and a scroll position) is why
 * people stop scanning.
 */
export function EntityCard({
  subject,
  kindLabel,
  id,
  title,
  excerpt,
  href,
  ctaLabel,
  tag,
  tagHref,
  badge,
  meta,
  thumbnailKey,
  thumbSrc,
  bookmarkKind,
  detail,
}: EntityCardProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <article
        className="group flex gap-4 rounded-sm border border-line bg-surface p-4 transition-colors duration-[120ms] hover:border-line-strong"
        data-testid={`card-${subject}-${id}`}
      >
        {/* ── Picture ── */}
        <Link href={href} className="hidden w-24 flex-shrink-0 sm:block" tabIndex={-1} aria-hidden="true">
          <Thumbnail
            src={thumbSrc}
            thumbnailKey={thumbnailKey}
            seed={`${subject}-${id}`}
            subject={subject}
            ratio="1:1"
            compact
          />
        </Link>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* ── Eyebrow ── */}
          <div className="mb-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="inline-flex items-center gap-1.5 font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
              <MotifIcon subject={subject} size={13} />
              {kindLabel}
            </span>
            {tag && (
              tagHref ? (
                <Link href={tagHref}>
                  <Chip tone="accent">{tag}</Chip>
                </Link>
              ) : (
                <Chip tone="accent">{tag}</Chip>
              )
            )}
            {badge && <span className="ml-auto">{badge}</span>}
          </div>

          {/* ── Title ── */}
          <Link href={href} className="block">
            <h3 className="font-serif text-lg leading-snug text-ink group-hover:text-kyanos">
              {title}
            </h3>
          </Link>

          {excerpt && (
            <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-ink-soft">{excerpt}</p>
          )}

          {meta && <div className="mt-2">{meta}</div>}

          {/* ── Actions ── */}
          <div className="mt-3.5 flex items-center gap-2 pt-0.5">
            <Link
              href={href}
              className="inline-flex h-9 items-center rounded-sm bg-ink px-3.5 text-sm font-medium text-paper transition-colors duration-[120ms] hover:bg-kyanos-deep"
              data-testid={`card-open-${subject}-${id}`}
            >
              {ctaLabel ?? t('rail.learnMore')}
            </Link>

            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-line bg-surface text-ink-soft transition-colors duration-[120ms] hover:border-line-strong hover:bg-sunken hover:text-ink"
              aria-label={t('card.quickView')}
              title={t('card.quickView')}
              data-testid={`card-quickview-${subject}-${id}`}
            >
              <IconArrowsDiagonal size={16} stroke={1.75} />
            </button>

            <span className="ml-auto flex items-center gap-2">
              {bookmarkKind && <SaveButton entityType={bookmarkKind} entityId={id} />}
              <ShareButton url={href} title={title} />
            </span>
          </div>
        </div>
      </article>

      {/* ── Quick view ── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <div className="mb-1 flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                <MotifIcon subject={subject} size={13} />
                {kindLabel}
              </span>
              {tag && <Chip tone="accent">{tag}</Chip>}
              {badge}
            </div>
            <DialogTitle className="text-left font-serif text-2xl font-normal leading-snug">
              {title}
            </DialogTitle>
          </DialogHeader>

          <div className="flex gap-4">
            <div className="hidden w-28 flex-shrink-0 sm:block">
              <Thumbnail
                src={thumbSrc}
                thumbnailKey={thumbnailKey}
                seed={`${subject}-${id}`}
                subject={subject}
                ratio="1:1"
              />
            </div>
            <div className="min-w-0 flex-1">
              {excerpt && (
                <p className="whitespace-pre-line text-sm leading-relaxed text-ink-soft">{excerpt}</p>
              )}
              {meta && <div className="mt-3">{meta}</div>}
            </div>
          </div>

          {detail && <div className="mt-4 border-t border-line pt-4">{detail}</div>}

          <div className="mt-5 flex items-center gap-2 border-t border-line pt-4">
            <Link
              href={href}
              onClick={() => setOpen(false)}
              className="inline-flex h-9 items-center rounded-sm bg-ink px-4 text-sm font-medium text-paper transition-colors duration-[120ms] hover:bg-kyanos-deep"
            >
              {ctaLabel ?? t('rail.learnMore')}
            </Link>
            <span className="ml-auto flex items-center gap-2">
              {bookmarkKind && <SaveButton entityType={bookmarkKind} entityId={id} />}
              <ShareButton url={href} title={title} />
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
