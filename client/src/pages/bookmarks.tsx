import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Bookmark, FileText, Users, BarChart3, Film, MessageSquare } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { useTranslation } from "@/hooks/use-translation";
import { SaveButton } from "@/components/cards/card-actions";

interface BookmarkRow {
  id: number;
  entityType: "community" | "proposal" | "survey" | "media" | "post";
  entityId: number;
  createdAt: string;
}

interface CommunityRow { id: number; name: string }
interface ProposalRow { id: number; question: string }

const ICONS: Record<BookmarkRow["entityType"], React.ReactNode> = {
  community: <Users className="h-4 w-4" />,
  proposal: <FileText className="h-4 w-4" />,
  survey: <BarChart3 className="h-4 w-4" />,
  media: <Film className="h-4 w-4" />,
  post: <MessageSquare className="h-4 w-4" />,
};

/**
 * "Τα αποθηκευμένα μου".
 *
 * The bookmark table is polymorphic and holds no titles, so the names are
 * resolved from the lists the app already caches. Anything that cannot be
 * resolved — deleted, or in a community the viewer has since left — is shown
 * as a bare link rather than hidden: a saved item that silently disappears
 * looks like the save never worked.
 */
export default function BookmarksPage() {
  const { t } = useTranslation();

  const { data, isLoading } = useQuery<{ bookmarks: BookmarkRow[] }>({ queryKey: ["/api/bookmarks"] });
  const { data: communities } = useQuery<CommunityRow[]>({ queryKey: ["/api/communities"] });
  const { data: proposalsData } = useQuery<{ proposals?: ProposalRow[] } | ProposalRow[]>({
    queryKey: ["/api/proposals"],
  });

  const proposalList = Array.isArray(proposalsData) ? proposalsData : (proposalsData?.proposals ?? []);
  const communityById = new Map((communities ?? []).map((c) => [c.id, c.name]));
  const proposalById = new Map(proposalList.map((p) => [p.id, p.question]));

  const rows = data?.bookmarks ?? [];

  function labelFor(row: BookmarkRow): { label: string; href: string } {
    switch (row.entityType) {
      case "community":
        return { label: communityById.get(row.entityId) ?? `#${row.entityId}`, href: `/communities/${row.entityId}` };
      case "proposal":
        return { label: proposalById.get(row.entityId) ?? `#${row.entityId}`, href: `/proposals/${row.entityId}` };
      case "survey":
        return { label: `#${row.entityId}`, href: `/surveys/${row.entityId}` };
      case "media":
        return { label: `#${row.entityId}`, href: `/videos#media-${row.entityId}` };
      default:
        return { label: `#${row.entityId}`, href: `/communities` };
    }
  }

  return (
    <AppShell breadcrumb={[{ label: t('bookmark.title') }]} title={t('bookmark.title')}>
      {isLoading ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-sm border border-line bg-sunken" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-sm border border-dashed border-line px-6 py-16 text-center">
          <Bookmark className="mx-auto mb-3 h-8 w-8 text-line-strong" aria-hidden="true" />
          <p className="text-sm text-ink-faint">{t('bookmark.empty')}</p>
        </div>
      ) : (
        <ul className="rounded-sm border border-line bg-surface" data-testid="list-bookmarks">
          {rows.map((row) => {
            const { label, href } = labelFor(row);
            return (
              <li key={row.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                <span className="flex-shrink-0 text-ink-faint" aria-hidden="true">{ICONS[row.entityType]}</span>
                <Link href={href} className="min-w-0 flex-1 truncate text-sm text-ink hover:text-kyanos">
                  {label}
                </Link>
                <SaveButton entityType={row.entityType} entityId={row.entityId} initialSaved />
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
