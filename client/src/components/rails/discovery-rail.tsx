import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Users, FileText, CalendarDays, Clock, UserCheck, Timer } from "lucide-react";
import { useTranslation } from "@/hooks/use-translation";
import { PagedRailSection, RailCard, Chip } from "@/components/rails/rail-section";
import { Thumbnail } from "@/components/thumbnails/Thumbnail";
import { SaveButton, ShareButton } from "@/components/cards/card-actions";
import { mediaUrl, type CommunityCardData } from "@/components/cards/community-card";

interface ProposalRow {
  id: number;
  question: string;
  solution?: string | null;
  status: string;
  communityId: number;
  communityName?: string | null;
  authorName?: string | null;
  createdAt?: string;
}

interface AchievementRow {
  id: number;
  title: string;
  story: string | null;
  region: string | null;
  imagePath: string | null;
  participantsCount: number | null;
  durationDays: number | null;
  proposalId: number | null;
  communityName: string | null;
  publishedAt: string | null;
}

function MetaLine({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-ink-faint">
      <span className="flex-shrink-0" aria-hidden="true">{icon}</span>
      <span className="truncate">{children}</span>
    </div>
  );
}

function CommunityRailCard({ community }: { community: CommunityCardData }) {
  const { t } = useTranslation();
  return (
    <RailCard>
      <div className="flex gap-3">
        <div className="w-20 flex-shrink-0">
          <Thumbnail
            src={mediaUrl(community.avatarPath)}
            thumbnailKey={community.thumbnailKey}
            seed={`community-avatar-${community.id}`}
            subject={community.category ?? 'community'}
            ratio="1:1"
            compact
          />
        </div>
        <div className="min-w-0 flex-1">
          <Link
            href={`/communities/${community.id}`}
            className="line-clamp-2 text-sm font-semibold leading-snug text-ink hover:text-kyanos"
          >
            {community.name}
          </Link>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {community.type && <Chip>{t(`community.type_${community.type}`)}</Chip>}
            {community.category && <Chip tone="accent">{t(`category.${community.category}`)}</Chip>}
          </div>
          {community.region && (
            <div className="mt-1.5">
              <MetaLine icon={<MapPin className="h-3 w-3" />}>{community.region}</MetaLine>
            </div>
          )}
          {(community.tagline || community.description) && (
            <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-ink-soft">
              {community.tagline || community.description}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2.5">
        <MetaLine icon={<Users className="h-3 w-3" />}>{community.memberCount ?? 0}</MetaLine>
        <MetaLine icon={<FileText className="h-3 w-3" />}>{community.proposalCount ?? 0}</MetaLine>
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <Link
          href={`/communities/${community.id}`}
          className="inline-flex h-8 flex-1 items-center justify-center rounded-sm border border-line bg-sunken px-3 text-xs font-medium text-ink transition-colors duration-[120ms] hover:border-line-strong hover:bg-surface"
        >
          {t('rail.viewCommunity')}
        </Link>
        <SaveButton entityType="community" entityId={community.id} initialSaved={community.savedByViewer} className="h-8 w-8" />
        <ShareButton url={`/communities/${community.id}`} title={community.name} className="h-8 w-8" />
      </div>
    </RailCard>
  );
}

function ProposalRailCard({ proposal }: { proposal: ProposalRow }) {
  const { t } = useTranslation();
  // The comps label the primary action by phase: a proposal in deliberation
  // invites you to catch up, one at the ballot invites you to vote.
  const cta = proposal.status === "voting" ? t('proposal.vote') : t('rail.learnMore');

  return (
    <RailCard>
      <div className="mb-2 flex items-center justify-between gap-2">
        {proposal.communityName ? <Chip tone="accent">{proposal.communityName}</Chip> : <span />}
        <span className="truncate text-[10px] uppercase tracking-[0.1em] text-ink-faint">{proposal.status}</span>
      </div>

      <div className="flex gap-3">
        <div className="w-20 flex-shrink-0">
          <Thumbnail
            thumbnailKey={(proposal as any).thumbnailKey}
            seed={`proposal-${proposal.id}`}
            subject="proposal"
            ratio="1:1"
            compact
          />
        </div>
        <div className="min-w-0 flex-1">
          <Link
            href={`/proposals/${proposal.id}`}
            className="line-clamp-3 text-sm font-medium leading-snug text-ink hover:text-kyanos"
          >
            {proposal.question}
          </Link>
          {proposal.authorName && (
            <div className="mt-1.5">
              <MetaLine icon={<UserCheck className="h-3 w-3" />}>{proposal.authorName}</MetaLine>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Link
          href={`/proposals/${proposal.id}`}
          className="inline-flex h-8 flex-1 items-center justify-center rounded-sm border border-line bg-sunken px-3 text-xs font-medium text-ink transition-colors duration-[120ms] hover:border-line-strong hover:bg-surface"
        >
          {cta}
        </Link>
        <SaveButton entityType="proposal" entityId={proposal.id} className="h-8 w-8" />
        <ShareButton url={`/proposals/${proposal.id}`} title={proposal.question} className="h-8 w-8" />
      </div>
    </RailCard>
  );
}

function AchievementRailCard({ achievement }: { achievement: AchievementRow }) {
  const { t } = useTranslation();
  const href = achievement.proposalId ? `/proposals/${achievement.proposalId}` : "/proposals";

  return (
    <RailCard>
      <div className="mb-2 flex items-center justify-between gap-2">
        <Chip tone="yper">{t('rail.completed')}</Chip>
        {achievement.communityName && (
          <span className="truncate text-[11px] text-ink-faint">{achievement.communityName}</span>
        )}
      </div>

      <div className="flex gap-3">
        <div className="w-20 flex-shrink-0">
          <Thumbnail
            src={mediaUrl(achievement.imagePath)}
            seed={`achievement-${achievement.id}`}
            subject="meeting"
            ratio="1:1"
            compact
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-3 text-sm font-medium leading-snug text-ink">{achievement.title}</p>
          <div className="mt-1.5 space-y-1">
            {achievement.region && <MetaLine icon={<MapPin className="h-3 w-3" />}>{achievement.region}</MetaLine>}
            {achievement.participantsCount != null && (
              <MetaLine icon={<Users className="h-3 w-3" />}>{achievement.participantsCount}</MetaLine>
            )}
            {achievement.durationDays != null && (
              <MetaLine icon={<Timer className="h-3 w-3" />}>{achievement.durationDays}</MetaLine>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Link
          href={href}
          className="inline-flex h-8 flex-1 items-center justify-center rounded-sm border border-line bg-sunken px-3 text-xs font-medium text-ink transition-colors duration-[120ms] hover:border-line-strong hover:bg-surface"
        >
          {t('rail.seeStory')}
        </Link>
        <ShareButton url={href} title={achievement.title} className="h-8 w-8" />
      </div>
    </RailCard>
  );
}

/**
 * The left rail of the AGORA 2026 comps: popular communities, popular
 * proposals and the curated achievements, each a one-at-a-time pager.
 *
 * "Popular" is member count and support count respectively — the only
 * popularity signals this platform actually records. Nothing here is
 * personalised: a rail that quietly ranks by what a reader already agrees with
 * is the opposite of what a deliberation platform is for.
 */
export function DiscoveryRail() {
  const { t } = useTranslation();

  const { data: communities } = useQuery<CommunityCardData[]>({ queryKey: ["/api/communities"] });
  const { data: proposalsData } = useQuery<{ proposals?: ProposalRow[] } | ProposalRow[]>({
    queryKey: ["/api/proposals"],
  });
  const { data: achievementsData } = useQuery<{ achievements: AchievementRow[] }>({
    queryKey: ["/api/achievements"],
  });

  const topCommunities = [...(communities ?? [])]
    .sort((a, b) => (b.memberCount ?? 0) - (a.memberCount ?? 0))
    .slice(0, 6);

  const proposalList = Array.isArray(proposalsData) ? proposalsData : (proposalsData?.proposals ?? []);
  const topProposals = proposalList
    .filter((p) => p.status !== "draft" && p.status !== "archived")
    .slice(0, 6);

  return (
    <div>
      <PagedRailSection
        title={t('rail.popularCommunities')}
        items={topCommunities}
        emptyLabel={t('rail.empty')}
        renderItem={(community) => <CommunityRailCard community={community} />}
      />
      <PagedRailSection
        title={t('rail.popularProposals')}
        items={topProposals}
        emptyLabel={t('rail.empty')}
        renderItem={(proposal) => <ProposalRailCard proposal={proposal} />}
      />
      <PagedRailSection
        title={t('rail.achievements')}
        items={achievementsData?.achievements ?? []}
        emptyLabel={t('rail.empty')}
        renderItem={(achievement) => <AchievementRailCard achievement={achievement} />}
      />
    </div>
  );
}
