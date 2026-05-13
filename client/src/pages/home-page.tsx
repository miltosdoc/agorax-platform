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
import { ArrowRight, FileText, Plus, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { useTranslation, getStatusLabel } from '@/hooks/use-translation';
import { getStatusForProposal } from '@/lib/proposal-status';

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
  const status = getStatusForProposal(proposal);
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
            <Badge className={status.color} variant="outline">
              <span className="mr-1">{status.icon}</span>
              {getStatusLabel(proposal.status, t)}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </Link>
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
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          {t('general.loading')}
        </div>
      ) : (
        <div className="space-y-10">
          {/* My Proposals */}
          <section data-testid="dashboard-my-proposals">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-semibold">{t('dashboard.myProposals')}</h2>
            </div>
            {myProposals.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center">
                  <p className="text-muted-foreground mb-4">{t('home.noProposals')}</p>
                  <Button onClick={() => navigate('/proposals/new')}>
                    <Plus className="w-4 h-4 mr-2" />
                    {t('home.submitProposal')}
                  </Button>
                </CardContent>
              </Card>
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
              <Card>
                <CardContent className="p-6 text-center text-sm text-muted-foreground">
                  {t('home.noProposals')}
                </CardContent>
              </Card>
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
              <Card>
                <CardContent className="p-6 text-center text-sm text-muted-foreground">
                  {t('home.noProposals')}
                </CardContent>
              </Card>
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
