/**
 * Community Dashboard Page
 * 
 * Displays community overview, active proposals, sortition bodies,
 * democracy score, and merge controls.
 */

import { useState, useEffect } from 'react';
import { Link, useLocation, useParams, useSearch } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { useCommunityMembership } from '@/hooks/use-community-membership';
import { CommunityJoinAction } from '@/components/community/CommunityJoinAction';
import { Thumbnail } from '@/components/thumbnails/Thumbnail';
import { mediaUrl } from '@/components/cards/community-card';
import AppShell from "@/components/layout/AppShell";
import {
  CommunityIdentityRail,
  CommunityStatsRail,
  CommunityMeetingsRail,
  CommunityActivityRail,
  CommunityDocumentsRail,
  CommunityTagsRail,
} from "@/components/rails/community-rails";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Users, FileText, Vote, Shield, Settings, CheckCircle2, Merge, Plus, Mic, LogOut, MailOpen, Link2, Copy, X } from 'lucide-react';
import { CommunityRoomsSection } from '@/components/livekit/CommunityRoomsSection';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { useTranslation } from '@/hooks/use-translation';
import { CommunityLibrary } from '@/components/community/CommunityLibrary';
import { CommunityConstitution } from '@/components/community/CommunityConstitution';
import { CommunityForum } from '@/components/community/CommunityForum';
import { RemovalPanel, RemoveMemberButton, useRemovalOverview } from '@/components/community/MemberRemoval';
import { removalModeFor } from '@shared/member-removal';
import ShareButton from '@/components/ShareButton';
import {
  getCommunityDashboardMetrics,
  getGovernanceTranslationKey,
  hasDemocracyScore,
  type CommunitySummary,
} from '@shared/community-summary';
import StatusBadge from '@/components/proposal/StatusBadge';
import { ACTIVE_PROPOSAL_STATES } from '@shared/activity-feed';

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

interface CommunityInvite {
  id: number;
  token: string;
  role: string;
  maxUses: number;
  useCount: number;
  message: string | null;
  expiresAt: string | null;
  createdAt: string;
  invitedUserId: number | null;
  invitedUser: { id: number; username: string; name: string | null; profilePicture: string | null } | null;
}

