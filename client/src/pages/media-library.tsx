import { useQuery } from "@tanstack/react-query";
import { Mic, Video, Clock } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { useTranslation } from "@/hooks/use-translation";
import { DiscoveryRail } from "@/components/rails/discovery-rail";
import { AgoraFeedRail } from "@/components/rails/agora-feed-rail";
import { Link } from "wouter";
import { Thumbnail } from "@/components/thumbnails/Thumbnail";
import { MotifIcon } from "@/components/icons/MotifIcon";
import { Chip, CARD_STACK } from "@/components/rails/rail-section";
import { SaveButton, ShareButton } from "@/components/cards/card-actions";
import { mediaUrl } from "@/components/cards/community-card";

interface MediaItem {
  id: number;
  kind: "podcast" | "video";
  title: string | null;
  description: string | null;
  filePath: string;
  thumbPath: string | null;
  durationS: string | null;
  createdAt: string;
  // Every podcast and video in the feed is an attachment of a proposal, which
  // belongs to a community. Without these the shelf is a pile of orphaned
  // files: you can play one and have no way to reach what it is about.
  proposalId: number;
  proposalQuestion: string;
  communityId: number;
  communityName: string;
  uploaderName: string | null;
}

/**
 * The Podcasts and Βίντεο shelves of the new nav.
 *
 * One page, two kinds: the layout, the card and the player differ only by the
 * media element, and two near-identical files would drift apart on the first
 * change. The rails match the communities page so the shell reads the same
 * whichever shelf you are on.
 */
export default function MediaLibraryPage({ kind }: { kind: "podcast" | "video" }) {
  const { t } = useTranslation();

  const { data, isLoading } = useQuery<{ items: MediaItem[] }>({
    queryKey: ["/api/feed", kind],
    queryFn: async () => {
      const res = await fetch(`/api/feed?type=${kind}&limit=50`, { credentials: "include" });
      if (!res.ok) throw new Error("feed failed");
      return res.json();
    },
  });

  const items = data?.items ?? [];
  const title = kind === "podcast" ? t('nav.podcasts') : t('nav.videos');

  return (
    <AppShell
      breadcrumb={[{ label: title }]}
      leftRail={<DiscoveryRail />}
      rightRail={<AgoraFeedRail />}
    >
      <section className="mb-8 rounded-sm border border-line bg-kyanos-wash px-6 py-12 text-center sm:px-10 sm:py-16">
        <h1 className="flex items-center justify-center gap-3 font-serif text-3xl leading-tight text-ink sm:text-4xl">
          {kind === "podcast" ? <Mic className="h-7 w-7 text-kyanos" /> : <Video className="h-7 w-7 text-kyanos" />}
          {title}
        </h1>
      </section>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-64 animate-pulse rounded-sm border border-line bg-sunken" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-sm border border-dashed border-line px-6 py-16 text-center text-sm text-ink-faint">
          {t('rail.empty')}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {items.map((item) => (
            <article
              key={item.id}
              id={`media-${item.id}`}
              className="flex flex-col overflow-hidden rounded-sm border border-line bg-surface"
              data-testid={`card-media-${item.id}`}
            >
              {kind === "video" ? (
                <video
                  controls
                  preload="none"
                  poster={mediaUrl(item.thumbPath)}
                  src={`/media/${item.filePath}`}
                  className="aspect-video w-full border-b border-line bg-ink"
                />
              ) : (
                <div className="border-b border-line p-3.5">
                  <div className="mb-3 w-24">
                    <Thumbnail src={mediaUrl(item.thumbPath)} seed={`media-${item.id}`} subject={kind} ratio="1:1" compact />
                  </div>
                  <audio controls preload="none" src={`/media/${item.filePath}`} className="w-full" />
                </div>
              )}

              <div className="flex flex-1 flex-col p-3.5">
                {/* Provenance first: what this is about, before what it is. */}
                <Link href={`/communities/${item.communityId}`} className="self-start">
                  <Chip tone="accent">{item.communityName}</Chip>
                </Link>

                <h2 className="mt-2 font-serif text-lg leading-snug text-ink">
                  {item.title || item.proposalQuestion}
                </h2>

                <Link
                  href={`/proposals/${item.proposalId}`}
                  className="mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed text-ink-soft hover:text-kyanos"
                  data-testid={`media-proposal-link-${item.id}`}
                >
                  <MotifIcon subject="proposal" size={13} className="mt-0.5" />
                  <span className="min-w-0">
                    <span className="text-ink-faint">{t('media.fromProposal')}: </span>
                    <span className="line-clamp-2">{item.proposalQuestion}</span>
                  </span>
                </Link>

                {item.description && (
                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-ink-soft">{item.description}</p>
                )}

                <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[11px] text-ink-faint">
                  {item.durationS && (
                    <span className="flex items-center gap-1 font-mono tabular-nums">
                      <Clock className="h-3 w-3" aria-hidden="true" />
                      {Math.round(Number(item.durationS) / 60)}′
                    </span>
                  )}
                  {item.uploaderName && <span>· {item.uploaderName}</span>}
                </p>

                <div className="mt-auto flex items-center gap-2 pt-4">
                  <Link
                    href={`/proposals/${item.proposalId}`}
                    className="inline-flex h-9 items-center rounded-md bg-ink px-3.5 text-sm font-medium text-paper transition-colors duration-[120ms] hover:bg-kyanos-deep"
                  >
                    {t('media.openProposal')}
                  </Link>
                  <span className="ml-auto flex items-center gap-2">
                    <SaveButton entityType="media" entityId={item.id} />
                    <ShareButton url={`/proposals/${item.proposalId}`} title={item.title || item.proposalQuestion} />
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </AppShell>
  );
}
