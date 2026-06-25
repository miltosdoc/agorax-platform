/**
 * Community Settings Page
 *
 * Low-cost, high-leverage admin screen: exposes the community parametrization
 * contract already enforced by the backend without introducing a new design
 * system or expensive custom UI.
 */

import { useEffect, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import AppShell from '@/components/layout/AppShell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Save, Settings } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import type { Community } from '@shared/schema';
import type { CommunityGovernanceModel, CommunityJoinPolicy, CommunitySortitionMode, CommunityType } from '@shared/community-settings';
import { AutonomousSettingsView } from './community-settings-autonomous';
import { useAuth } from '@/hooks/use-auth';

interface CommunitySettingsForm {
  name: string;
  description: string;
  type: CommunityType;
  governanceModel: CommunityGovernanceModel;
  maxConcurrentVotes: number;
  minParticipationPct: string;
  sortitionSize: number;
  sortitionMode: CommunitySortitionMode;
  sortitionResponseHours: number;
  amendmentThreshold: string;
  amendmentInclusionThreshold: string;
  maxAmendmentsPerProposal: number;
  requireGovgrVerification: boolean;
  joinPolicy: CommunityJoinPolicy;
  authorReviewHours: number;
  communitySignalHours: number;
  votingHours: number;
}

function toForm(community: Community): CommunitySettingsForm {
  return {
    name: community.name ?? '',
    description: community.description ?? '',
    type: (community.type as CommunityType) || 'autonomous',
    governanceModel: (community.governanceModel as CommunityGovernanceModel) || 'no_admin',
    maxConcurrentVotes: community.maxConcurrentVotes ?? -1,
    minParticipationPct: String(community.minParticipationPct ?? '0'),
    sortitionSize: community.sortitionSize ?? 12,
    sortitionMode: (community.sortitionMode as CommunitySortitionMode) || 'absolute',
    sortitionResponseHours: community.sortitionResponseHours ?? 72,
    amendmentThreshold: String(community.amendmentThreshold ?? '0.5'),
    amendmentInclusionThreshold: String((community as any).amendmentInclusionThreshold ?? '1'),
    maxAmendmentsPerProposal: community.maxAmendmentsPerProposal ?? -1,
    requireGovgrVerification: community.requireGovgrVerification ?? false,
    joinPolicy: ((community as any).joinPolicy as CommunityJoinPolicy) || 'open',
    authorReviewHours: (community as any).authorReviewHours ?? 72,
    communitySignalHours: (community as any).communitySignalHours ?? 48,
    votingHours: (community as any).votingHours ?? 168,
  };
}

export default function CommunitySettingsPage() {
  const params = useParams();
  const communityId = params.id;
  const [, navigate] = useLocation();
  const { t } = useTranslation();
  const { toast } = useToast();

  const { user } = useAuth();
  const [form, setForm] = useState<CommunitySettingsForm | null>(null);
  const [community, setCommunity] = useState<Community | null>(null);
  const [isMember, setIsMember] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!communityId) return;

    Promise.all([
      api.get<Community>(`/api/communities/${communityId}`),
      api.get<Array<{ userId: number; role: string }>>(`/api/communities/${communityId}/members`).catch(() => ({ data: [] as Array<{ userId: number; role: string }> })),
    ])
      .then(([communityResp, membersResp]) => {
        setCommunity(communityResp.data);
        setForm(toForm(communityResp.data));
        if (user) {
          const me = membersResp.data.find((m) => m.userId === user.id);
          setIsMember(!!me);
          setCanEdit(me?.role === 'admin' || me?.role === 'founder');
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('community.settings_load_error')))
      .finally(() => setLoading(false));
  }, [communityId, t, user]);

  function update<K extends keyof CommunitySettingsForm>(key: K, value: CommunitySettingsForm[K]) {
    setForm((current) => current ? { ...current, [key]: value } : current);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!communityId || !form) return;

    setSaving(true);
    setError(null);

    try {
      const payload = {
        ...form,
        minParticipationPct: form.minParticipationPct.trim(),
        amendmentThreshold: form.amendmentThreshold.trim(),
        amendmentInclusionThreshold: form.amendmentInclusionThreshold.trim(),
      };

      const resp = await api.patch<Community>(`/api/communities/${communityId}`, payload);
      setForm(toForm(resp.data));
      toast({ title: t('community.settings_saved'), description: t('community.settings_saved_description') });
    } catch (err) {
      const message = err instanceof ApiError || err instanceof Error
        ? err.message
        : t('community.settings_save_error');
      setError(message);
      toast({ title: t('community.settings_save_error'), description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell breadcrumb={[{ label: t('nav.communities'), href: '/communities' }, { label: t('community.settings_title') }]}>
      <Button variant="ghost" className="mb-4" onClick={() => navigate(`/communities/${communityId}`)}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        {t('common.back')}
      </Button>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              {t('community.settings_title')}
            </CardTitle>
            <CardDescription>{t('community.settings_description')}</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-8 text-center text-muted-foreground">{t('common.loading')}</div>
            ) : !form || !community ? (
              <div className="py-8 text-center text-muted-foreground">{t('community.not_found')}</div>
            ) : community.type === 'autonomous' && communityId ? (
              <AutonomousSettingsView communityId={communityId} isMember={isMember} />
            ) : (
              <form onSubmit={handleSubmit} className="space-y-8">
                {!canEdit && (
                  <div className="rounded-md border border-amber-300/40 bg-amber-50/40 p-3 text-sm">
                    {t('community.settings_read_only') || 'Read-only view — only admins and the founder can change settings here.'}
                  </div>
                )}
                <fieldset disabled={!canEdit} className="space-y-8">
                <section className="space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold">{t('community.settings_identity')}</h2>
                    <p className="text-sm text-muted-foreground">{t('community.settings_identity_help')}</p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="name">{t('community.name_label')}</Label>
                      <Input id="name" value={form.name} onChange={(e) => update('name', e.target.value)} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="type">{t('community.type_label')}</Label>
                      <Select value={form.type} onValueChange={(value) => update('type', value as CommunityType)}>
                        <SelectTrigger id="type"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="autonomous">{t('community.type_autonomous')}</SelectItem>
                          <SelectItem value="managed">{t('community.type_managed')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">{t('community.description_label')}</Label>
                    <Textarea id="description" value={form.description} rows={3} onChange={(e) => update('description', e.target.value)} />
                  </div>
                </section>

                <section className="space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold">{t('community.settings_governance')}</h2>
                    <p className="text-sm text-muted-foreground">{t('community.settings_governance_help')}</p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="governanceModel">{t('community.governance_label')}</Label>
                      <Select value={form.governanceModel} onValueChange={(value) => update('governanceModel', value as CommunityGovernanceModel)}>
                        <SelectTrigger id="governanceModel"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="no_admin">{t('community.governance_no_admin')}</SelectItem>
                          <SelectItem value="admin_team">{t('community.governance_admin_team')}</SelectItem>
                          <SelectItem value="hybrid">{t('community.governance_hybrid')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="maxConcurrentVotes">{t('community.max_concurrent_votes')}</Label>
                      <Input id="maxConcurrentVotes" type="number" value={form.maxConcurrentVotes} onChange={(e) => update('maxConcurrentVotes', Number(e.target.value))} />
                      <p className="text-xs text-muted-foreground">{t('community.unlimited_hint')}</p>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="minParticipationPct">{t('community.min_participation_pct')}</Label>
                      <Input id="minParticipationPct" type="number" min="0" max="100" value={form.minParticipationPct} onChange={(e) => update('minParticipationPct', e.target.value)} />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-1">
                        <Label htmlFor="requireGovgrVerification">{t('community.require_govgr')}</Label>
                        <p className="text-xs text-muted-foreground">{t('community.require_govgr_help')}</p>
                      </div>
                      <Switch id="requireGovgrVerification" checked={form.requireGovgrVerification} onCheckedChange={(checked) => update('requireGovgrVerification', checked)} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="joinPolicy">{t('community.join_policy_label') || 'Join policy'}</Label>
                    <Select value={form.joinPolicy} onValueChange={(value) => update('joinPolicy', value as CommunityJoinPolicy)}>
                      <SelectTrigger id="joinPolicy"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">{t('community.join_policy_open') || 'Open — anyone can join'}</SelectItem>
                        <SelectItem value="approval">{t('community.join_policy_approval') || 'Approval — admins approve each request'}</SelectItem>
                        <SelectItem value="invite_only">{t('community.join_policy_invite_only') || 'Invite-only — no public applications'}</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">{t('community.join_policy_help') || 'How prospective members get into the community.'}</p>
                  </div>
                </section>

                <section className="space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold">{t('community.settings_deliberation')}</h2>
                    <p className="text-sm text-muted-foreground">{t('community.settings_deliberation_help')}</p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="amendmentThreshold">{t('community.amendment_threshold')}</Label>
                      <Input id="amendmentThreshold" type="number" min="0" max="1" step="0.05" value={form.amendmentThreshold} onChange={(e) => update('amendmentThreshold', e.target.value)} />
                      <p className="text-xs text-muted-foreground">{t('community.amendment_threshold_help')}</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="maxAmendmentsPerProposal">{t('community.max_amendments')}</Label>
                      <Input id="maxAmendmentsPerProposal" type="number" value={form.maxAmendmentsPerProposal} onChange={(e) => update('maxAmendmentsPerProposal', Number(e.target.value))} />
                      <p className="text-xs text-muted-foreground">{t('community.unlimited_hint')}</p>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="amendmentInclusionThreshold">{t('community.amendment_inclusion_threshold') || 'Όριο συμπερίληψης βάσει δημοφιλίας'}</Label>
                      <Input id="amendmentInclusionThreshold" type="number" min="0" max="1" step="0.05" value={form.amendmentInclusionThreshold} onChange={(e) => update('amendmentInclusionThreshold', e.target.value)} />
                      <p className="text-xs text-muted-foreground">{t('community.amendment_inclusion_threshold_help') || 'Όριο δημοφιλίας (0–1) πάνω από το οποίο μια τροπολογία εντάσσεται στο τελικό κείμενο ακόμη και χωρίς ρητή αποδοχή από τον συγγραφέα. Το 1 σημαίνει "μόνο όσες αποδέχτηκε ο συγγραφέας".'}</p>
                    </div>
                  </div>
                </section>

                <section className="space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold">{t('community.settings_sortition')}</h2>
                    <p className="text-sm text-muted-foreground">{t('community.settings_sortition_help')}</p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="sortitionSize">{t('community.sortition_size')}</Label>
                      <Input id="sortitionSize" type="number" min="3" max="500" value={form.sortitionSize} onChange={(e) => update('sortitionSize', Number(e.target.value))} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sortitionMode">{t('community.sortition_mode')}</Label>
                      <Select value={form.sortitionMode} onValueChange={(value) => update('sortitionMode', value as CommunitySortitionMode)}>
                        <SelectTrigger id="sortitionMode"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="absolute">{t('community.sortition_mode_absolute')}</SelectItem>
                          <SelectItem value="percentage">{t('community.sortition_mode_percentage')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sortitionResponseHours">{t('community.sortition_response_hours')}</Label>
                      <Input id="sortitionResponseHours" type="number" min="1" max="720" value={form.sortitionResponseHours} onChange={(e) => update('sortitionResponseHours', Number(e.target.value))} />
                    </div>
                  </div>
                </section>

                <section className="space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold">Χρονικά όρια φάσεων</h2>
                    <p className="text-sm text-muted-foreground">
                      Ορίστε πόσες ώρες διαρκεί κάθε φάση πριν από την αυτόματη μετάβαση στην επόμενη. Η τιμή 0 σημαίνει χωρίς χρονικό όριο.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="authorReviewHours">Αξιολόγηση συγγραφέα (ώρες)</Label>
                      <Input
                        id="authorReviewHours"
                        type="number"
                        min="0"
                        max="8760"
                        value={form.authorReviewHours}
                        onChange={(e) => update('authorReviewHours', Number(e.target.value))}
                      />
                      <p className="text-xs text-muted-foreground">Προεπιλογή: 72 ώρες (3 ημέρες). 0 = χωρίς όριο.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="communitySignalHours">Κοινοτικό σήμα (ώρες)</Label>
                      <Input
                        id="communitySignalHours"
                        type="number"
                        min="0"
                        max="8760"
                        value={form.communitySignalHours}
                        onChange={(e) => update('communitySignalHours', Number(e.target.value))}
                      />
                      <p className="text-xs text-muted-foreground">Προεπιλογή: 48 ώρες (2 ημέρες). 0 = χωρίς όριο.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="votingHours">Ψηφοφορία (ώρες)</Label>
                      <Input
                        id="votingHours"
                        type="number"
                        min="0"
                        max="8760"
                        value={form.votingHours}
                        onChange={(e) => update('votingHours', Number(e.target.value))}
                      />
                      <p className="text-xs text-muted-foreground">Προεπιλογή: 168 ώρες (7 ημέρες). 0 = χωρίς όριο.</p>
                    </div>
                  </div>
                </section>

                </fieldset>

                {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button type="button" variant="outline" onClick={() => navigate(`/communities/${communityId}`)}>
                    {t('common.cancel')}
                  </Button>
                  <Button type="submit" disabled={saving || !form.name.trim() || !canEdit}>
                    <Save className="w-4 h-4 mr-2" />
                    {saving ? t('community.settings_saving') : t('community.settings_save')}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
    </AppShell>
  );
}
