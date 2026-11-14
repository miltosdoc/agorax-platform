import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import type { ActivityItem, ActivityPage } from '@shared/activity-feed';
import AppShell from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { ArrowRight, Plus, Users, Mic } from 'lucide-react';
import { ConferenceRoomCard } from '@/components/livekit/ConferenceRoomCard';
import { api } from '@/lib/api';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { useTranslation } from '@/hooks/use-translation';
import { useCommunityDirectory, pinnedFirst } from '@/hooks/use-community-membership';
import { EntityCard } from '@/components/cards/entity-card';
import { Thumbnail } from '@/components/thumbnails/Thumbnail';
import { mediaUrl } from '@/components/cards/community-card';
import StatusBadge from '@/components/proposal/StatusBadge';

interface Proposal {
  id: number; question: string; solution?: string; status: string; authorId: number;
  authorName?: string; authorUsername?: string; communityId: number; communityName?: string;
  createdAt: string; kind?: string;
}
interface SortitionBody {
  id: number; communityId: number; proposalId: number | null; status: string;
  community?: { id: number; name: string } | null;
  proposal?: { id: number; question: string } | null;
  memberCount?: number; responded?: number;
}
interface LivekitJoinable {
  id: number;
  kind: 'community' | 'sortition';
  title: string;
  description: string | null;
  status: 'scheduled' | 'active' | 'closed';
}

function DashboardActiveRoomsSection() {
  const { t } = useTranslation();
  const [rooms, setRooms] = useState<LivekitJoinable[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = () => api.get<LivekitJoinable[]>('/api/livekit/my-rooms')
    .then(resp => setRooms((resp.data ?? []).filter(r => r.status !== 'closed')))
    .catch(() => setRooms([]))
    .finally(() => setLoaded(true));

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 60_000);
    return () => clearInterval(interval);
  }, []);

  if (!loaded) return null;
  if (rooms.length === 0) return null;

  return (
    <section data-testid="dashboard-active-rooms">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Mic className="w-5 h-5" />
          {t('livekit.communitySectionTitle')}
        </h2>
      </div>
      <div className="space-y-3">
        {rooms.map(room => (
          <ConferenceRoomCard
            key={room.id}
            roomId={room.id}
            title={room.title}
            description={room.description ?? undefined}
            badge={room.status === 'active' ? t('livekit.liveNow') : t('livekit.scheduled')}
          />
        ))}
      </div>
    </section>
  );
}

