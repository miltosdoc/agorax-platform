/**
 * Proposal Form Component
 *
 * Creates — or edits the draft of — anything a community votes on. The first
 * choice is *what* is being voted: a decision, the statute, an election or a
 * poll. The rest of the form follows from it: the labels, whether the options
 * are candidates or answers, whether a description is required at all.
 *
 * Direct vote is the default track. Members found deliberation heavy as the
 * starting point and most votes do not need it, so it is one switch away
 * under «Περισσότερες ρυθμίσεις» (for a decision or a statute — an election
 * or a poll has no text to amend). Everything the author does not have to
 * decide — picture, category, deliberation — lives there too, so the visible
 * form is only what every vote needs.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertCircle, BarChart3, ChevronDown, FileText, Loader2, Paperclip, Plus,
  ScrollText, Sparkles, UserCheck, Vote, X,
} from 'lucide-react';
import { useLocation } from 'wouter';
import { ThumbnailPicker } from "@/components/thumbnails/Thumbnail";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useTranslation } from '@/hooks/use-translation';
import { apiRequest } from '@/lib/queryClient';
import { api, ApiError } from '@/lib/api';
import { uploadProposalFile, DOCUMENT_ACCEPT, DOCUMENT_MAX_BYTES } from '@/lib/upload-media';
import {
  PROPOSAL_KINDS, kindAllowsDeliberation, kindRequiresOptions, kindRequiresText,
  proposalKindOf, refusalOptionLabel, type ProposalKind,
} from '@shared/proposal-kinds';

interface ProposalFormProps {
  communityId?: number;  // Optional for demo mode
  editProposalId?: number;  // When set, edit an existing draft instead of creating
  // The community forum topic this proposal is being made from. The form
  // fetches the topic and its whole discussion and fills itself with them —
  // a starting point, not a commitment: the author still chooses the kind
  // and the durations, and can rewrite every word before saving. The topic
  // is linked back to the proposal once it exists.
  fromPostId?: number;
}

interface MemberCommunity {
  id: number;
  name: string;
  isGeneral?: boolean;
  // Bounds the community sets on the durations an author may choose.
  deliberationMinHours?: number | null;
  deliberationMaxHours?: number | null;
  votingMinHours?: number | null;
  votingMaxHours?: number | null;
  communitySignalHours?: number | null;
  /** False when this community reserves proposal-writing for its admins or founder. */
  viewerCanPropose?: boolean;
}

const KIND_ICONS: Record<ProposalKind, LucideIcon> = {
  decision: Vote,
  statute: ScrollText,
  election: UserCheck,
  poll: BarChart3,
};

