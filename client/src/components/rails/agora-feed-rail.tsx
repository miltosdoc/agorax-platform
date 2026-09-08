import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  FileText, BarChart3, Mic, Video, MapPin, CalendarDays, MessageSquare,
  Headphones, Play, Search, SlidersHorizontal,
} from "lucide-react";
import { useTranslation } from "@/hooks/use-translation";
import { RailSection, RailCard, Chip, CARD_STACK } from "@/components/rails/rail-section";
import { Thumbnail } from "@/components/thumbnails/Thumbnail";
import { SaveButton, ShareButton } from "@/components/cards/card-actions";
import { mediaUrl } from "@/components/cards/community-card";

type FeedItem =
  | { feedType: "proposal"; id: number; question: string; solution: string; status: string; createdAt: string; communityId: number; communityName: string; authorName: string }
  | { feedType: "survey"; id: number; title: string; topicTag: string | null; tier: string; status: string; createdAt: string }
  | { feedType: "media"; id: number; kind: "podcast" | "video" | "document"; title: string | null; description: string | null; thumbPath: string | null; durationS: string | null; createdAt: string; proposalId: number; proposalQuestion: string; communityId: number; communityName: string };

const TABS = [
  { key: "all", labelKey: "category.all" },
  { key: "proposal", labelKey: "nav.proposals" },
  { key: "survey", labelKey: "nav.surveys" },
  { key: "podcast", labelKey: "nav.podcasts" },
  { key: "video", labelKey: "nav.videos" },
] as const;

/** "15 λεπτά πριν" — the relative stamp every feed row in the comps carries. */
function useRelativeTime() {
  const { locale } = useTranslation();
  return (iso: string) => {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return "";
    const seconds = Math.round((then - Date.now()) / 1000);
    const rtf = new Intl.RelativeTimeFormat(locale === "en" ? "en-GB" : "el-GR", { numeric: "auto" });
    const divisions: [number, Intl.RelativeTimeFormatUnit][] = [
      [60, "second"], [60, "minute"], [24, "hour"], [7, "day"], [4.34, "week"], [12, "month"], [Infinity, "year"],
    ];
    let value = seconds;
    for (const [amount, unit] of divisions) {
      if (Math.abs(value) < amount) return rtf.format(Math.round(value), unit);
      value /= amount;
    }
    return "";
  };
}