export default function HomePage() {
  const { t, locale } = useTranslation();
  const { user } = useAuth();
  const directory = useCommunityDirectory();
  const communities = pinnedFirst((directory.data ?? []).filter((community) => community.viewerIsMember));
  const proposalQuery = useQuery<Proposal[]>({ queryKey: ['/api/proposals', { viewerId: user?.id ?? 0 }], queryFn: async () => (await apiRequest('GET', '/api/proposals')).json(), enabled: !!user });
  const activeQuery = useQuery<ActivityPage>({ queryKey: ['/api/activity-feed', { scope: 'mine', type: 'proposal', stage: 'active', limit: 4, viewerId: user?.id ?? 0 }], staleTime: 0, enabled: !!user });
  const bodiesQuery = useQuery<SortitionBody[]>({ queryKey: ['/api/sortition/my-bodies', { viewerId: user?.id ?? 0 }], enabled: !!user });
  const myProposals = (proposalQuery.data ?? []).filter((proposal) => proposal.authorId === user?.id).sort((a, b) => Number(b.status === 'draft') - Number(a.status === 'draft') || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const activeBodies = (bodiesQuery.data ?? []).filter((body) => !['completed', 'archived'].includes(body.status));
  const communityName = (id: number) => directory.data?.find((community) => community.id === id)?.name || t('proposal.communityWithId', { id });
  const dateLabel = (date: string) => new Date(date).toLocaleDateString(locale === 'el' ? 'el-GR' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const loadingRows = <div className="space-y-3" aria-busy="true">{[0, 1].map((id) => <div key={id} className="h-32 animate-pulse rounded-2xl bg-sunken" />)}</div>;
  const activeCard = (item: ActivityItem) => <EntityCard key={item.feedKey} subject="proposal" kindLabel={t(`proposal.kind_${item.kind || 'decision'}`)} id={item.id} title={item.question || item.title || ''} excerpt={item.solution} href={`/proposals/${item.id}`} tag={item.communityName || ''} tagHref={`/communities/${item.communityId}`} badge={<StatusBadge status={item.status || ''} />} meta={<span>{item.actorName || item.actorUsername || t('redesignMedia.authorUnknown')} · {dateLabel(item.createdAt)}</span>} bookmarkKind="proposal" />;

  return <AppShell title={t('dashboard.title')} actions={<Button asChild><Link href="/proposals/new"><Plus className="h-4 w-4" />{t('home.submitProposal')}</Link></Button>}>
    <p className="-mt-3 mb-8 text-base leading-relaxed text-ink-soft">{t('dashboard.personalHelp')}</p>
    <div className="space-y-8">
      <section aria-labelledby="home-my-communities">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 id="home-my-communities" className="text-xl font-semibold text-ink">{t('communities.my')}</h2><Link href="/communities?view=mine" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-kyanos">{t('rail.more')}<ArrowRight className="h-4 w-4" /></Link></div>
        {directory.isLoading ? loadingRows : directory.isError ? <p role="alert" className="rounded-xl border border-line p-4 text-ink-soft">{t('communities.loadError')}</p> : communities.length ? <div className="grid gap-3 sm:grid-cols-2">{communities.slice(0, 4).map((community) => <Link key={community.id} href={`/communities/${community.id}`} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 hover:border-kyanos/35"><div className="w-12 shrink-0"><Thumbnail src={mediaUrl(community.avatarPath)} thumbnailKey={community.thumbnailKey} seed={`community-avatar-${community.id}`} subject="community" ratio="1:1" compact /></div><div className="min-w-0"><h3 className="text-base font-semibold leading-snug text-ink">{community.name}</h3><p className="mt-1 text-sm text-ink-soft">{t('communities.activeTopics', { count: community.activeProposalCount ?? 0 })}</p></div></Link>)}</div> : <div className="rounded-2xl border border-dashed border-line p-5"><p className="text-base text-ink-soft">{t('communities.noMemberships')}</p><Button className="mt-4" variant="outline" asChild><Link href="/communities?view=discover">{t('communities.discover')}</Link></Button></div>}
      </section>

      {activeBodies.length > 0 && <section data-testid="dashboard-active-sortitions"><h2 className="mb-4 text-xl font-semibold text-ink">{t('dashboard.activeSortitions')}</h2><div className="space-y-3">{activeBodies.slice(0, 4).map((body) => <Link key={body.id} href={`/sortition/body/${body.id}`} className="block rounded-2xl border border-kyanos/25 bg-kyanos-wash p-5"><h3 className="text-lg font-semibold text-ink">{body.proposal?.question || body.community?.name || communityName(body.communityId)}</h3><p className="mt-2 flex items-center gap-2 text-sm text-ink-soft"><Users className="h-4 w-4" />{body.community?.name || communityName(body.communityId)}{typeof body.memberCount === 'number' ? ` · ${body.responded ?? 0}/${body.memberCount}` : ''}</p></Link>)}</div></section>}
      <DashboardActiveRoomsSection />
      <section data-testid="dashboard-recent-activity"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-semibold text-ink">{t('dashboard.activeTopics')}</h2><Link href="/feed" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-kyanos">{t('feed.viewAll')}<ArrowRight className="h-4 w-4" /></Link></div>{activeQuery.isLoading ? loadingRows : activeQuery.isError ? <p role="alert" className="rounded-xl border border-line p-4 text-ink-soft">{t('proposal.loadError')}</p> : activeQuery.data?.items.length ? <div className="space-y-4">{activeQuery.data.items.map(activeCard)}</div> : <p className="rounded-2xl border border-dashed border-line p-5 text-base text-ink-soft">{t('dashboard.emptyActive')}</p>}</section>
      <section data-testid="dashboard-my-proposals"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-semibold text-ink">{t('dashboard.myDrafts')}</h2><Link href="/proposals" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-kyanos">{t('dashboard.viewAllProposals')}<ArrowRight className="h-4 w-4" /></Link></div>{proposalQuery.isLoading ? loadingRows : proposalQuery.isError ? <p role="alert" className="rounded-xl border border-line p-4 text-ink-soft">{t('proposal.loadError')}</p> : myProposals.length ? <div className="space-y-4">{myProposals.slice(0, 4).map((proposal) => <EntityCard key={proposal.id} subject="proposal" kindLabel={t(`proposal.kind_${proposal.kind || 'decision'}`)} id={proposal.id} title={proposal.question} href={`/proposals/${proposal.id}`} tag={proposal.communityName || communityName(proposal.communityId)} tagHref={`/communities/${proposal.communityId}`} badge={<StatusBadge status={proposal.status} />} meta={<span>{proposal.authorName || proposal.authorUsername || user?.name || user?.username} · {dateLabel(proposal.createdAt)}</span>} bookmarkKind="proposal" />)}</div> : <p className="rounded-2xl border border-dashed border-line p-5 text-base text-ink-soft">{t('home.noProposals')}</p>}</section>
    </div>
  </AppShell>;
}