// The lengths people actually ask for. Anything else is one click away.
const VOTING_PRESETS = [24, 72, 168, 336];
const DELIBERATION_PRESETS = [48, 72, 168];

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function ProposalForm({ communityId, editProposalId, fromPostId }: ProposalFormProps) {
  const [, setLocation] = useLocation();
  const { t, locale } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memberCommunities, setMemberCommunities] = useState<MemberCommunity[]>([]);
  const [communitiesLoading, setCommunitiesLoading] = useState(true);
  const [selectedCommunityId, setSelectedCommunityId] = useState<number | null>(communityId ?? null);

  useEffect(() => {
    fetch('/api/communities', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load communities'))))
      .then((list: MemberCommunity[]) => {
        // Only communities that would actually accept the proposal. Offering
        // one that refuses on submit wastes everything the author wrote; the
        // server still re-checks, this just keeps the picker honest.
        // Older responses without the flag are treated as open, so a stale
        // client degrades to the previous behaviour rather than an empty list.
        const eligible = list.filter((c) => c.viewerCanPropose !== false);
        setMemberCommunities(eligible);
        if (!communityId) {
          const general = eligible.find((c) => c.isGeneral);
          setSelectedCommunityId((prev) => prev ?? general?.id ?? eligible[0]?.id ?? null);
        }
      })
      .catch(() => setMemberCommunities([]))
      .finally(() => setCommunitiesLoading(false));
  }, [communityId]);

  const targetCommunityId = communityId ?? selectedCommunityId;
  // A draft stays in the community it was filed in, so editing shows the
  // name rather than a picker whose choice would be silently ignored.
  const lockedCommunity = communityId || editProposalId
    ? memberCommunities.find((c) => c.id === targetCommunityId)
    : null;
  // Duration bounds come from the community the proposal is being filed in.
  // The server re-checks them; these only keep the picker honest.
  const targetCommunity = memberCommunities.find((c) => c.id === targetCommunityId);
  const deliberationMin = targetCommunity?.deliberationMinHours ?? 24;
  const deliberationMax = targetCommunity?.deliberationMaxHours ?? 336;
  const votingMin = targetCommunity?.votingMinHours ?? 24;
  const votingMax = targetCommunity?.votingMaxHours ?? 720;
  const [formData, setFormData] = useState({
    question: '',
    solution: '',
    category: '',
  });
  // How much of the discussion made it into the draft, so the author is told
  // rather than left to wonder why a long thread came in shorter.
  const [draftNote, setDraftNote] = useState<string | null>(null);

  // AI-assisted drafting (same UX as the poll compiler): describe the idea
  // in plain language, the LLM fills the fields below, the author edits.
  const [aiIntent, setAiIntent] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiFilled, setAiFilled] = useState(false);

  // What is being voted. Chosen at creation; a draft keeps its kind.
  const [kind, setKind] = useState<ProposalKind>('decision');
  // Deliberation is opt-in. The track follows from the switch *and* the
  // kind, so switching to an election can never leave a deliberation track
  // behind that the server would refuse.
  const [deliberate, setDeliberate] = useState(false);
  const [editTrack, setEditTrack] = useState<'deliberation' | 'vote' | null>(null);
  const track: 'deliberation' | 'vote' = editTrack
    ?? (deliberate && kindAllowsDeliberation(kind) ? 'deliberation' : 'vote');

  // Yes/no or the author's own options. An election always has options (its
  // candidates); a poll starts with them because most polls are a choice.
  const [useOptions, setUseOptions] = useState(false);
  const [voteOptions, setVoteOptions] = useState<string[]>(['', '']);
  const optionBallot = kindRequiresOptions(kind) || useOptions;

  const [votingHours, setVotingHours] = useState(72);
  const [customVoting, setCustomVoting] = useState(false);
  // Null = the community's own deliberation length. The author only
  // overrides it deliberately, and only inside the community's range.
  const [deliberationHours, setDeliberationHours] = useState<number | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  // Null until the author picks: the card derives one from the proposal id,
  // so an author who never opens the picker still gets a picture.
  const [thumbnailKey, setThumbnailKey] = useState<string | null>(null);

  // Keep the duration inside whatever community is selected: the default of
  // three days is outside some communities' range.
  useEffect(() => {
    setVotingHours((h) => clamp(h, votingMin, votingMax));
  }, [votingMin, votingMax]);

  // Document attachments — picked now, uploaded right after the proposal
  // is created (the upload endpoint needs a proposal id).
  const [attachments, setAttachments] = useState<File[]>([]);
  const attachRef = useRef<HTMLInputElement>(null);

  // Which button triggered the form submit: 'save' keeps the proposal as a
  // draft, 'submit' also starts it right away. Both buttons are
  // type="submit" so native required-field validation runs for either path;
  // the ref is set in each button's onClick, which fires before onSubmit.
  const submitModeRef = useRef<'save' | 'submit'>('save');

  // Pull the topic and its replies in once, on arrival from the forum. It
  // never overwrites: if the author has already typed something (a reload
  // after editing, say), their words win over the draft.
  useEffect(() => {
    if (!fromPostId || !communityId || editProposalId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/communities/${communityId}/posts/${fromPostId}/draft`, {
          credentials: 'include',
        });
        if (!res.ok || cancelled) return;
        const draft = await res.json() as {
          question: string; solution: string; included: number; omitted: number;
        };
        setFormData(prev =>
          prev.question || prev.solution
            ? prev
            : { ...prev, question: draft.question, solution: draft.solution });
        // The same discussion also goes into the AI box, so «Συμπλήρωση με AI»
        // is one click away and drafts a proposal *from the thread* rather
        // than from a description of it.
        //
        // Not run automatically, and the reason is ordering rather than cost:
        // whoever promotes a topic should read what their neighbours actually
        // wrote before reading a machine's version of it. An AI draft that
        // appears first is an AI draft nobody checks against the source.
        setAiIntent(prev => prev || `${draft.question}\n\n${draft.solution}`);
        if (!cancelled) {
          setDraftNote(
            t('proposal.from_forum_note')
              .replace('{included}', String(draft.included))
              .replace('{omitted}', String(draft.omitted)),
          );
        }
      } catch {
        // The form still works empty; the topic is one tab away.
      }
    })();
    return () => { cancelled = true; };
  }, [fromPostId, communityId, editProposalId, t]);

  function handleAttachPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;
    const tooBig = picked.filter((f) => f.size > DOCUMENT_MAX_BYTES);
    if (tooBig.length > 0) {
      setError(`${t('proposal.attachment_too_large')}: ${tooBig.map((f) => f.name).join(', ')}`);
    } else {
      setError(null);
    }
    const ok = picked.filter((f) => f.size <= DOCUMENT_MAX_BYTES);
    setAttachments((prev) => [...prev, ...ok].slice(0, 10));
    if (attachRef.current) attachRef.current.value = '';
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  // Edit mode: load the existing draft into the form. Kind and track are
  // fixed once filed; they are loaded only so the labels and the submit
  // button say the right thing.
  useEffect(() => {
    if (!editProposalId) return;
    api.get<{
      question: string; solution: string; category: string | null; communityId: number;
      status: string; kind?: string; track?: string; votingDurationHours?: number | null;
    }>(`/api/proposals/${editProposalId}`).then((resp) => {
      setFormData({
        question: resp.data.question ?? '',
        solution: resp.data.solution ?? '',
        category: resp.data.category ?? '',
      });
      setSelectedCommunityId(resp.data.communityId);
      setKind(proposalKindOf(resp.data.kind));
      setEditTrack(resp.data.track === 'vote' ? 'vote' : 'deliberation');
      if (resp.data.votingDurationHours) setVotingHours(resp.data.votingDurationHours);
    }).catch(() => setError(t('proposal.create_error')));
  }, [editProposalId, t]);

  function chooseKind(next: ProposalKind) {
    setKind(next);
    // A poll is usually a choice between answers; a decision or a statute
    // usually a yes/no. Whatever the author already typed stays in the list.
    if (next === 'poll') setUseOptions(true);
    if (next === 'decision' || next === 'statute') {
      setUseOptions(voteOptions.some((o) => o.trim() !== '') && useOptions);
    }
  }

  async function handleAiDraft() {
    if (aiIntent.trim().length < 10) return;
    setAiLoading(true);
    setAiError(null);
    setAiFilled(false);
    try {
      const resp = await api.post<{
        kind?: string; question: string; solution?: string; category: string;
        track?: string; votingDurationHours?: number | null; ballotOptions?: unknown[] | null;
      }>('/api/proposals/compile', { intent: aiIntent.trim() });
      const d = resp.data;
      setFormData({
        question: d.question,
        solution: d.solution ?? '',
        category: d.category,
      });
      // The AI also reads what kind of vote this is, the track, the length
      // and the options — applied to the controls in create mode only; the
      // author can still change every one of them.
      if (!editProposalId) {
        const k = proposalKindOf(d.kind);
        setKind(k);
        const wantsDeliberation = d.track === 'deliberation' && kindAllowsDeliberation(k);
        setDeliberate(wantsDeliberation);
        if (wantsDeliberation) setMoreOpen(true);
        if (Number.isInteger(d.votingDurationHours) && (d.votingDurationHours as number) > 0) {
          const hours = clamp(d.votingDurationHours as number, votingMin, votingMax);
          setVotingHours(hours);
          setCustomVoting(false);
        }
        if (Array.isArray(d.ballotOptions) && d.ballotOptions.length >= 2) {
          setVoteOptions(d.ballotOptions.map((o) => String(o)));
          setUseOptions(true);
        } else {
          setVoteOptions(['', '']);
          setUseOptions(false);
        }
      }
      setAiFilled(true);
    } catch (e) {
      setAiError(e instanceof ApiError ? e.message : (t('proposal.ai_failed') || 'AI drafting failed'));
    } finally {
      setAiLoading(false);
    }
  }

  const CATEGORIES = [
    { value: 'education', label: t('proposal.category_education') },
    { value: 'healthcare', label: t('proposal.category_healthcare') },
    { value: 'infrastructure', label: t('proposal.category_infrastructure') },
    { value: 'environment', label: t('proposal.category_environment') },
    { value: 'economy', label: t('proposal.category_economy') },
    { value: 'governance', label: t('proposal.category_governance') },
    { value: 'other', label: t('proposal.category_other') },
  ];

  function durationLabel(hours: number): string {
    if (hours % 168 === 0) {
      const weeks = hours / 168;
      return weeks === 1 ? t('proposal.dur_week') : t('proposal.dur_weeks', { n: weeks });
    }
    if (hours % 24 === 0) {
      const days = hours / 24;
      return days === 1 ? t('proposal.dur_day') : t('proposal.dur_days', { n: days });
    }
    return t('proposal.dur_hours', { n: hours });
  }

  // When the vote would close if it started now — concrete where "72 ώρες"
  // is arithmetic.
  const closesAt = useMemo(() => {
    const end = new Date(Date.now() + votingHours * 3600_000);
    return end.toLocaleString(locale === 'el' ? 'el-GR' : 'en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
  }, [votingHours, locale]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!targetCommunityId) {
      setError(t('proposal.create_error'));
      return;
    }
    const mode = submitModeRef.current;
    const options = voteOptions.map((o) => o.trim()).filter(Boolean);
    if (!editProposalId && track === 'vote' && optionBallot) {
      const distinct = new Set(options.map((o) => o.toLowerCase())).size;
      if (options.length < 2 || distinct !== options.length) {
        setError(kind === 'election' ? t('proposal.form_candidates_min') : t('proposal.form_options_min'));
        return;
      }
    }
    setLoading(true);
    setError(null);

    try {
      const res = editProposalId
        ? await apiRequest('PATCH', `/api/proposals/${editProposalId}`, formData)
        : await apiRequest('POST', `/api/communities/${targetCommunityId}/proposals`, {
            ...formData,
            kind,
            track,
            ...(thumbnailKey ? { thumbnailKey } : {}),
            ...(track === 'vote'
              ? {
                  votingDurationHours: votingHours,
                  ballotOptions: optionBallot ? options : [],
                }
              : deliberationHours !== null
                ? { deliberationDurationHours: deliberationHours }
                : {}),
          });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || t('proposal.create_error'));
      }

      const proposal = await res.json();
      const proposalId = editProposalId ?? proposal.id;

      // Upload attachments now that a proposal id exists. Failures are
      // non-fatal: the proposal is already saved and documents can be
      // re-added from its Media tab.
      for (const file of attachments) {
        const title = file.name.replace(/\.[^.]+$/, '').slice(0, 200) || file.name;
        try {
          await uploadProposalFile(file, `/api/proposals/${proposalId}/media?kind=document`, title);
        } catch {
          /* best-effort — see comment above */
        }
      }

      // Starting the vote (or submitting for deliberation) chains the
      // lifecycle transition right after the save. If it fails the draft is
      // already stored, so navigate anyway — the detail page shows a draft
      // banner where submission can be retried (staying on the form would
      // risk creating a duplicate proposal).
      if (mode === 'submit') {
        try {
          await apiRequest('POST', `/api/proposals/${proposalId}/submit`);
        } catch {
          /* draft saved — retry from the proposal page */
        }
      }

      // Point the originating topic at the proposal it produced. Failure is
      // non-fatal — the proposal exists either way, and a missing backlink is
      // not worth losing it over.
      if (fromPostId && !editProposalId && targetCommunityId) {
        try {
          await apiRequest('POST', `/api/communities/${targetCommunityId}/posts/${fromPostId}/link-proposal`, {
            proposalId,
          });
        } catch {
          /* best-effort backlink */
        }
      }

      setLocation(`/proposals/${proposalId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.unknown_error'));
    } finally {
      setLoading(false);
    }
  }

  const textRequired = kindRequiresText(kind) || track === 'deliberation';
  // A community whose range excludes the presets (or a length the AI read
  // from the description) gets the number field, never a row with nothing
  // selected.
  const votingPresets = VOTING_PRESETS.filter((h) => h >= votingMin && h <= votingMax);
  const showCustomVoting = customVoting || !votingPresets.includes(votingHours);
  const startLabel = track === 'deliberation'
    ? t('proposal.form_start_deliberation')
    : kind === 'poll' ? t('proposal.form_start_poll') : t('proposal.form_start_vote');
  const startHint = track === 'deliberation'
    ? t('proposal.form_hint_deliberation')
    : t(kind === 'poll' ? 'proposal.form_hint_poll' : 'proposal.form_hint_vote');

  const sectionLabel = 'font-sans text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint';

  return (
    <Card>
      <CardHeader>
        <CardTitle>{editProposalId ? t('proposal.edit_title') : t('proposal.form_title_new')}</CardTitle>
        <CardDescription>
          {editProposalId ? t('proposal.edit_description') : t('proposal.form_subtitle_new')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {draftNote && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
            {draftNote}
          </div>
        )}

        {/* The quickest way through the form: say it in your own words. */}
        <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
          <Label htmlFor="ai-intent" className="flex items-center gap-2 font-medium">
            <Sparkles className="h-4 w-4 text-kyanos" />
            {t('proposal.form_ai_label')}
          </Label>
          <Textarea
            id="ai-intent"
            placeholder={t('proposal.form_ai_placeholder')}
            value={aiIntent}
            onChange={(e) => setAiIntent(e.target.value)}
            rows={2}
            maxLength={12000}
            className="bg-background"
          />
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              type="button"
              size="sm"
              onClick={handleAiDraft}
              disabled={aiLoading || aiIntent.trim().length < 10}
              data-testid="proposal-ai-draft"
            >
              {aiLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {aiLoading
                ? (t('proposal.ai_generating') || 'Δημιουργία…')
                : (t('proposal.ai_generate') || 'Συμπλήρωση με AI')}
            </Button>
            {aiFilled && (
              <p className="text-xs text-muted-foreground" data-testid="proposal-ai-filled">
                {t('proposal.form_ai_done')}
              </p>
            )}
          </div>
          {aiError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{aiError}</AlertDescription>
            </Alert>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Community — one line when there is nothing to choose. */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:gap-4">
            <Label htmlFor="community" className="shrink-0 sm:w-28">
              {t('proposal.form_community')}
            </Label>
            <div className="flex-1 min-w-0">
              {communitiesLoading ? (
                <p className="text-sm text-muted-foreground">{t('common.loading') || 'Φόρτωση…'}</p>
              ) : lockedCommunity ? (
                <p className="text-sm font-medium">{lockedCommunity.name}</p>
              ) : memberCommunities.length === 0 ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {t('proposal.no_communities') || 'Δεν είστε μέλος σε καμία κοινότητα. Εγγραφείτε πρώτα σε μία.'}
                  </AlertDescription>
                </Alert>
              ) : memberCommunities.length === 1 ? (
                <p className="text-sm font-medium">{memberCommunities[0].name}</p>
              ) : (
                <Select
                  value={selectedCommunityId != null ? String(selectedCommunityId) : ''}
                  onValueChange={(v) => setSelectedCommunityId(parseInt(v, 10))}
                >
                  <SelectTrigger id="community">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {memberCommunities.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}{c.isGeneral ? ' ★' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* What is being voted. */}
          {editProposalId ? (
            <p className="text-sm text-muted-foreground" data-testid="proposal-kind-fixed">
              {t(`proposal.kind_${kind}`)}
              {' · '}
              {track === 'vote' ? t('proposal.track_vote') : t('proposal.track_deliberation')}
            </p>
          ) : (
            <fieldset className="space-y-3">
              <legend className={`${sectionLabel} mb-3`}>{t('proposal.form_kind_label')}</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup">
                {PROPOSAL_KINDS.map((k) => {
                  const Icon = KIND_ICONS[k];
                  const selected = k === kind;
                  return (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => chooseKind(k)}
                      className={`flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-colors ${
                        selected
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'hover:border-line-strong hover:bg-muted/40'
                      }`}
                      data-testid={`proposal-kind-${k}`}
                    >
                      <Icon className={`h-5 w-5 ${selected ? 'text-primary' : 'text-muted-foreground'}`} aria-hidden="true" />
                      <span className="text-sm font-medium leading-tight">{t(`proposal.kind_${k}`)}</span>
                      <span className="text-xs leading-snug text-muted-foreground">{t(`proposal.kind_${k}_hint`)}</span>
                    </button>
                  );
                })}
              </div>
              {kind === 'poll' && (
                <p className="text-xs text-muted-foreground">{t('proposal.form_poll_note')}</p>
              )}
            </fieldset>
          )}

          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="question">
                {t(`proposal.form_q_${kind}`)} <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="question"
                placeholder={t(`proposal.form_q_${kind}_ph`)}
                value={formData.question}
                onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                rows={2}
                maxLength={2000}
                className="min-h-0 text-base"
                required
              />
            </div>

            {/* The ballot — candidates for an election, otherwise yes/no or
                the author's own options. Deliberation builds its own ballot
                from the amendments, so there is nothing to set here. */}
            {!editProposalId && track === 'vote' && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>
                    {kind === 'election' ? t('proposal.form_candidates') : t('proposal.form_answers')}
                    {kind === 'election' && <span className="text-red-500"> *</span>}
                  </Label>
                  {!kindRequiresOptions(kind) && (
                    <div className="inline-flex rounded-md border p-0.5 text-sm" role="radiogroup">
                      {[false, true].map((withOptions) => (
                        <button
                          key={String(withOptions)}
                          type="button"
                          role="radio"
                          aria-checked={useOptions === withOptions}
                          onClick={() => setUseOptions(withOptions)}
                          className={`rounded px-3 py-1 transition-colors ${
                            useOptions === withOptions
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                          data-testid={withOptions ? 'proposal-answers-options' : 'proposal-answers-yesno'}
                        >
                          {withOptions ? t('proposal.form_answers_options') : t('proposal.form_answers_yesno')}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {optionBallot ? (
                  <div className="space-y-2">
                    {voteOptions.map((opt, i) => (
                      <div key={i} className="flex gap-2">
                        <Input
                          value={opt}
                          maxLength={200}
                          placeholder={t(`proposal.form_option_ph_${kind}`, { n: i + 1 })}
                          onChange={(e) => setVoteOptions((v) => v.map((o, j) => (j === i ? e.target.value : o)))}
                          data-testid={`proposal-vote-option-${i}`}
                        />
                        {voteOptions.length > 2 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setVoteOptions((v) => v.filter((_, j) => j !== i))}
                            aria-label={t('common.remove') || 'Αφαίρεση'}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                    {/* The refusal option, shown so the author sees the
                        whole ballot the members will see. */}
                    <div className="flex items-center justify-between rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                      <span>{refusalOptionLabel(kind)}</span>
                      <span className="text-xs">{t('proposal.form_auto_option')}</span>
                    </div>
                    {voteOptions.length < 10 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setVoteOptions((v) => [...v, ''])}
                        data-testid="proposal-vote-option-add"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        {kind === 'election' ? t('proposal.form_add_candidate') : t('proposal.form_add_option')}
                      </Button>
                    )}
                    <p className="text-xs text-muted-foreground">{t('proposal.form_single_choice_hint')}</p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">{t('proposal.form_answers_yesno_hint')}</p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="solution">
                {t(`proposal.form_text_${kind}`)}
                {textRequired
                  ? <span className="text-red-500"> *</span>
                  : <span className="font-normal text-muted-foreground"> ({t('proposal.form_optional')})</span>}
              </Label>
              <Textarea
                id="solution"
                placeholder={t(`proposal.form_text_${kind}_ph`)}
                value={formData.solution}
                onChange={(e) => setFormData({ ...formData, solution: e.target.value })}
                className={textRequired ? 'min-h-[140px]' : 'min-h-[80px]'}
                required={textRequired}
              />
              <input
                ref={attachRef}
                type="file"
                accept={DOCUMENT_ACCEPT}
                multiple
                className="hidden"
                onChange={handleAttachPick}
                data-testid="proposal-attach-input"
              />
              {attachments.length > 0 && (
                <ul className="space-y-1">
                  {attachments.map((file, i) => (
                    <li
                      key={`${file.name}-${i}`}
                      className="flex items-center gap-2 text-sm border rounded-md px-3 py-1.5"
                    >
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate">{file.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {file.size > 1024 * 1024
                          ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
                          : `${Math.round(file.size / 1024)} KB`}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(i)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={t('common.remove') || 'Remove'}
                        data-testid={`proposal-attach-remove-${i}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={() => attachRef.current?.click()}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                data-testid="proposal-attach-button"
              >
                <Paperclip className="h-4 w-4" />
                {t('proposal.attach_document')}
                <span className="text-xs">· {t('media.docSizeLimit')}</span>
              </button>
            </div>
          </div>

          {/* How long the vote stays open. */}
          {!editProposalId && track === 'vote' && (
            <fieldset className="space-y-3">
              <legend className={`${sectionLabel} mb-3`}>{t('proposal.form_duration')}</legend>
              <div className="flex flex-wrap gap-2">
                {votingPresets.map((h) => {
                  const selected = !showCustomVoting && votingHours === h;
                  return (
                    <button
                      key={h}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => { setCustomVoting(false); setVotingHours(h); }}
                      className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
                        selected ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted/60'
                      }`}
                      data-testid={`proposal-duration-${h}`}
                    >
                      {durationLabel(h)}
                    </button>
                  );
                })}
                <button
                  type="button"
                  aria-pressed={showCustomVoting}
                  onClick={() => setCustomVoting(true)}
                  className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
                    showCustomVoting ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted/60'
                  }`}
                  data-testid="proposal-duration-custom"
                >
                  {t('proposal.form_duration_custom')}
                </button>
              </div>
              <p className="text-xs text-muted-foreground" data-testid="proposal-closes-at">
                {t('proposal.form_closes_at', { date: closesAt })}
              </p>
              {showCustomVoting && (
                <div className="flex items-center gap-2">
                  <Input
                    id="votingDurationHours"
                    type="number"
                    min={votingMin}
                    max={votingMax}
                    step={1}
                    required
                    value={votingHours}
                    onChange={(e) => setVotingHours(parseInt(e.target.value, 10) || votingMin)}
                    className="max-w-[7rem]"
                    data-testid="proposal-voting-duration"
                  />
                  <span className="text-sm text-muted-foreground">
                    {t('proposal.form_duration_hours')} · {t('proposal.form_duration_range', { min: votingMin, max: votingMax })}
                  </span>
                </div>
              )}
            </fieldset>
          )}

          {/* Everything a vote does not need to get started. */}
          {!editProposalId ? (
            <Collapsible open={moreOpen} onOpenChange={setMoreOpen} className="rounded-lg border">
              <CollapsibleTrigger
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                data-testid="proposal-more-toggle"
              >
                <span>
                  <span className="block text-sm font-medium">{t('proposal.form_more')}</span>
                  <span className="block text-xs text-muted-foreground">
                    {kindAllowsDeliberation(kind) ? t('proposal.form_more_hint') : t('proposal.form_more_hint_short')}
                  </span>
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${moreOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-6 border-t px-4 py-4">
                {kindAllowsDeliberation(kind) && (
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <Label htmlFor="deliberate" className="space-y-1 font-normal">
                        <span className="block text-sm font-medium">{t('proposal.form_deliberate')}</span>
                        <span className="block text-xs text-muted-foreground">{t('proposal.form_deliberate_hint')}</span>
                      </Label>
                      <Switch
                        id="deliberate"
                        checked={deliberate}
                        onCheckedChange={setDeliberate}
                        data-testid="proposal-deliberate"
                      />
                    </div>
                    {deliberate && (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">{t('proposal.form_deliberation_ballot_note')}</p>
                        <p className="text-sm">{t('proposal.form_deliberation_duration')}</p>
                        <div className="flex flex-wrap gap-2">
                          {[null, ...DELIBERATION_PRESETS.filter((h) => h >= deliberationMin && h <= deliberationMax)].map((h) => {
                            const selected = deliberationHours === h;
                            return (
                              <button
                                key={String(h)}
                                type="button"
                                aria-pressed={selected}
                                onClick={() => setDeliberationHours(h)}
                                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                                  selected ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted/60'
                                }`}
                                data-testid={`proposal-deliberation-duration-${h ?? 'default'}`}
                              >
                                {h === null
                                  ? t('proposal.form_deliberation_default', {
                                      duration: durationLabel(clamp(targetCommunity?.communitySignalHours ?? 48, deliberationMin, deliberationMax)),
                                    })
                                  : durationLabel(h)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="category">{t('proposal.category_label')}</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData({ ...formData, category: value })}
                  >
                    <SelectTrigger id="category">
                      <SelectValue placeholder={t('proposal.category_placeholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* The card picture. Create only: changing it later belongs
                    with the proposal's own edit screen. */}
                <ThumbnailPicker
                  value={thumbnailKey}
                  onChange={setThumbnailKey}
                  seed={`proposal-new-${targetCommunityId ?? 0}`}
                  label={t('appearance.proposalThumbnail')}
                />
              </CollapsibleContent>
            </Collapsible>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="category">{t('proposal.category_label')}</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder={t('proposal.category_placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2 border-t pt-6">
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
              <Button type="button" variant="ghost" onClick={() => window.history.back()}>
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                variant="outline"
                disabled={loading}
                onClick={() => { submitModeRef.current = 'save'; }}
                data-testid="proposal-save-draft"
              >
                {loading && submitModeRef.current === 'save' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editProposalId ? t('proposal.edit_button') : t('proposal.form_save_draft')}
              </Button>
              <Button
                type="submit"
                disabled={loading}
                onClick={() => { submitModeRef.current = 'submit'; }}
                data-testid="proposal-submit-review"
              >
                {loading && submitModeRef.current === 'submit' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {startLabel}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground sm:text-right" data-testid="proposal-start-hint">
              {startHint} {t('proposal.form_hint_draft')}
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