function FeedRow({ item }: { item: FeedItem }) {
  const { t } = useTranslation();
  const ago = useRelativeTime();

  const meta = (() => {
    switch (item.feedType) {
      case "proposal":
        return {
          kindLabel: t('nav.proposals'),
          icon: <FileText className="h-3 w-3" />,
          tag: item.communityName,
          title: item.question,
          href: `/proposals/${item.id}`,
          cta: t('rail.learnMore'),
          bookmarkKind: "proposal" as const,
          thumb: null as string | null,
          lines: [
            item.status ? { icon: <MessageSquare className="h-3 w-3" />, text: item.status } : null,
            { icon: <CalendarDays className="h-3 w-3" />, text: ago(item.createdAt) },
          ],
        };
      case "survey":
        return {
          kindLabel: t('nav.surveys'),
          icon: <BarChart3 className="h-3 w-3" />,
          tag: item.topicTag,
          title: item.title,
          href: `/surveys/${item.id}`,
          cta: t('rail.participate'),
          bookmarkKind: "survey" as const,
          thumb: null,
          lines: [
            { icon: <BarChart3 className="h-3 w-3" />, text: item.tier },
            { icon: <CalendarDays className="h-3 w-3" />, text: ago(item.createdAt) },
          ],
        };
      default:
        return {
          kindLabel: item.kind === "podcast" ? t('nav.podcasts') : t('nav.videos'),
          icon: item.kind === "podcast" ? <Mic className="h-3 w-3" /> : <Video className="h-3 w-3" />,
          // The community it came from, and a link to the proposal it is
          // about. An anchor into the media shelf was a dead end: it played
          // the file and left the reader with no way back to the argument.
          tag: item.communityName,
          title: item.title || item.proposalQuestion,
          href: `/proposals/${item.proposalId}`,
          cta: item.kind === "podcast" ? t('rail.listenHere') : t('rail.watchHere'),
          bookmarkKind: "media" as const,
          thumb: mediaUrl(item.thumbPath),
          lines: [
            {
              icon: item.kind === "podcast" ? <Headphones className="h-3 w-3" /> : <Play className="h-3 w-3" />,
              text: item.durationS ? `${Math.round(Number(item.durationS) / 60)}′` : "",
            },
            { icon: <CalendarDays className="h-3 w-3" />, text: ago(item.createdAt) },
          ],
        };
    }
  })();

  return (
    <RailCard>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
          {meta.icon}
          {meta.kindLabel}
        </span>
        {meta.tag && <Chip tone="accent">{meta.tag}</Chip>}
      </div>

      <div className="flex gap-2.5">
        <div className="w-14 flex-shrink-0">
          <Thumbnail
            src={meta.thumb}
            seed={`${item.feedType}-${item.id}`}
            subject={item.feedType === "media" ? item.kind : item.feedType}
            ratio="1:1"
            compact
          />
        </div>
        <div className="min-w-0 flex-1">
          <Link href={meta.href} className="line-clamp-2 text-sm font-medium leading-snug text-ink hover:text-kyanos">
            {meta.title}
          </Link>
          <div className="mt-1.5 space-y-1">
            {meta.lines.filter(Boolean).map((line, i) => (
              line && line.text ? (
                <div key={i} className="flex items-center gap-1.5 text-[11px] text-ink-faint">
                  <span aria-hidden="true">{line.icon}</span>
                  <span className="truncate">{line.text}</span>
                </div>
              ) : null
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Link
          href={meta.href}
          className="inline-flex h-8 flex-1 items-center justify-center rounded-sm border border-line bg-sunken px-3 text-xs font-medium text-ink transition-colors duration-[120ms] hover:border-line-strong hover:bg-surface"
        >
          {meta.cta}
        </Link>
        <SaveButton entityType={meta.bookmarkKind} entityId={item.id} className="h-8 w-8" />
        <ShareButton url={meta.href} title={meta.title} className="h-8 w-8" />
      </div>
    </RailCard>
  );
}

/**
 * "Ροή AgoraX" — the right rail of the comps: a search field, filter tabs, and
 * the newest things that happened anywhere the viewer can see.
 */
export function AgoraFeedRail() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<string>("all");
  const [query, setQuery] = useState("");

  const { data, isLoading } = useQuery<{ items: FeedItem[] }>({
    queryKey: ["/api/feed", tab === "all" ? "all" : tab],
    queryFn: async () => {
      const res = await fetch(`/api/feed?type=${tab}&limit=20`, { credentials: "include" });
      if (!res.ok) throw new Error("feed failed");
      return res.json();
    },
  });

  const items = (data?.items ?? []).filter((item) => {
    if (!query.trim()) return true;
    const haystack = item.feedType === "proposal" ? item.question : item.title;
    return haystack?.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  });

  return (
    <div>
      {/* Search — the comps put it at the head of the right rail. */}
      <div className="mb-4 flex items-center gap-2 rounded-sm border border-line bg-surface px-3 py-2">
        <Search className="h-4 w-4 flex-shrink-0 text-ink-faint" aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('communities.searchPlaceholder')}
          aria-label={t('communities.searchPlaceholder')}
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
          data-testid="input-rail-search"
        />
        <SlidersHorizontal className="h-4 w-4 flex-shrink-0 text-ink-faint" aria-hidden="true" />
      </div>

      <RailSection title={t('rail.agoraFeed')} moreHref="/feed" moreLabel={t('rail.more')}>
        <div className="mb-3 flex flex-wrap gap-1">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`rounded-full px-2.5 py-1 text-[11px] transition-colors duration-[120ms] ${
                tab === item.key
                  ? "bg-ink text-paper"
                  : "border border-line text-ink-soft hover:bg-sunken hover:text-ink"
              }`}
              data-testid={`feed-tab-${item.key}`}
            >
              {t(item.labelKey)}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className={CARD_STACK} aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-sm border border-line bg-sunken" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="rounded-sm border border-dashed border-line px-4 py-6 text-center text-xs text-ink-faint">
            {t('rail.empty')}
          </p>
        ) : (
          <div className={CARD_STACK}>
            {items.map((item) => <FeedRow key={`${item.feedType}-${item.id}`} item={item} />)}
          </div>
        )}
      </RailSection>
    </div>
  );
}
