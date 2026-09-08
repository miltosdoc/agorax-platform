import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { IconUsersGroup, IconFileText } from "@tabler/icons-react";
import { useTranslation } from "@/hooks/use-translation";
import { RailSection, RailCard, Chip, CARD_STACK } from "@/components/rails/rail-section";
import { Thumbnail } from "@/components/thumbnails/Thumbnail";
import { SaveButton, ShareButton } from "@/components/cards/card-actions";
import { mediaUrl, type CommunityCardData } from "@/components/cards/community-card";

interface ProposalRow {
  id: number;
  question: string;
  status: string;
  communityId: number;
  thumbnailKey?: string | null;
}

/**
 * The left rail of a detail page: where am I, and what else is here.
 *
 * A detail page arrived at from a feed loses all its surroundings — the
 * reader knows the proposal but not the room it is in. This puts the
 * community back beside it, and offers the obvious next thing to read.
 *
 * It does not duplicate the page's own action column: voting, phase and
 * amendments stay where they are. This rail is context, not controls.
 */
export function CommunityContextRail({
  communityId,
  excludeProposalId,
}: {
  communityId: number;
  excludeProposalId?: number;
}) {
  const { t } = useTranslation();

  const { data: communities } = useQuery<CommunityCardData[]>({ queryKey: ["/api/communities"] });
  const community = (communities ?? []).find((c) => c.id === communityId);

  const { data: proposalsData } = useQuery<{ proposals?: ProposalRow[] } | ProposalRow[]>({
    queryKey: ["/api/proposals"],
  });
  const list = Array.isArray(proposalsData) ? proposalsData : (proposalsData?.proposals ?? []);
  const siblings = list
    .filter((p) => p.communityId === communityId && p.id !== excludeProposalId)
    .filter((p) => p.status !== "draft" && p.status !== "archived")
    .slice(0, 5);

  return (
    <div>
      {community && (
        <div className="mb-6 overflow-hidden rounded-lg border border-line bg-surface">
          <Thumbnail
            src={mediaUrl(community.coverPath)}
            thumbnailKey={community.thumbnailKey}
            seed={`community-${community.id}`}
            subject={community.category ?? "community"}
            ratio="2:1"
            rounded={false}
            className="border-0 border-b border-line"
          />
          <div className="p-4">
            <Link
              href={`/communities/${community.id}`}
              className="font-serif text-lg leading-tight text-ink hover:text-kyanos"
            >
              {community.name}
            </Link>
            {community.username && (
              <p className="mt-0.5 font-mono text-xs text-ink-faint">@{community.username}</p>
            )}

            <div className="mt-2 flex flex-wrap gap-1.5">
              {community.category && <Chip tone="accent">{t(`category.${community.category}`)}</Chip>}
              {community.type && <Chip>{t(`community.type_${community.type}`)}</Chip>}
            </div>

            {(community.tagline || community.description) && (
              <p className="mt-2.5 line-clamp-3 text-xs leading-relaxed text-ink-soft">
                {community.tagline || community.description}
              </p>
            )}

            <div className="mt-3 flex items-center gap-3 border-t border-line pt-2.5 text-[11px] text-ink-faint">
              <span className="flex items-center gap-1.5">
                <IconUsersGroup size={13} stroke={1.75} aria-hidden="true" />
                {community.memberCount ?? 0}
              </span>
              <span className="flex items-center gap-1.5">
                <IconFileText size={13} stroke={1.75} aria-hidden="true" />
                {community.proposalCount ?? 0}
              </span>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <Link
                href={`/communities/${community.id}`}
                className="inline-flex h-9 flex-1 items-center justify-center rounded-md border border-line bg-sunken px-3 text-sm font-medium text-ink transition-colors duration-[120ms] hover:border-line-strong hover:bg-surface"
              >
                {t('rail.viewCommunity')}
              </Link>
              <SaveButton entityType="community" entityId={community.id} initialSaved={community.savedByViewer} />
              <ShareButton url={`/communities/${community.id}`} title={community.name} />
            </div>
          </div>
        </div>
      )}

      <RailSection
        title={t('rail.moreFromCommunity')}
        moreHref={`/communities/${communityId}`}
        moreLabel={t('rail.more')}
      >
        {siblings.length === 0 ? (
          <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-xs text-ink-faint">
            {t('rail.empty')}
          </p>
        ) : (
          <div className={CARD_STACK}>
            {siblings.map((proposal) => (
              <RailCard key={proposal.id}>
                <Link href={`/proposals/${proposal.id}`} className="flex gap-3">
                  <div className="w-12 flex-shrink-0">
                    <Thumbnail
                      thumbnailKey={proposal.thumbnailKey}
                      seed={`proposal-${proposal.id}`}
                      subject="proposal"
                      ratio="1:1"
                      compact
                    />
                  </div>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-3 block text-xs leading-snug text-ink hover:text-kyanos">
                      {proposal.question}
                    </span>
                    <span className="mt-1 block text-[10px] uppercase tracking-[0.1em] text-ink-faint">
                      {proposal.status}
                    </span>
                  </span>
                </Link>
              </RailCard>
            ))}
          </div>
        )}
      </RailSection>
    </div>
  );
}
