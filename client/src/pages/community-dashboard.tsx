/**
 * Community Dashboard Page
 * 
 * Displays community overview, active proposals, sortition bodies,
 * democracy score, and merge controls.
 */

import { useState, useEffect } from 'react';
import { useLocation, useParams } from 'wouter';
import AppShell from "@/components/layout/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Users, FileText, Vote, Shield, Settings, CheckCircle2, Merge, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { useTranslation, getStatusLabel } from '@/hooks/use-translation';
import {
  getCommunityDashboardMetrics,
  getGovernanceTranslationKey,
  hasDemocracyScore,
  type CommunitySummary,
} from '@shared/community-summary';

interface CommunityForMerge {
  id: number;
  name: string;
  mergedInto: number | null;
}

interface CommunityMember {
  userId: number;
  username: string;
  name: string | null;
  profilePicture: string | null;
  role: string;
  joinedAt: string;
}

export default function CommunityDashboardPage() {
  const params = useParams();
  const communityId = params.id;
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const { user } = useAuth();

  const [summary, setSummary] = useState<CommunitySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [allCommunities, setAllCommunities] = useState<CommunityForMerge[]>([]);
  const [members, setMembers] = useState<CommunityMember[] | null>(null);
  const [membersLoading, setMembersLoading] = useState(false);
  const [roleUpdating, setRoleUpdating] = useState<Record<number, boolean>>({});
  const [targetCommunityId, setTargetCommunityId] = useState<number | null>(null);
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [mergeSuccess, setMergeSuccess] = useState(false);
  const [joinState, setJoinState] = useState<'idle' | 'submitting' | 'pending'>('idle');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [pendingRequests, setPendingRequests] = useState<Array<{ id: number; userId: number; message: string | null; createdAt: string; user: { id: number; username: string; name: string | null; profilePicture: string | null } | null }>>([]);
  const [requestDeciding, setRequestDeciding] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!communityId) return;

    Promise.all([
      api.get<CommunitySummary>(`/api/communities/${communityId}/summary`),
      api.get<CommunityForMerge[]>('/api/communities'),
    ]).then(([summaryResp, commResp]) => {
      setSummary(summaryResp.data);
      setAllCommunities(commResp.data);
    }).catch(() => setSummary(null))
      .finally(() => setLoading(false));
  }, [communityId]);

  useEffect(() => {
    if (!communityId) return;
    setMembersLoading(true);
    api.get<CommunityMember[]>(`/api/communities/${communityId}/members`)
      .then((r) => setMembers(r.data))
      .catch(() => setMembers([]))
      .finally(() => setMembersLoading(false));
  }, [communityId]);

  const isMember = !!(user && members?.some((m) => m.userId === user.id));
  const canManageSettingsLive = !!summary?.canManageSettings;

  useEffect(() => {
    if (!communityId || !canManageSettingsLive) return;
    api.get<typeof pendingRequests>(`/api/communities/${communityId}/join-requests`)
      .then((r) => setPendingRequests(r.data))
      .catch(() => setPendingRequests([]));
  }, [communityId, canManageSettingsLive, members]);

  const applyToJoin = async () => {
    if (!communityId) return;
    setJoinState('submitting');
    setJoinError(null);
    try {
      const res = await api.post<{ status?: string } | unknown>(`/api/communities/${communityId}/members`, {});
      const status = (res.status === 202) ? 'pending' : 'idle';
      setJoinState(status as 'pending' | 'idle');
      if (status !== 'pending') {
        const refreshed = await api.get<CommunityMember[]>(`/api/communities/${communityId}/members`);
        setMembers(refreshed.data);
      }
    } catch (error: any) {
      setJoinError(error.response?.data?.message || t('community.join_failed') || 'Failed to apply');
      setJoinState('idle');
    }
  };

  const decideJoinRequest = async (requestId: number, decision: 'approve' | 'reject') => {
    if (!communityId) return;
    setRequestDeciding((s) => ({ ...s, [requestId]: true }));
    try {
      await api.post(`/api/communities/${communityId}/join-requests/${requestId}/${decision}`, {});
      setPendingRequests((rows) => rows.filter((r) => r.id !== requestId));
      if (decision === 'approve') {
        const refreshed = await api.get<CommunityMember[]>(`/api/communities/${communityId}/members`);
        setMembers(refreshed.data);
      }
    } catch {
      // surface inline failure on the row if needed; keep silent for now
    } finally {
      setRequestDeciding((s) => ({ ...s, [requestId]: false }));
    }
  };

  const handleMerge = async () => {
    if (!targetCommunityId || !communityId) return;
    setMerging(true);
    setMergeError(null);
    try {
      await api.post(`/api/communities/${communityId}/merge`, {
        targetCommunityId,
      });
      setMergeSuccess(true);
      setTimeout(() => {
        setMergeSuccess(false);
        window.location.href = `/communities/${targetCommunityId}`;
      }, 2000);
    } catch (error: any) {
      setMergeError(error.response?.data?.message || 'Merge failed');
    }
    setMerging(false);
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[40vh]">{t('common.loading')}</div>
      </AppShell>
    );
  }

  if (!summary) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[40vh]">{t('community.not_found')}</div>
      </AppShell>
    );
  }

  const { community, proposals, memberCount, canManageSettings } = summary;
  const metrics = getCommunityDashboardMetrics({ memberCount, proposals });
  const democracyScoreAvailable = hasDemocracyScore(community.democracyScore);
  const democracyScore = democracyScoreAvailable ? Number(community.democracyScore) : null;
  const governanceLabel = t(getGovernanceTranslationKey(community.governanceModel));
  const description = community.description?.trim();

  return (
    <AppShell breadcrumb={[{ label: t('nav.communities'), href: '/communities' }, { label: community.name }]}>
      <Button variant="ghost" className="mb-4" onClick={() => window.history.back()}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        {t('common.back')}
      </Button>

      <Card className="mb-6 border-primary/10 bg-gradient-to-br from-background to-muted/30">
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-2xl">{community.name}</CardTitle>
                <Badge variant="secondary">{governanceLabel}</Badge>
              </div>
              <CardDescription>
                {description || t('community.no_description')}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {user && isMember && (
                <Button size="sm" onClick={() => setLocation(`/proposals/new?community=${communityId}`)}>
                  <Plus className="w-4 h-4 mr-2" />
                  {t('home.submitProposal')}
                </Button>
              )}
              {user && !isMember && community.joinPolicy !== 'invite_only' && joinState !== 'pending' && (
                <Button size="sm" disabled={joinState === 'submitting'} onClick={applyToJoin}>
                  {community.joinPolicy === 'approval'
                    ? (t('community.apply_to_join') || 'Apply to join')
                    : (t('community.join') || 'Join')}
                </Button>
              )}
              {user && !isMember && community.joinPolicy === 'invite_only' && (
                <Badge variant="outline">{t('community.invite_only') || 'Invite only'}</Badge>
              )}
              {user && !isMember && joinState === 'pending' && (
                <Badge variant="outline">{t('community.request_pending') || 'Request pending'}</Badge>
              )}
              {joinError && (
                <span className="text-sm text-destructive" data-testid="join-error">{joinError}</span>
              )}
              {user && (canManageSettings || isMember || community.type === 'autonomous') && (
                <Button variant="outline" size="sm" onClick={() => setLocation(`/communities/${communityId}/settings`)}>
                  <Settings className="w-4 h-4 mr-2" />
                  {community.type === 'autonomous'
                    ? (t('community.settings_vote_title') || t('community.settings_title'))
                    : t('community.settings_title')}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border bg-background/70 p-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="w-4 h-4" />
                {t('community.members')}
              </div>
              <div className="mt-1 text-2xl font-semibold">{metrics.memberCount}</div>
            </div>
            <div className="rounded-lg border bg-background/70 p-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="w-4 h-4" />
                {t('community.proposals')}
              </div>
              <div className="mt-1 text-2xl font-semibold">{metrics.proposalCount}</div>
            </div>
            <div className="rounded-lg border bg-background/70 p-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Vote className="w-4 h-4" />
                {t('community.active_proposals')}
              </div>
              <div className="mt-1 text-2xl font-semibold">{metrics.activeProposalCount}</div>
            </div>
            <div className="rounded-lg border bg-background/70 p-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="w-4 h-4" />
                {t('community.decided_proposals')}
              </div>
              <div className="mt-1 text-2xl font-semibold">{metrics.decidedProposalCount}</div>
            </div>
          </div>

          <div className="rounded-lg border bg-background/70 p-4">
            <div className="flex items-center justify-between text-sm mb-2">
              <div className="flex items-center gap-2 font-medium">
                <Shield className="w-4 h-4 text-muted-foreground" />
                {t('community.democracy_score')}
              </div>
              <span>{democracyScoreAvailable ? `${democracyScore}/100` : t('community.score_not_available')}</span>
            </div>
            <Progress value={democracyScore ?? 0} />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="proposals">
        <TabsList>
          <TabsTrigger value="proposals">{t('community.tab_proposals')}</TabsTrigger>
          <TabsTrigger value="sortition">{t('community.tab_sortition')}</TabsTrigger>
          <TabsTrigger value="members">{t('community.tab_members')}</TabsTrigger>
          <TabsTrigger value="merge">{t('community.tab_merge')}</TabsTrigger>
        </TabsList>
        
        <TabsContent value="proposals">
          <Card>
            <CardHeader>
              <CardTitle>{t('community.tab_proposals')}</CardTitle>
            </CardHeader>
            <CardContent>
              {proposals.length === 0 ? (
                <p className="text-muted-foreground">{t('community.no_proposals')}</p>
              ) : (
                <div className="space-y-2">
                  {proposals.map((proposal) => (
                    <div key={proposal.id} className="flex items-center justify-between gap-3 p-3 border rounded">
                      <div>
                        <div className="font-medium">{proposal.question}</div>
                        <div className="text-sm text-muted-foreground">
                          {t('common.by')} {proposal.authorLabel} · {new Date(proposal.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <Badge variant={
                        proposal.status === 'voting' ? 'default' :
                        proposal.status === 'community_signal' || proposal.status === 'sortition_synthesis' ? 'secondary' :
                        'outline'
                      }>
                        {getStatusLabel(proposal.status, t)}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="sortition">
          <Card>
            <CardHeader>
              <CardTitle>{t('community.sortition_bodies')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{t('community.no_sortition_bodies')}</p>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="members">
          {canManageSettings && pendingRequests.length > 0 && (
            <Card className="mb-4 border-amber-300/40">
              <CardHeader>
                <CardTitle>{t('community.pending_requests_title') || 'Pending join requests'}</CardTitle>
                <CardDescription>
                  {pendingRequests.length} {t('community.pending_requests_count') || 'pending'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {pendingRequests.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 py-3">
                      {r.user?.profilePicture ? (
                        <img src={r.user.profilePicture} alt={r.user.name || r.user.username} className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                          {(r.user?.name || r.user?.username || '?').slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{r.user?.name || r.user?.username || `user #${r.userId}`}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {r.user?.username ? `@${r.user.username} · ` : ''}{new Date(r.createdAt).toLocaleDateString()}
                        </p>
                        {r.message && <p className="text-sm mt-1 text-muted-foreground line-clamp-2">{r.message}</p>}
                      </div>
                      <Button
                        size="sm"
                        variant="default"
                        disabled={!!requestDeciding[r.id]}
                        onClick={() => decideJoinRequest(r.id, 'approve')}
                      >
                        {t('community.approve') || 'Approve'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!requestDeciding[r.id]}
                        onClick={() => decideJoinRequest(r.id, 'reject')}
                      >
                        {t('community.reject') || 'Reject'}
                      </Button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>{t('community.tab_members')}</CardTitle>
              <CardDescription>
                {memberCount} {t('community.members')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {membersLoading && (
                <p className="text-muted-foreground">{t('common.loading')}</p>
              )}
              {!membersLoading && members && members.length === 0 && (
                <p className="text-muted-foreground">{t('community.members_empty') || 'No members yet.'}</p>
              )}
              {!membersLoading && members && members.length > 0 && (
                <ul className="divide-y">
                  {members.map((m) => (
                    <li key={m.userId} className="flex items-center gap-3 py-3">
                      {m.profilePicture ? (
                        <img
                          src={m.profilePicture}
                          alt={m.name || m.username}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                          {(m.name || m.username).slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{m.name || m.username}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          @{m.username} · {t('community.joined') || 'joined'} {new Date(m.joinedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge variant={m.role === 'admin' || m.role === 'founder' ? 'default' : 'secondary'}>
                        {t(`community.role.${m.role}`) || m.role}
                      </Badge>
                      {canManageSettings && m.role !== 'founder' && user && m.userId !== user.id && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={roleUpdating[m.userId]}
                          onClick={async () => {
                            const next = m.role === 'admin' ? 'member' : 'admin';
                            setRoleUpdating((p) => ({ ...p, [m.userId]: true }));
                            try {
                              await api.patch(`/api/communities/${communityId}/members/${m.userId}`, { role: next });
                              setMembers((prev) =>
                                prev?.map((x) => (x.userId === m.userId ? { ...x, role: next } : x)) ?? prev,
                              );
                            } catch (e: any) {
                              alert(e?.response?.data?.message || String(e?.message || e));
                            } finally {
                              setRoleUpdating((p) => ({ ...p, [m.userId]: false }));
                            }
                          }}
                        >
                          {m.role === 'admin'
                            ? (t('community.demote') || 'Υποβιβασμός')
                            : (t('community.promote') || 'Προαγωγή σε διαχειριστή')}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="merge">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Merge className="w-5 h-5" />
                {t('community.merge_title')}
              </CardTitle>
              <CardDescription>{t('community.merge_description')}</CardDescription>
            </CardHeader>
            <CardContent>
              {community.mergedInto ? (
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm">{t('community.already_merged')}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{t('community.select_target')}</span>
                    <select
                      value={targetCommunityId || ''}
                      onChange={(e) => setTargetCommunityId(parseInt(e.target.value))}
                      className="border rounded px-3 py-1 text-sm"
                    >
                      <option value="">{t('community.choose_community')}</option>
                      {allCommunities
                        .filter(c => c.id !== community.id && !c.mergedInto)
                        .map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>• {t('community.merge_members')}</p>
                    <p>• {t('community.merge_proposals')}</p>
                    <p>• {t('community.merge_archived')}</p>
                  </div>
                  <Button
                    onClick={handleMerge}
                    disabled={!targetCommunityId || merging}
                    className="w-full"
                  >
                    {merging ? t('common.loading') : t('community.merge_button')}
                  </Button>
                  {mergeError && (
                    <p className="text-sm text-destructive">{mergeError}</p>
                  )}
                  {mergeSuccess && (
                    <p className="text-sm text-green-600">{t('community.merge_success')}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
