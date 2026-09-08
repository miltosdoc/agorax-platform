import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Plus, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { useTranslation } from "@/hooks/use-translation";
import { useAuth } from "@/hooks/use-auth";
import { DiscoveryRail } from "@/components/rails/discovery-rail";
import { AgoraFeedRail } from "@/components/rails/agora-feed-rail";
import { CommunityCard, type CommunityCardData } from "@/components/cards/community-card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** The browse filters of the comps. 'all' is not a stored category. */
const CATEGORIES = [
  "all", "koinonia", "perivallon", "politiki", "politismos", "oikonomia", "allilengyi", "ygeia",
] as const;

const SORTS = [
  { key: "suggested", labelKey: "communities.sortSuggested" },
  { key: "newest", labelKey: "communities.sortNewest" },
  { key: "oldest", labelKey: "communities.sortOldest" },
  { key: "largest", labelKey: "communities.sortLargest" },
  { key: "smallest", labelKey: "communities.sortSmallest" },
] as const;

const PAGE_SIZE = 12;

export default function CommunitiesPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [category, setCategory] = useState<string>("all");
  const [sort, setSort] = useState<string>("suggested");
  const [page, setPage] = useState(0);

  const { data: communities, isLoading } = useQuery<CommunityCardData[]>({
    queryKey: ["/api/communities"],
  });

  const filtered = useMemo(() => {
    const list = (communities ?? []).filter(
      (c) => category === "all" || c.category === category,
    );

    const byDate = (c: CommunityCardData) =>
      c.createdAt ? new Date(c.createdAt).getTime() : 0;

    switch (sort) {
      case "newest":
        return [...list].sort((a, b) => byDate(b) - byDate(a));
      case "oldest":
        return [...list].sort((a, b) => byDate(a) - byDate(b));
      case "largest":
        return [...list].sort((a, b) => (b.memberCount ?? 0) - (a.memberCount ?? 0));
      case "smallest":
        return [...list].sort((a, b) => (a.memberCount ?? 0) - (b.memberCount ?? 0));
      default:
        // "Suggested" is liveliness — where something is actually happening —
        // rather than an opaque score. Members break the tie.
        return [...list].sort(
          (a, b) =>
            (b.proposalCount ?? 0) - (a.proposalCount ?? 0) ||
            (b.memberCount ?? 0) - (a.memberCount ?? 0),
        );
    }
  }, [communities, category, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <AppShell
      breadcrumb={[{ label: t('communities.allCommunities') }]}
      leftRail={<DiscoveryRail />}
      rightRail={<AgoraFeedRail />}
      actions={
        user ? (
          <Link
            href="/communities/new"
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-sm font-medium text-paper transition-colors duration-[120ms] hover:bg-kyanos-deep"
            data-testid="button-create-community"
          >
            <Plus className="h-4 w-4" />
            {t('communities.create')}
          </Link>
        ) : undefined
      }
    >
      {/* ── Hero ──
          The comps mark this slot "ΚΕΝΤΡΙΚΟ BANNER ΣΕΛΙΔΑΣ + TAGLINE". It
          carries the platform's real tagline rather than the placeholder: a
          banner that says "banner" is a wireframe instruction, not content. */}
      <section className="mb-8 rounded-sm border border-line bg-kyanos-wash px-6 py-12 text-center sm:px-10 sm:py-16">
        <h1 className="font-serif text-3xl leading-tight text-ink sm:text-4xl">
          {t('nav.communities')}
        </h1>
        <p className="mx-auto mt-3 max-w-[52ch] text-sm leading-relaxed text-ink-soft sm:text-base">
          {t('footer.tagline')}
        </p>
      </section>

      {/* ── Browse by category ── */}
      <h2 className="mb-3 font-serif text-xl text-ink">{t('communities.browseByCategory')}</h2>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5" role="tablist" aria-label={t('communities.browseByCategory')}>
          {CATEGORIES.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={category === key}
              onClick={() => { setCategory(key); setPage(0); }}
              className={`rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors duration-[120ms] ${
                category === key
                  ? "bg-ink text-paper"
                  : "border border-line text-ink-soft hover:bg-sunken hover:text-ink"
              }`}
              data-testid={`filter-category-${key}`}
            >
              {t(`category.${key}`)}
            </button>
          ))}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex h-9 flex-shrink-0 items-center gap-1.5 rounded-full border border-line px-3.5 text-xs text-ink-soft transition-colors duration-[120ms] hover:border-line-strong hover:bg-sunken hover:text-ink"
              data-testid="button-sort"
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              {t('communities.sort')}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-sm border-line">
            {SORTS.map((option) => (
              <DropdownMenuItem
                key={option.key}
                onClick={() => { setSort(option.key); setPage(0); }}
                className={`cursor-pointer ${sort === option.key ? "font-semibold text-kyanos" : ""}`}
                data-testid={`sort-${option.key}`}
              >
                {t(option.labelKey)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <p className="mb-3 text-xs text-ink-faint" data-testid="text-community-count">
        {t('communities.count').replace('{count}', String(filtered.length))}
      </p>

      {/* ── Grid ── */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-80 animate-pulse rounded-sm border border-line bg-sunken" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="rounded-sm border border-dashed border-line px-6 py-16 text-center text-sm text-ink-faint">
          {t('communities.noResults')}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="grid-communities">
          {visible.map((community) => (
            <CommunityCard key={community.id} community={community} />
          ))}
        </div>
      )}

      {/* ── Pagination ──
          Drawn only when there is more than one page. The comps show "1 2 3 …
          99"; with 18 communities that would be a fiction, so the control
          reflects the real count. */}
      {pageCount > 1 && (
        <nav className="mt-8 flex items-center justify-center gap-1" aria-label="Pagination">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
            className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-ink-soft transition-colors duration-[120ms] hover:bg-sunken disabled:opacity-40"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {Array.from({ length: pageCount }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setPage(i)}
              aria-current={i === safePage ? "page" : undefined}
              className={`inline-flex h-8 min-w-8 items-center justify-center rounded-sm px-2 font-mono text-xs tabular-nums transition-colors duration-[120ms] ${
                i === safePage ? "bg-ink text-paper" : "text-ink-soft hover:bg-sunken"
              }`}
            >
              {i + 1}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={safePage >= pageCount - 1}
            className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-ink-soft transition-colors duration-[120ms] hover:bg-sunken disabled:opacity-40"
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </nav>
      )}
    </AppShell>
  );
}
