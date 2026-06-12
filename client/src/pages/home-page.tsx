/**
 * Authenticated Dashboard (/home)
 *
 * Personal landing surface for signed-in users. Splits the work into
 * three sections: My Proposals (authored by the user), Active Sortitions
 * (bodies the user is eligible for), and Recent Activity (all-community
 * proposal stream). Public marketing content lives on the / landing page.
 */

import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import AppShell from '@/components/layout/AppShell';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowRight, FileText, Plus, Users, Mic, Video } from 'lucide-react';
import { ConferenceRoomCard } from '@/components/livekit/ConferenceRoomCard';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { useTranslation } from '@/hooks/use-translation';
import StatusBadge from '@/components/proposal/StatusBadge';
import { EmptyState, LoadingState } from '@/components/ui/empty-state';

interface Proposal {
  id: number;
  question: string;
  status: string;
  authorId: number;
  authorName?: string;
  communityId: number;
  communityName?: string;
  createdAt: string;
}

interface SortitionBody {
  id: number;
  communityId: number;
  proposalId: number | null;
  status: string;
  community?: { id: number; name: string } | null;
  proposal?: { id: number; question: string } | null;
  memberCount?: number;
  responded?: number;
}

function ProposalCard({ proposal }: { proposal: Proposal }) {
  const { t } = useTranslation();
  return (
    <Link href={`/proposals/${proposal.id}`} className="block">
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-base line-clamp-2 mb-1">{proposal.question}</h3>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5" />
                  {proposal.communityName ?? `#${proposal.communityId}`}
                </span>
                <span>{new Date(proposal.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
            <StatusBadge status={proposal.status} />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

interface FeedItem {
  id: number;
  proposalId: number;
  kind: 'podcast' | 'video';
  filePath: string;
  thumbPath: string | null;
  durationS: string | null;
  proposalQuestion: string;
  communityName: string;
}

interface LivekitJoinable {
  id: number;
  kind: 'community' | 'sortition';
  title: string;
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
            badge={room.status === 'active' ? t('livekit.liveNow') : t('livekit.scheduled')}
          />
        ))}
      </div>
    </section>
  );
}

function DashboardFeedSection() {
  const { t } = useTranslation();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.get<{ items: FeedItem[] }>('/api/feed?limit=4')
      .then(resp => setItems(resp.data.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return null;
  if (items.length === 0) return null;

  return (
    <section data-testid="dashboard-feed">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-semibold">{t('feed.recent')}</h2>
        <Link href="/feed" className="text-sm text-primary hover:underline flex items-center gap-1">
          {t('feed.viewAll')}
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map(item => {
          const Icon = item.kind === 'podcast' ? Mic : Video;
          const thumbUrl = item.thumbPath ? `/media/${item.thumbPath}` : undefined;
          return (
            <Link key={item.id} href={`/proposals/${item.proposalId}`} className="block">
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                {item.kind === 'video' && thumbUrl && (
                  <div className="aspect-video bg-black rounded-t-lg overflow-hidden">
                    <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <Icon className="w-3.5 h-3.5" />
                    <span>{item.kind === 'podcast' ? t('media.kindPodcast') : t('media.kindVideoShort')}</span>
                    <span>·</span>
                    <span className="truncate">{item.communityName}</span>
                  </div>
                  <h3 className="font-semibold text-sm line-clamp-2">{item.proposalQuestion}</h3>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export default function HomePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [sortitionBodies, setSortitionBodies] = useState<SortitionBody[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<Proposal[]>('/api/proposals?limit=10').catch(() => ({ data: [] as Proposal[] })),
      api.get<SortitionBody[]>('/api/sortition/my-bodies').catch(() => ({ data: [] as SortitionBody[] })),
    ]).then(([propResp, bodiesResp]) => {
      setProposals(propResp.data ?? []);
      setSortitionBodies(bodiesResp.data ?? []);
      setLoading(false);
    });
  }, []);

  const myProposals = user ? proposals.filter((p) => p.authorId === user.id) : [];
  const othersProposals = user ? proposals.filter((p) => p.authorId !== user.id) : proposals;
  const activeBodies = sortitionBodies.filter((b) => b.status !== 'completed' && b.status !== 'archived');

  return (
    <AppShell title={t('dashboard.title')}>
      {loading ? (
        <LoadingState label={t('general.loading')} />
      ) : (
        <div className="space-y-10">
          {/* My Proposals */}
          <section data-testid="dashboard-my-proposals">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-semibold">{t('dashboard.myProposals')}</h2>
            </div>
            {myProposals.length === 0 ? (
              <EmptyState
                title={t('home.noProposals')}
                action={
                  <Button onClick={() => navigate('/proposals/new')}>
                    <Plus className="w-4 h-4 mr-2" />
                    {t('home.submitProposal')}
                  </Button>
                }
              />
            ) : (
              <div className="space-y-2">
                {myProposals.slice(0, 6).map((p) => (
                  <ProposalCard key={p.id} proposal={p} />
                ))}
              </div>
            )}
          </section>

          {/* Active Sortitions */}
          <section data-testid="dashboard-active-sortitions">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-semibold">{t('dashboard.activeSortitions')}</h2>
              <Link href="/sortition" className="text-sm text-primary hover:underline">
                {t('home.allCommunities')} →
              </Link>
            </div>
            {activeBodies.length === 0 ? (
              <EmptyState title={t('home.noSortitions')} />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {activeBodies.slice(0, 4).map((body) => (
                  <Link key={body.id} href={`/sortition/body/${body.id}`} className="block">
                    <Card className="hover:shadow-md transition-shadow cursor-pointer">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-base mb-1 line-clamp-2">
                              {body.proposal?.question ?? `Sortition #${body.id}`}
                            </h3>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Users className="w-3.5 h-3.5" />
                                {body.community?.name ?? `#${body.communityId}`}
                              </span>
                              {typeof body.memberCount === 'number' && (
                                <span>
                                  {body.responded ?? 0} / {body.memberCount}
                                </span>
                              )}
                            </div>
                          </div>
                          <Badge variant="outline">{body.status}</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Active conferences — live + scheduled rooms the user can join */}
          <DashboardActiveRoomsSection />

          {/* Recent media — embedded feed */}
          <DashboardFeedSection />

          {/* Recent Activity */}
          <section data-testid="dashboard-recent-activity">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-semibold">{t('dashboard.recentActivity')}</h2>
              <Link href="/proposals" className="text-sm text-primary hover:underline flex items-center gap-1">
                {t('dashboard.viewAllProposals')}
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            {othersProposals.length === 0 ? (
              <EmptyState title={t('home.noProposals')} />
            ) : (
              <div className="space-y-2">
                {othersProposals.slice(0, 6).map((p) => (
                  <ProposalCard key={p.id} proposal={p} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}