export default function CommunityDashboardPage() {
  const params = useParams();
  const communityId = params.id;
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const { user } = useAuth();
  const urlSearch = useSearch();
  const queryClient = useQueryClient();
  const membership = useCommunityMembership(Number(communityId));

  const [summary, setSummary] = useState<CommunitySummary | null>(null);
  const [loading, setLoading] = useState(true);
  // Honor ?tab=… so shared links (e.g. conference invites) land on the right tab
  const [activeTab, setActiveTab] = useState<string>(() => {
    const tab = new URLSearchParams(window.location.search).get('tab');
    return ['overview', 'forum', 'proposals', 'constitution', 'library', 'meetings', 'members', 'about', 'merge'].includes(tab ?? '') ? tab! : 'overview';
  });
  useEffect(() => {
    const tab = new URLSearchParams(urlSearch).get('tab');
    setActiveTab(['overview', 'forum', 'proposals', 'constitution', 'library', 'meetings', 'members', 'about', 'merge'].includes(tab ?? '') ? tab! : 'overview');
  }, [communityId, urlSearch]);
  const [allCommunities, setAllCommunities] = useState<CommunityForMerge[]>([]);
  const [members, setMembers] = useState<CommunityMember[] | null>(null);
  const [membersHidden, setMembersHidden] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [roleUpdating, setRoleUpdating] = useState<Record<number, boolean>>({});
  const [targetCommunityId, setTargetCommunityId] = useState<number | null>(null);
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [mergeSuccess, setMergeSuccess] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [proposalView, setProposalView] = useState<'active' | 'all' | 'previous'>('active');
  const [pendingRequests, setPendingRequests] = useState<Array<{ id: number; userId: number; message: string | null; createdAt: string; user: { id: number; username: string; name: string | null; profilePicture: string | null } | null }>>([]);
  const [requestDeciding, setRequestDeciding] = useState<Record<number, boolean>>({});
  const [invites, setInvites] = useState<CommunityInvite[]>([]);
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [myInvite, setMyInvite] = useState<{ token: string } | null>(null);

  useEffect(() => {
    if (!communityId) return;
    let cancelled = false;
    setLoading(true);
    setSummary(null);
    setMembers(null);
    setShowArchived(false);
    setProposalView('active');
    Promise.all([
      api.get<CommunitySummary>(`/api/communities/${communityId}/summary`),
      api.get<CommunityForMerge[]>('/api/communities'),
    ]).then(([summaryResp, commResp]) => {
      if (cancelled) return;
      setSummary(summaryResp.data);
      setAllCommunities(commResp.data);
    }).catch(() => { if (!cancelled) setSummary(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [communityId]);

  type MembersResponse = { membersHidden: boolean; memberCount: number; members: CommunityMember[] };
  const refreshMembers = () =>
    api.get<MembersResponse>(`/api/communities/${communityId}/members`)
      .then((r) => {
        setMembers(r.data.members);
        setMembersHidden(r.data.membersHidden);
      })
      .catch(() => setMembers([]));

  useEffect(() => {
    if (!communityId) return;
    setMembersLoading(true);
    refreshMembers().finally(() => setMembersLoading(false));
  }, [communityId]);

  const isMember = !!user && (membership.status === 'member' || !!summary?.currentUserRole);
  const removals = useRemovalOverview(communityId, isMember);

  // Inline joins also refresh the dashboard's legacy state and hidden content.
  const refreshSummary = () => api.get<CommunitySummary>(`/api/communities/${communityId}/summary`).then((response) => setSummary(response.data));
  useEffect(() => {
    if (!communityId || membership.status !== 'member' || summary?.currentUserRole) return;
    void Promise.all([refreshSummary(), refreshMembers()]).catch(() => undefined);
  }, [communityId, membership.status, summary?.currentUserRole]);
  const canManageSettingsLive = !!summary?.canManageSettings;

  useEffect(() => {
    if (!communityId || !canManageSettingsLive) return;
    api.get<typeof pendingRequests>(`/api/communities/${communityId}/join-requests`)
      .then((r) => setPendingRequests(r.data))
      .catch(() => setPendingRequests([]));
  }, [communityId, canManageSettingsLive, members]);

  const decideJoinRequest = async (requestId: number, decision: 'approve' | 'reject') => {
    if (!communityId) return;
    setRequestDeciding((s) => ({ ...s, [requestId]: true }));
    setInviteError(null);
    try {
      await api.post(`/api/communities/${communityId}/join-requests/${requestId}/${decision}`, {});
      setPendingRequests((rows) => rows.filter((r) => r.id !== requestId));
      if (decision === 'approve') {
        await refreshMembers();
      }
    } catch {
      setInviteError(t('membership.failed'));
    } finally {
      setRequestDeciding((s) => ({ ...s, [requestId]: false }));
    }
  };

  const refreshInvites = () =>
    api.get<CommunityInvite[]>(`/api/communities/${communityId}/invites`)
      .then((r) => setInvites(r.data))
      .catch(() => setInvites([]));

  useEffect(() => {
    if (!communityId || !canManageSettingsLive) return;
    refreshInvites();
  }, [communityId, canManageSettingsLive, members]);

  // A targeted invitee may never open the notification, so the community page
  // itself offers the invitation waiting for them.
  useEffect(() => {
    if (!communityId || !user || isMember) { setMyInvite(null); return; }
    api.get<{ token: string } | null>(`/api/communities/${communityId}/my-invite`)
      .then((r) => setMyInvite(r.data))
      .catch(() => setMyInvite(null));
  }, [communityId, user?.id, isMember]);

  const createInvite = async (kind: 'user' | 'link') => {
    if (!communityId) return;
    setInviteBusy(true);
    setInviteError(null);
    try {
      const res = await api.post<CommunityInvite>(`/api/communities/${communityId}/invites`, {
        username: kind === 'user' ? inviteUsername.trim() : undefined,
        // A shareable link is worth little if it dies after one person; the
        // admin can still revoke it at any time.
        maxUses: kind === 'link' ? -1 : undefined,
        role: inviteRole,
        message: inviteMessage.trim() || undefined,
      });
      setInviteUsername('');
      setInviteMessage('');
      await refreshInvites();
      if (kind === 'link') {
        await copyInviteLink(res.data.token);
      }
    } catch (e: any) {
      setInviteError(e?.message || t('community.invite_failed') || 'Η πρόσκληση απέτυχε.');
    } finally {
      setInviteBusy(false);
    }
  };

  const copyInviteLink = async (token: string) => {
    const url = `${window.location.origin}/invite/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken((c) => (c === token ? null : c)), 2000);
    } catch {
      // Clipboard is blocked in some webviews — show the link so it can be
      // copied by hand rather than failing silently.
      window.prompt(t('community.invite_copy_manual') || 'Αντιγράψτε τον σύνδεσμο:', url);
    }
  };

  const revokeInvite = async (inviteId: number) => {
    if (!communityId) return;
    try {
      await api.delete(`/api/communities/${communityId}/invites/${inviteId}`);
      setInvites((rows) => rows.filter((r) => r.id !== inviteId));
    } catch (e: any) {
      setInviteError(e?.message || t('community.invite_revoke_failed') || 'Η ανάκληση απέτυχε.');
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

  const { community, proposals, memberCount, canManageSettings, currentUserRole } = summary;
  const activeStatuses = new Set<string>(ACTIVE_PROPOSAL_STATES);
  const activeProposals = proposals.filter((proposal) => activeStatuses.has(proposal.status));
  const visibleProposals = proposals.filter((proposal) =>
    (showArchived || proposal.status !== 'archived') &&
    (proposalView === 'all' || (proposalView === 'active' ? activeStatuses.has(proposal.status) : !activeStatuses.has(proposal.status))),
  );
  const changeTab = (tab: string) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  };

  async function handleLeave() {
    if (!communityId) return;
    if (!window.confirm(t('community.leave_confirm') || 'Να αποχωρήσετε από αυτή την κοινότητα;')) return;
    try {
      await api.delete(`/api/communities/${communityId}/members`);
      await queryClient.invalidateQueries({ queryKey: ['/api/communities'] });
      await Promise.all([refreshSummary(), refreshMembers()]);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to leave community');
    }
  }
  const metrics = getCommunityDashboardMetrics({ memberCount, proposals });
  const democracyScoreAvailable = hasDemocracyScore(community.democracyScore);
  const democracyScore = democracyScoreAvailable ? Number(community.democracyScore) : null;
  const governanceLabel = t(getGovernanceTranslationKey(community.type));
  const description = community.description?.trim();

  const adminCount = Array.isArray(community.adminIds) ? (community.adminIds as number[]).length : 0;

  // Both come from the server's summary rather than being re-derived here, so
  // the button and the route that refuses it can never disagree.
  const viewerCanPropose = !!summary?.viewerCanPropose;
  const proposalPolicy = summary?.proposalPolicy ?? 'all_members';

  const joinAction = !isMember ? <CommunityJoinAction communityId={community.id} onJoined={() => { void Promise.all([refreshSummary(), refreshMembers()]); }} className="w-full" /> : viewerCanPropose ? (
    <Button className="min-h-11 rounded-xl" onClick={() => setLocation(`/proposals/new?community=${communityId}`)}>
      <Plus className="mr-2 h-4 w-4" />{t('home.submitProposal')}
    </Button>
  ) : <p className="text-sm leading-relaxed text-ink-soft" data-testid="community-propose-restricted">{t(proposalPolicy === 'founder' ? 'community.proposeFounderOnly' : 'community.proposeAdminsOnly')}</p>;

  return (
    <AppShell breadcrumb={[{ label: t('nav.communities'), href: '/communities' }, { label: community.name }]}>
      <header className="mb-6 rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="w-16 shrink-0 sm:w-20"><Thumbnail src={mediaUrl(community.avatarPath || community.coverPath)} thumbnailKey={community.thumbnailKey} seed={`community-avatar-${community.id}`} subject="community" ratio="1:1" compact className="rounded-2xl" /></div>
          <div className="min-w-0 flex-1">
            <h1 className="break-words text-2xl font-semibold leading-tight text-ink sm:text-3xl">{community.name}</h1>
            <p className="mt-2 text-sm text-ink-soft">{t('community.memberSummary', { count: memberCount, active: activeProposals.length })}</p>
            <p className="mt-1 text-sm text-ink-faint">{governanceLabel}</p>
          </div>
        </div>
        {(community.tagline || description) && <p className="mt-4 max-w-prose text-base leading-relaxed text-ink-soft">{community.tagline || description}</p>}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {user && !isMember && myInvite ? <Button className="min-h-11 rounded-xl" onClick={() => setLocation(`/invite/${myInvite.token}`)} data-testid="community-accept-invite"><MailOpen className="mr-2 h-4 w-4" />{t('community.invite_accept')}</Button> : joinAction}
          {isMember && <Badge className="min-h-8 rounded-full bg-kyanos-wash text-kyanos" variant="secondary">{t('membership.member')}</Badge>}
          {user && (canManageSettings || isMember || community.type === 'autonomous') && <Button variant="outline" className="min-h-11 rounded-xl" onClick={() => setLocation(`/communities/${communityId}/settings`)}><Settings className="mr-2 h-4 w-4" />{t(community.type === 'autonomous' ? 'community.settings_vote_title' : 'community.settings_title')}</Button>}
          <ShareButton url={`/communities/${community.id}`} title={community.name} />
        </div>
      </header>
      <Tabs value={activeTab} onValueChange={changeTab}>
        <TabsList className="mb-5 flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1">
          <TabsTrigger className="min-h-11 rounded-lg px-4 text-sm" value="overview">{t('community.now')}</TabsTrigger>
          <TabsTrigger className="min-h-11 rounded-lg px-4 text-sm" value="forum">{t('community.tab_forum')}</TabsTrigger>
          <TabsTrigger className="min-h-11 rounded-lg px-4 text-sm" value="proposals">{t('community.tab_proposals')}</TabsTrigger>
          <TabsTrigger className="min-h-11 rounded-lg px-4 text-sm" value="library">{t('community.tab_library')}</TabsTrigger>
          <TabsTrigger className="min-h-11 rounded-lg px-4 text-sm" value="meetings">{t('community.liveAction')}</TabsTrigger>
          <TabsTrigger className="min-h-11 rounded-lg px-4 text-sm" value="members">{t('community.tab_members')}</TabsTrigger>
          <TabsTrigger className="min-h-11 rounded-lg px-4 text-sm" value="about">{t('community.aboutTitle')}</TabsTrigger>
          {(activeTab === 'constitution' || activeTab === 'merge') && <TabsTrigger className="min-h-11 rounded-lg px-4 text-sm" value={activeTab}>{t(activeTab === 'constitution' ? 'community.tab_constitution' : 'community.tab_merge')}</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {canManageSettings && pendingRequests.length > 0 && <button type="button" onClick={() => changeTab('members')} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-kyanos/25 bg-kyanos-wash p-4 text-left text-base font-medium text-kyanos"><span>{t('community.requestManagement', { count: pendingRequests.length })}</span><MailOpen className="h-5 w-5 shrink-0" /></button>}
          <section>
            <h2 className="text-xl font-semibold text-ink">{t('community.currentTopics')}</h2>
            <p className="mt-1 mb-4 text-base leading-relaxed text-ink-soft">{t('community.activeHelp')}</p>
            {(summary as any).contentHidden ? <div className="rounded-2xl border border-line bg-surface p-5"><p className="mb-4 text-base leading-relaxed text-ink-soft">{t('community.content_hidden_note')}</p><CommunityJoinAction communityId={community.id} onJoined={() => void refreshSummary()} /></div> : activeProposals.length ? <div className="space-y-3">{activeProposals.slice(0, 4).map((proposal) => <Link key={proposal.id} href={`/proposals/${proposal.id}`} className="block rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-kyanos/35"><div className="mb-2"><StatusBadge status={proposal.status} /></div><h3 className="text-lg font-semibold leading-snug text-ink">{proposal.question}</h3><p className="mt-2 text-sm text-ink-soft">{proposal.authorLabel} · {new Date(proposal.createdAt).toLocaleDateString()}</p></Link>)}<Button variant="outline" className="min-h-11 rounded-xl" onClick={() => { setProposalView('active'); changeTab('proposals'); }}>{t('community.viewActive')}</Button></div> : <p className="rounded-2xl border border-dashed border-line p-5 text-base leading-relaxed text-ink-soft">{t('community.noActive')}</p>}
          </section>
          <div className="grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => changeTab('forum')} className="flex min-h-14 items-center gap-3 rounded-xl border border-line bg-surface p-4 text-left text-base font-medium text-ink hover:bg-sunken"><Users className="h-5 w-5 text-kyanos" />{t('community.discussionsAction')}</button><button type="button" onClick={() => changeTab('library')} className="flex min-h-14 items-center gap-3 rounded-xl border border-line bg-surface p-4 text-left text-base font-medium text-ink hover:bg-sunken"><FileText className="h-5 w-5 text-kyanos" />{t('community.libraryAction')}</button></div>
          <CommunityRoomsSection communityId={community.id} viewerIsAdmin={canManageSettings} viewerIsMember={isMember} />
        </TabsContent>

        <TabsContent value="meetings" className="space-y-5">
          <CommunityRoomsSection communityId={community.id} viewerIsAdmin={canManageSettings} viewerIsMember={isMember} />
          <CommunityMeetingsRail communityId={community.id} />
        </TabsContent>

        <TabsContent value="about" className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2"><CommunityIdentityRail community={community as any} memberCount={memberCount} adminCount={adminCount} canEditAppearance={canManageSettings || !!user?.isAdmin || (community.type === 'autonomous' && isMember)} /><div><CommunityStatsRail memberCount={memberCount} proposalCount={metrics.proposalCount} activeCount={activeProposals.length} decidedCount={metrics.decidedProposalCount} democracyScore={democracyScore} /><CommunityTagsRail communityId={community.id} /></div></div>
          <div className="flex flex-wrap gap-2"><Button className="min-h-11 rounded-xl" variant="outline" onClick={() => changeTab('constitution')}>{t('community.tab_constitution')}</Button>{canManageSettings && <Button className="min-h-11 rounded-xl" variant="outline" onClick={() => changeTab('merge')}>{t('community.tab_merge')}</Button>}{isMember && currentUserRole !== 'founder' && <Button className="min-h-11 rounded-xl text-destructive" variant="outline" onClick={handleLeave} data-testid="community-leave"><LogOut className="mr-2 h-4 w-4" />{t('community.leave')}</Button>}</div>
          <CommunityDocumentsRail communityId={community.id} />
          <CommunityActivityRail communityId={community.id} />
        </TabsContent>

        <TabsContent value="forum">
          <CommunityForum
            communityId={parseInt(communityId!, 10)}
            isMember={isMember}
            canManage={!!canManageSettings}
          />
        </TabsContent>

        <TabsContent value="constitution">
          <CommunityConstitution communityId={parseInt(communityId!, 10)} />
        </TabsContent>

        <TabsContent value="library">
          <CommunityLibrary
            communityId={parseInt(communityId!, 10)}
            isMember={isMember || currentUserRole != null}
            canManage={!!canManageSettings}
            contentHidden={!!(summary as any).contentHidden}
          />
        </TabsContent>
        
        <TabsContent value="proposals">
          <Card>
            <CardHeader>
              <CardTitle>{t('community.tab_proposals')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-5 flex flex-wrap gap-2" aria-label={t('community.tab_proposals')}>
                {(['active', 'all', 'previous'] as const).map((view) => <button key={view} type="button" aria-pressed={proposalView === view} onClick={() => setProposalView(view)} className={`min-h-11 rounded-xl px-4 text-sm font-medium ${proposalView === view ? 'bg-kyanos text-white' : 'border border-line text-ink-soft hover:bg-sunken'}`}>{t(view === 'active' ? 'community.currentTopics' : view === 'all' ? 'community.allTopics' : 'community.previousTopics')}</button>)}
              </div>
              {proposalView !== 'active' && !showArchived && proposals.some((proposal) => proposal.status === 'archived') && <button type="button" onClick={() => setShowArchived(true)} className="mb-4 min-h-11 rounded-xl border border-line px-4 text-sm font-medium text-ink-soft" data-testid="show-archived-proposals">{t('community.show_archived')} ({proposals.filter((proposal) => proposal.status === 'archived').length})</button>}
              {(summary as any).contentHidden ? (
                <p className="text-muted-foreground">
                  {t('community.content_hidden_note') || 'Το περιεχόμενο αυτής της κοινότητας είναι ορατό μόνο στα μέλη της. Γίνετε μέλος για να δείτε τις προτάσεις και τις συζητήσεις.'}
                </p>
              ) : visibleProposals.length === 0 ? (
                <p className="text-muted-foreground">{t('community.no_proposals')}</p>
              ) : (
                <div className="space-y-2">
                  {visibleProposals.map((proposal) => (
                    <div
                      key={proposal.id}
                      role="link"
                      tabIndex={0}
                      onClick={() => setLocation(`/proposals/${proposal.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setLocation(`/proposals/${proposal.id}`);
                        }
                      }}
                      className="flex flex-col items-start justify-between gap-3 rounded-xl border border-line p-4 cursor-pointer hover:bg-sunken focus:outline-none focus:ring-2 focus:ring-ring sm:flex-row sm:items-center"
                      data-testid={`community-proposal-${proposal.id}`}
                    >
                      <div>
                        <div className="text-lg font-semibold leading-snug">{proposal.question}</div>
                        <div className="text-sm text-muted-foreground">
                          {t(`proposal.kind_${proposal.kind || 'decision'}`)} · 
                          {t('common.by')} {proposal.authorLabel} · {new Date(proposal.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <StatusBadge status={proposal.status} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="members">
          {isMember && (
            <div className="mb-4">
              <RemovalPanel
                communityId={community.id}
                overview={removals.data}
                canLift={canManageSettings && removalModeFor(community.type) === 'admin'}
                onChange={() => { refreshMembers(); removals.reload(); }}
              />
            </div>
          )}
          {canManageSettings && (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle>{t('community.invites_title') || 'Προσκλήσεις'}</CardTitle>
                <CardDescription>
                  {t('community.invites_help') || 'Πρόσκληση συγκεκριμένου χρήστη (λαμβάνει ειδοποίηση) ή σύνδεσμος που μπορείς να μοιραστείς.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <Input
                    value={inviteUsername}
                    onChange={(e) => setInviteUsername(e.target.value)}
                    placeholder={t('community.invite_username_placeholder') || 'όνομα χρήστη'}
                    className="sm:max-w-[220px]"
                    data-testid="invite-username"
                  />
                  <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as 'member' | 'admin')}>
                    <SelectTrigger className="sm:max-w-[180px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">{t('community.role.member') || 'Μέλος'}</SelectItem>
                      <SelectItem value="admin">{t('community.role.admin') || 'Διαχειριστής'}</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={inviteBusy || !inviteUsername.trim()}
                      onClick={() => createInvite('user')}
                      data-testid="invite-user"
                    >
                      <MailOpen className="w-4 h-4 mr-2" />
                      {t('community.invite_send') || 'Πρόσκληση'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={inviteBusy}
                      onClick={() => createInvite('link')}
                      data-testid="invite-link"
                    >
                      <Link2 className="w-4 h-4 mr-2" />
                      {t('community.invite_create_link') || 'Σύνδεσμος'}
                    </Button>
                  </div>
                </div>
                <Textarea
                  value={inviteMessage}
                  onChange={(e) => setInviteMessage(e.target.value)}
                  placeholder={t('community.invite_message_placeholder') || 'Προαιρετικό μήνυμα προς τον προσκεκλημένο'}
                  rows={2}
                />
                {inviteError && <p className="text-sm text-destructive" data-testid="invite-error">{inviteError}</p>}

                {invites.length > 0 && (
                  <ul className="divide-y border-t pt-1">
                    {invites.map((i) => (
                      <li key={i.id} className="flex flex-wrap items-center gap-2 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">
                            {i.invitedUser
                              ? (i.invitedUser.name || `@${i.invitedUser.username}`)
                              : (t('community.invite_link_row') || 'Σύνδεσμος πρόσκλησης')}
                            {i.role === 'admin' && (
                              <Badge variant="secondary" className="ml-2">{t('community.role.admin') || 'Διαχειριστής'}</Badge>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {i.maxUses === -1
                              ? `${i.useCount} ${t('community.invite_uses') || 'χρήσεις'}`
                              : `${i.useCount}/${i.maxUses}`}
                            {i.expiresAt ? ` · ${t('community.invite_until') || 'έως'} ${new Date(i.expiresAt).toLocaleDateString()}` : ''}
                          </p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => copyInviteLink(i.token)}>
                          <Copy className="w-4 h-4 mr-2" />
                          {copiedToken === i.token
                            ? (t('community.invite_copied') || 'Αντιγράφηκε')
                            : (t('community.invite_copy') || 'Αντιγραφή')}
                        </Button>
                        <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50" onClick={() => revokeInvite(i.id)}>
                          <X className="w-4 h-4 mr-1" />
                          {t('community.invite_revoke') || 'Ανάκληση'}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
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
              {!membersLoading && membersHidden && (
                <p className="mb-3 text-sm text-muted-foreground border rounded-md p-3">
                  {t('community.members_hidden_note') || 'Ο κατάλογος μελών είναι ορατός μόνο στα μέλη της κοινότητας. Ο ιδρυτής και οι διαχειριστές εμφανίζονται πάντα δημόσια.'}
                </p>
              )}
              {!membersLoading && members && members.length === 0 && !membersHidden && (
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
                      {(() => {
                        if (!user || !isMember || m.userId === user.id || m.role === 'founder') return null;
                        const mode = removalModeFor(community.type);
                        if (mode === 'admin' && !(canManageSettings && (m.role !== 'admin' || currentUserRole === 'founder'))) return null;
                        if (removals.data?.votes.some((v) => v.status === 'open' && v.target?.id === m.userId)) {
                          return <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300">{t('removal.vote_open_badge')}</Badge>;
                        }
                        return (
                          <RemoveMemberButton
                            communityId={community.id}
                            member={m}
                            mode={mode}
                            onDone={() => { refreshMembers(); removals.reload(); }}
                          />
                        );
                      })()}
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
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <select
                      value={targetCommunityId || ''}
                      onChange={(e) => setTargetCommunityId(parseInt(e.target.value))}
                      className="border rounded px-3 py-2 text-sm flex-1 min-w-0"
                      aria-label={t('community.select_target')}
                    >
                      <option value="">{t('community.choose_community')}</option>
                      {allCommunities
                        .filter(c => c.id !== community.id && !c.mergedInto)
                        .map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                    <Button
                      onClick={handleMerge}
                      disabled={!targetCommunityId || merging}
                      className="shrink-0"
                    >
                      {merging ? t('common.loading') : t('community.merge_button')}
                    </Button>
                  </div>
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
