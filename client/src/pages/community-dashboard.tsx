/**
 * Community Dashboard Page
 * 
 * Displays community overview, active proposals, sortition bodies,
 * democracy score, and merge controls.
 */

import { useState, useEffect } from 'react';
import { useLocation, useParams } from 'wouter';
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
import { useTranslation, getStatusLabel } from '@/hooks/use-translation';
import { CommunityLibrary } from '@/components/community/CommunityLibrary';
import { CommunityConstitution } from '@/components/community/CommunityConstitution';
import { CommunityForum } from '@/components/community/CommunityForum';
import ShareButton from '@/components/ShareButton';
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

  const [summary, setSummary] = useState<CommunitySummary | null>(null);
  const [loading, setLoading] = useState(true);
  // Honor ?tab=… so shared links (e.g. conference invites) land on the right tab
  const [activeTab, setActiveTab] = useState<string>(() => {
    const tab = new URLSearchParams(window.location.search).get('tab');
    return ['forum', 'proposals', 'constitution', 'library', 'members', 'merge'].includes(tab ?? '') ? tab! : 'forum';
  });
  const [allCommunities, setAllCommunities] = useState<CommunityForMerge[]>([]);
  const [members, setMembers] = useState<CommunityMember[] | null>(null);
  const [membersHidden, setMembersHidden] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [roleUpdating, setRoleUpdating] = useState<Record<number, boolean>>({});
  const [targetCommunityId, setTargetCommunityId] = useState<number | null>(null);
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [mergeSuccess, setMergeSuccess] = useState(false);
  const [joinState, setJoinState] = useState<'idle' | 'submitting' | 'pending'>('idle');
  const [showArchived, setShowArchived] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
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

    Promise.all([
      api.get<CommunitySummary>(`/api/communities/${communityId}/summary`),
      api.get<CommunityForMerge[]>('/api/communities'),
    ]).then(([summaryResp, commResp]) => {
      setSummary(summaryResp.data);
      setAllCommunities(commResp.data);
    }).catch(() => setSummary(null))
      .finally(() => setLoading(false));
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
        await refreshMembers();
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
        await refreshMembers();
      }
    } catch {
      // surface inline failure on the row if needed; keep silent for now
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

  async function handleLeave() {
    if (!communityId) return;
    if (!window.confirm(t('community.leave_confirm') || 'Να αποχωρήσετε από αυτή την κοινότητα;')) return;
    try {
      await api.delete(`/api/communities/${communityId}/members`);
      window.location.reload();
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

  // The join control lives with the page (it owns joinState), but the comps
  // put it at the foot of the identity card, so it is handed to the rail.
  const joinAction = user && !isMember && community.joinPolicy !== 'invite_only' && joinState !== 'pending' ? (
    <Button size="sm" className="w-full" disabled={joinState === 'submitting'} onClick={applyToJoin}>
      {community.joinPolicy === 'approval'
        ? (t('community.apply_to_join') || 'Apply to join')
        : (t('community.join') || 'Join')}
    </Button>
  ) : user && isMember && viewerCanPropose ? (
    <Button size="sm" className="w-full" onClick={() => setLocation(`/proposals/new?community=${communityId}`)}>
      <Plus className="w-4 h-4 mr-2" />
      {t('home.submitProposal')}
    </Button>
  ) : user && isMember ? (
    // A member who cannot propose is still a full member: the forum, the
    // debate and the ballot are all open to them. Saying who may propose,
    // rather than showing nothing, keeps that legible instead of looking
    // like a page that failed to load a button.
    <p className="text-xs leading-relaxed text-ink-faint" data-testid="community-propose-restricted">
      {proposalPolicy === 'founder'
        ? t('community.proposeFounderOnly')
        : t('community.proposeAdminsOnly')}
    </p>
  ) : undefined;

  return (
    <AppShell
      breadcrumb={[{ label: t('nav.communities'), href: '/communities' }, { label: community.name }]}
      leftRail={
        <>
          <CommunityIdentityRail
            community={community as any}
            memberCount={memberCount}
            adminCount={adminCount}
            joinAction={joinAction}
            canEditAppearance={
              // Mirrors canEditAppearance in server/routers/discovery.ts.
              canManageSettings || !!user?.isAdmin || (community.type === 'autonomous' && isMember)
            }
          />
          <CommunityStatsRail
            memberCount={memberCount}
            proposalCount={metrics.proposalCount}
            activeCount={metrics.activeProposalCount}
            decidedCount={metrics.decidedProposalCount}
            democracyScore={democracyScore}
          />
          <CommunityMeetingsRail communityId={community.id} />
        </>
      }
      rightRail={
        <>
          <CommunityActivityRail communityId={community.id} />
          <CommunityDocumentsRail communityId={community.id} />
          <CommunityTagsRail communityId={community.id} />
        </>
      }
    >
      {/* ── Community banner ──
          Comp 4 fills this with "ΚΕΝΤΡΙΚΟ BANNER ΚΟΙΝΟΤΗΤΑΣ + TAGLINE"; the
          real thing carries the community's own name and tagline. */}
      <section className="mb-5 rounded-sm border border-line bg-ink px-6 py-12 text-center sm:px-10 sm:py-16">
        <h1 className="font-serif text-3xl leading-tight text-paper sm:text-4xl">{community.name}</h1>
        {(community.tagline || description) && (
          <p className="mx-auto mt-3 max-w-[52ch] text-sm leading-relaxed text-bc-ink-soft">
            {community.tagline || description}
          </p>
        )}
      </section>

      {/* The name, description, join button and share now live in the identity
          rail and the banner; what stays here is the governance state and the
          controls that only make sense next to the community's own content. */}
      {/* A slim bar, not a card: governance state and the membership controls.
          The numbers that used to sit here are in the side rail — they are
          reference, and having them first pushed the forum and the calls,
          which are what people actually come for, below the fold. */}
      <div className="mb-5 flex flex-wrap items-center gap-2 border-b border-line pb-4">
        <Badge variant="secondary">{governanceLabel}</Badge>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {user && !isMember && myInvite && (
            <Button size="sm" onClick={() => setLocation(`/invite/${myInvite.token}`)} data-testid="community-accept-invite">
              <MailOpen className="w-4 h-4 mr-2" />
              {t('community.invite_accept') || 'Αποδοχή πρόσκλησης'}
            </Button>
          )}
          {user && !isMember && !myInvite && community.joinPolicy === 'invite_only' && (
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
          {/* Founders can't leave — they'd orphan the community. */}
          {user && isMember && currentUserRole !== 'founder' && (
            <Button
              size="sm"
              variant="outline"
              className="text-red-600 hover:bg-red-50"
              onClick={handleLeave}
              data-testid="community-leave"
            >
              <LogOut className="w-4 h-4 mr-2" />
              {t('community.leave') || 'Αποχώρηση'}
            </Button>
          )}
        </div>
      </div>

      <CommunityRoomsSection
        communityId={community.id}
        viewerIsAdmin={canManageSettings}
        viewerIsMember={isMember}
      />
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        {/* The comps show eight tabs on a wide screen; five already overflow a
            375px phone, so the bar scrolls sideways instead of pushing the
            page wider than the viewport. */}
        <TabsList className="flex w-full justify-start overflow-x-auto">
          <TabsTrigger value="forum">{t('community.tab_forum')}</TabsTrigger>
          <TabsTrigger value="proposals">{t('community.tab_proposals')}</TabsTrigger>
          <TabsTrigger value="constitution">{t('community.tab_constitution')}</TabsTrigger>
          <TabsTrigger value="library">{t('community.tab_library')}</TabsTrigger>
          <TabsTrigger value="members">{t('community.tab_members')}</TabsTrigger>
          <TabsTrigger value="merge">{t('community.tab_merge')}</TabsTrigger>
        </TabsList>

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
              {(summary as any).contentHidden ? (
                <p className="text-muted-foreground">
                  {t('community.content_hidden_note') || 'Το περιεχόμενο αυτής της κοινότητας είναι ορατό μόνο στα μέλη της. Γίνετε μέλος για να δείτε τις προτάσεις και τις συζητήσεις.'}
                </p>
              ) : proposals.length === 0 ? (
                <p className="text-muted-foreground">{t('community.no_proposals')}</p>
              ) : (
                <div className="space-y-2">
                  {(showArchived ? proposals : proposals.filter((p) => p.status !== 'archived')).map((proposal) => (
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
                      className="flex items-center justify-between gap-3 p-3 border rounded cursor-pointer hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
                      data-testid={`community-proposal-${proposal.id}`}
                    >
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
                  {!showArchived && proposals.some((p) => p.status === 'archived') && (
                    <button
                      type="button"
                      className="text-sm text-muted-foreground underline-offset-2 hover:underline"
                      onClick={() => setShowArchived(true)}
                      data-testid="show-archived-proposals"
                    >
                      {(t('community.show_archived') || 'Εμφάνιση αρχειοθετημένων')} ({proposals.filter((p) => p.status === 'archived').length})
                    </button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="members">
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
