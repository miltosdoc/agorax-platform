import { Link } from 'wouter';
import { MapPin, Users, MessageSquare, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';
import { Thumbnail } from '@/components/thumbnails/Thumbnail';
import { SaveButton, ShareButton } from '@/components/cards/card-actions';
import { CommunityJoinAction } from '@/components/community/CommunityJoinAction';
import type { CommunityJoinStatus } from '@shared/community-membership';

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
  activeProposalCount?: number;
  createdAt?: string | Date | null;
  savedByViewer?: boolean;
  viewerIsMember?: boolean;
  viewerRole?: string | null;
  viewerJoinStatus?: CommunityJoinStatus;
  joinPolicy?: string | null;
  contentHidden?: boolean;
  latestProposal?: { id: number; question: string; status: string; createdAt: string } | null;
}

export function mediaUrl(path?: string | null): string | undefined {
  return path ? `/media/${path}` : undefined;
}

/** Readable identity and one next step, with joining available in place. */
export function CommunityCard({ community }: { community: CommunityCardData }) {
  const { t } = useTranslation();
  const isMember = community.viewerIsMember;
  return (
    <article className="flex min-w-0 flex-col rounded-2xl border border-line bg-surface p-5 shadow-sm transition-colors hover:border-kyanos/35 sm:p-6" data-testid={`card-community-${community.id}`}>
      <div className="flex items-start gap-4">
        <Link href={`/communities/${community.id}`} className="block w-16 shrink-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kyanos" aria-label={community.name}>
          <Thumbnail src={mediaUrl(community.avatarPath || community.coverPath)} thumbnailKey={community.thumbnailKey} seed={`community-avatar-${community.id}`} subject="community" ratio="1:1" compact className="rounded-xl" />
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={`/communities/${community.id}`} className="block break-words text-xl font-semibold leading-snug text-ink hover:text-kyanos">{community.name}</Link>
          {community.category && <p className="mt-1 text-sm text-kyanos">{t(`category.${community.category}`)}</p>}
          {isMember && <span className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-kyanos"><CheckCircle2 className="h-4 w-4" />{t('membership.member')}</span>}
        </div>
      </div>
      {(community.tagline || community.description) && <p className="mt-4 line-clamp-3 text-base leading-relaxed text-ink-soft">{community.tagline || community.description}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-soft">
        <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4 text-ink-faint" />{community.memberCount ?? 0} {t('community.members')}</span>
        {!!community.activeProposalCount && <span className="inline-flex items-center gap-1.5 text-kyanos"><MessageSquare className="h-4 w-4" />{t('communities.activeTopics', { count: community.activeProposalCount })}</span>}
        {community.region && <span className="inline-flex min-w-0 items-center gap-1.5"><MapPin className="h-4 w-4 shrink-0 text-ink-faint" /><span className="truncate">{community.region}</span></span>}
      </div>
      {!isMember && <p className="mt-3 text-sm text-ink-faint">{t(community.joinPolicy === 'approval' ? 'communities.approvalJoin' : community.joinPolicy === 'invite_only' ? 'communities.inviteJoin' : 'communities.openJoin')}</p>}
      {isMember && community.latestProposal && <Link href={`/proposals/${community.latestProposal.id}`} className="mt-4 block rounded-xl bg-kyanos-wash p-3 text-sm leading-relaxed text-ink hover:text-kyanos"><span className="mb-1 block text-xs font-medium text-ink-soft">{t('community.latest_proposal')}</span><span className="line-clamp-2">{community.latestProposal.question}</span></Link>}
      <div className="mt-auto pt-5">
        {!isMember && <CommunityJoinAction communityId={community.id} className="w-full" compact />}
        <div className={`flex items-center gap-2 ${!isMember ? 'mt-3' : ''}`}>
          <Link href={`/communities/${community.id}`} className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors ${isMember ? 'bg-kyanos text-white hover:bg-kyanos-deep' : 'border border-line text-ink hover:bg-sunken'}`} data-testid={`link-view-community-${community.id}`}>{t('communities.open')}<ArrowRight className="h-4 w-4" /></Link>
          <SaveButton entityType="community" entityId={community.id} initialSaved={community.savedByViewer} />
          <ShareButton url={`/communities/${community.id}`} title={community.name} />
        </div>
      </div>
    </article>
  );
}
