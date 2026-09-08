import { Link } from "wouter";
import { MapPin, CalendarDays, Users, FileText } from "lucide-react";
import { useTranslation } from "@/hooks/use-translation";
import { Chip } from "@/components/rails/rail-section";
import { Thumbnail } from "@/components/thumbnails/Thumbnail";
import { SaveButton, ShareButton } from "@/components/cards/card-actions";

export interface CommunityCardData {
  id: number;
  name: string;
  username?: string | null;
  description?: string | null;
  tagline?: string | null;
  category?: string | null;
  region?: string | null;
  type?: string | null;
  coverPath?: string | null;
  avatarPath?: string | null;
  thumbnailKey?: string | null;
  memberCount?: number;
  proposalCount?: number;
  createdAt?: string | Date | null;
  savedByViewer?: boolean;
}

export function mediaUrl(path?: string | null): string | undefined {
  return path ? `/media/${path}` : undefined;
}

function MetaRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-xs text-ink-soft">
      <span className="flex-shrink-0 text-ink-faint" aria-hidden="true">{icon}</span>
      <span className="truncate">{children}</span>
    </div>
  );
}

/**
 * The community card of the AGORA 2026 grid: 2:1 cover with the 1:1 mark
 * overlapping its lower-left, category chip, name, meta rows, then the primary
 * action flanked by save and share.
 */
export function CommunityCard({ community }: { community: CommunityCardData }) {
  const { t, locale } = useTranslation();
  const cover = mediaUrl(community.coverPath);
  const avatar = mediaUrl(community.avatarPath);

  const created = community.createdAt
    ? new Date(community.createdAt).toLocaleDateString(locale === "en" ? "en-GB" : "el-GR", {
        year: "numeric",
        month: "short",
      })
    : null;

  return (
    <article
      className="flex flex-col overflow-hidden rounded-sm border border-line bg-surface transition-colors duration-[120ms] hover:border-line-strong"
      data-testid={`card-community-${community.id}`}
    >
      {/* ── Cover + mark ── */}
      <div className="relative">
        <Thumbnail
          src={cover}
          thumbnailKey={community.thumbnailKey}
          seed={`community-${community.id}`}
          subject={community.category ?? 'community'}
          ratio="2:1"
          rounded={false}
          className="border-0 border-b border-line"
        />
        <div className="absolute -bottom-6 left-3.5 w-16">
          <Thumbnail
            src={avatar}
            thumbnailKey={community.thumbnailKey}
            seed={`community-avatar-${community.id}`}
            subject="community"
            ratio="1:1"
            compact
            className="border-2 border-surface shadow-sm"
          />
        </div>
        {community.category && (
          <div className="absolute bottom-2 right-2">
            <Chip tone="accent">{t(`category.${community.category}`)}</Chip>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3.5 pt-8">
        <Link
          href={`/communities/${community.id}`}
          className="font-serif text-lg leading-snug text-ink hover:text-kyanos"
        >
          {community.name}
        </Link>

        {community.type && (
          <div className="mt-2">
            <Chip>{t(`community.type_${community.type}`)}</Chip>
          </div>
        )}

        {(community.tagline || community.description) && (
          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-ink-soft">
            {community.tagline || community.description}
          </p>
        )}

        <div className="mt-3 space-y-1.5">
          {community.region && <MetaRow icon={<MapPin className="h-3.5 w-3.5" />}>{community.region}</MetaRow>}
          {created && <MetaRow icon={<CalendarDays className="h-3.5 w-3.5" />}>{created}</MetaRow>}
          <MetaRow icon={<Users className="h-3.5 w-3.5" />}>
            {community.memberCount ?? 0} · {t('communities.memberCount')}
          </MetaRow>
          {typeof community.proposalCount === "number" && (
            <MetaRow icon={<FileText className="h-3.5 w-3.5" />}>
              {community.proposalCount} · {t('communities.proposalCount')}
            </MetaRow>
          )}
        </div>

        <div className="mt-auto flex items-center gap-2 pt-4">
          <Link
            href={`/communities/${community.id}`}
            className="inline-flex h-9 flex-1 items-center justify-center rounded-sm bg-ink px-3 text-sm font-medium text-paper transition-colors duration-[120ms] hover:bg-kyanos-deep"
            data-testid={`link-view-community-${community.id}`}
          >
            {t('rail.viewCommunity')}
          </Link>
          <SaveButton entityType="community" entityId={community.id} initialSaved={community.savedByViewer} />
          <ShareButton url={`/communities/${community.id}`} title={community.name} />
        </div>
      </div>
    </article>
  );
}
