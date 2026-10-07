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
  /** Membership or another contextual action, rendered without navigation. */
  actions?: ReactNode;
  inlineDetail?: boolean;
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
  actions,
  inlineDetail = false,
}: EntityCardProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <article
        className="group flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 transition-colors duration-[120ms] hover:border-line-strong sm:p-6"
        data-testid={`card-${subject}-${id}`}
      >
        <div className="flex min-w-0 flex-1 flex-col">
          {/* ── Eyebrow ── */}
          <div className="mb-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="inline-flex items-center gap-1.5 font-sans text-sm font-medium text-ink-soft">
              <MotifIcon subject={subject} size={13} />
              {kindLabel}
            </span>
            {tag && (
              tagHref ? (
                <Link href={tagHref} className="inline-flex min-h-8 items-center rounded-lg bg-kyanos-wash px-2.5 py-1 text-sm font-medium leading-snug text-kyanos hover:underline">
                  {tag}
                </Link>
              ) : (
                <span className="inline-flex min-h-8 items-center rounded-lg bg-kyanos-wash px-2.5 py-1 text-sm font-medium leading-snug text-kyanos">{tag}</span>
              )
            )}
            {badge && <span className="ml-auto">{badge}</span>}
          </div>

          {/* ── Title ── */}
          <Link href={href} className="block">
            <h3 className="font-sans text-xl font-semibold leading-snug text-ink sm:text-2xl group-hover:text-kyanos">
              {title}
            </h3>
          </Link>

          {excerpt && (
            <p className="mt-3 line-clamp-3 text-base leading-relaxed text-ink-soft">{excerpt}</p>
          )}

          {meta && <div className="mt-3 text-sm text-ink-soft">{meta}</div>}
          {inlineDetail && detail && <div className="mt-4 overflow-hidden rounded-xl">{detail}</div>}
          {actions && <div className="mt-4 border-t border-line pt-4">{actions}</div>}

          {/* ── Actions ── */}
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <Link
              href={href}
              className="inline-flex min-h-11 items-center rounded-sm bg-ink px-3.5 text-sm font-medium text-paper transition-colors duration-[120ms] hover:bg-kyanos-deep"
              data-testid={`card-open-${subject}-${id}`}
            >
              {ctaLabel ?? t('rail.learnMore')}
            </Link>

            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-sm border border-line bg-surface text-ink-soft transition-colors duration-[120ms] hover:border-line-strong hover:bg-sunken hover:text-ink"
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
              <span className="inline-flex items-center gap-1.5 font-sans text-sm font-medium text-ink-soft">
                <MotifIcon subject={subject} size={13} />
                {kindLabel}
              </span>
              {tag && <Chip tone="accent">{tag}</Chip>}
              {badge}
            </div>
            <DialogTitle className="text-left font-sans text-2xl font-semibold leading-snug">
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
                <p className="whitespace-pre-line text-base leading-relaxed text-ink-soft">{excerpt}</p>
              )}
              {meta && <div className="mt-3">{meta}</div>}
            </div>
          </div>

          {detail && <div className="mt-4 border-t border-line pt-4">{detail}</div>}
          {actions && <div className="mt-4">{actions}</div>}

          <div className="mt-5 flex items-center gap-2 border-t border-line pt-4">
            <Link
              href={href}
              onClick={() => setOpen(false)}
              className="inline-flex min-h-11 items-center rounded-sm bg-ink px-4 text-sm font-medium text-paper transition-colors duration-[120ms] hover:bg-kyanos-deep"
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
