/**
 * Proposal Form Component
 * 
 * Form for creating new proposals within a community.
 * Collects: question (problem), solution, category, and optional description.
 * On creation it also collects the proposal track (deliberation vs. direct
 * vote) and, for the vote track, the voting duration in hours.
 */

import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, FileText, Loader2, Paperclip, Sparkles, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useTranslation } from '@/hooks/use-translation';
import { apiRequest } from '@/lib/queryClient';
import { api, ApiError } from '@/lib/api';
import { uploadProposalFile, DOCUMENT_ACCEPT, DOCUMENT_MAX_BYTES } from '@/lib/upload-media';

interface ProposalFormProps {
  communityId?: number;  // Optional for demo mode
  editProposalId?: number;  // When set, edit an existing draft instead of creating
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
}

export function ProposalForm({ communityId, editProposalId }: ProposalFormProps) {
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memberCommunities, setMemberCommunities] = useState<MemberCommunity[]>([]);
  const [communitiesLoading, setCommunitiesLoading] = useState(true);
  const [selectedCommunityId, setSelectedCommunityId] = useState<number | null>(communityId ?? null);

  useEffect(() => {
    fetch('/api/communities', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load communities'))))
      .then((list: MemberCommunity[]) => {
        setMemberCommunities(list);
        if (!communityId) {
          const general = list.find((c) => c.isGeneral);
          setSelectedCommunityId((prev) => prev ?? general?.id ?? list[0]?.id ?? null);
        }
      })
      .catch(() => setMemberCommunities([]))
      .finally(() => setCommunitiesLoading(false));
  }, [communityId]);

  const targetCommunityId = communityId ?? selectedCommunityId;
  const lockedCommunity = communityId
    ? memberCommunities.find((c) => c.id === communityId)
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

  // Proposal track — only chosen at creation time; editing a draft never
  // changes its track, so the selector is hidden in edit mode.
  const [track, setTrack] = useState<'deliberation' | 'vote'>('deliberation');
  const [votingDurationHours, setVotingDurationHours] = useState('72');
  // Empty = use the community's own deliberation length. The author only
  // overrides it deliberately, and only inside the community's range.
  const [deliberationDurationHours, setDeliberationDurationHours] = useState('');
  // Optional author-defined multiple choice (vote track). Empty = Ναι/Όχι.
  const [voteOptions, setVoteOptions] = useState<string[]>([]);

  // Document attachments — picked now, uploaded right after the proposal
  // is created (the upload endpoint needs a proposal id).
  const [attachments, setAttachments] = useState<File[]>([]);
  const attachRef = useRef<HTMLInputElement>(null);

  // Which button triggered the form submit: 'save' keeps the proposal as a
  // draft, 'submit' also sends it into review right away. Both buttons are
  // type="submit" so native required-field validation runs for either path;
  // the ref is set in each button's onClick, which fires before onSubmit.
  const submitModeRef = useRef<'save' | 'submit'>('save');

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

  // Edit mode: load the existing draft into the form.
  useEffect(() => {
    if (!editProposalId) return;
    api.get<{ question: string; solution: string; category: string | null; communityId: number; status: string }>(
      `/api/proposals/${editProposalId}`,
    ).then((resp) => {
      setFormData({
        question: resp.data.question ?? '',
        solution: resp.data.solution ?? '',
        category: resp.data.category ?? '',
      });
      setSelectedCommunityId(resp.data.communityId);
    }).catch(() => setError(t('proposal.create_error')));
  }, [editProposalId, t]);

  // AI-assisted drafting (same UX as the poll compiler): describe the idea
  // in plain language, the LLM fills the fields below, the author edits.
  const [aiIntent, setAiIntent] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  async function handleAiDraft() {
    if (aiIntent.trim().length < 10) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const resp = await api.post<{ question: string; solution: string; category: string }>(
        '/api/proposals/compile',
        { intent: aiIntent.trim() },
      );
      setFormData({
        question: resp.data.question,
        solution: resp.data.solution,
        category: resp.data.category,
      });
      // The AI also reads the intent for track/duration/options — apply them
      // to the toggles (create mode only; the author can still change them).
      if (!editProposalId) {
        const d = resp.data as any;
        if (d.track === 'vote' || d.track === 'deliberation') setTrack(d.track);
        if (d.track === 'vote' && Number.isInteger(d.votingDurationHours) && d.votingDurationHours > 0) {
          setVotingDurationHours(String(d.votingDurationHours));
        }
        if (Array.isArray(d.ballotOptions) && d.ballotOptions.length >= 2) {
          setVoteOptions(d.ballotOptions.map((o: unknown) => String(o)));
          setTrack('vote');
        } else if (d.track !== 'vote') {
          setVoteOptions([]);
        }
      }
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!targetCommunityId) {
      setError(t('proposal.create_error'));
      return;
    }
    const mode = submitModeRef.current;
    setLoading(true);
    setError(null);

    try {
      const res = editProposalId
        ? await apiRequest('PATCH', `/api/proposals/${editProposalId}`, formData)
        : await apiRequest('POST', `/api/communities/${targetCommunityId}/proposals`, {
            ...formData,
            track,
            ...(track === 'vote'
              ? {
                  votingDurationHours: parseInt(votingDurationHours, 10),
                  ballotOptions: voteOptions.map(o => o.trim()).filter(Boolean),
                }
              : deliberationDurationHours.trim() !== ''
                ? { deliberationDurationHours: parseInt(deliberationDurationHours, 10) }
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

      // "Submit for review" chains the lifecycle transition right after the
      // save. If it fails the draft is already stored, so navigate anyway —
      // the detail page shows a draft banner where submission can be retried
      // (staying on the form would risk creating a duplicate proposal).
      if (mode === 'submit') {
        try {
          await apiRequest('POST', `/api/proposals/${proposalId}/submit`);
        } catch {
          /* draft saved — retry from the proposal page */
        }
      }

      setLocation(`/proposals/${proposalId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.unknown_error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{editProposalId ? t('proposal.edit_title') : t('proposal.submit_title')}</CardTitle>
        <CardDescription>
          {editProposalId ? t('proposal.edit_description') : t('proposal.submit_description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-6 rounded-lg border bg-muted/40 p-4 space-y-3">
          <Label htmlFor="ai-intent" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-blue-600" />
            {t('proposal.ai_intent_label') || 'Περιγράψτε την ιδέα σας με απλά λόγια'}
          </Label>
          <Textarea
            id="ai-intent"
            placeholder={t('proposal.ai_intent_placeholder') || 'π.χ. Στη γειτονιά μου δεν υπάρχουν ποδηλατόδρομοι και τα παιδιά κινδυνεύουν…'}
            value={aiIntent}
            onChange={(e) => setAiIntent(e.target.value)}
            rows={3}
            maxLength={12000}
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
            <p className="text-xs text-muted-foreground">
              {t('proposal.ai_hint') || 'Το AI συμπληρώνει τα πεδία — ελέγξτε και διορθώστε πριν την υποβολή.'}
            </p>
          </div>
          {aiError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{aiError}</AlertDescription>
            </Alert>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="community">
              {t('proposal.community_label') || 'Κοινότητα'} <span className="text-red-500">*</span>
            </Label>
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
            <p className="text-sm text-muted-foreground">
              {t('proposal.community_hint') || 'Μόνο κοινότητες όπου είστε μέλος.'}
            </p>
          </div>

          {!editProposalId && (
            <>
              <div className="space-y-2">
                <Label>
                  {t('proposal.track_label') || 'Διαδικασία'} <span className="text-red-500">*</span>
                </Label>
                <RadioGroup
                  value={track}
                  onValueChange={(v) => setTrack(v as 'deliberation' | 'vote')}
                  className="grid gap-2 sm:grid-cols-2"
                >
                  <label
                    htmlFor="track-deliberation"
                    className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer ${track === 'deliberation' ? 'border-primary bg-muted/40' : ''}`}
                  >
                    <RadioGroupItem
                      value="deliberation"
                      id="track-deliberation"
                      className="mt-0.5"
                      data-testid="proposal-track-deliberation"
                    />
                    <span className="space-y-1">
                      <span className="block text-sm font-medium">
                        {t('proposal.track_deliberation') || 'Διαβούλευση'}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {t('proposal.track_deliberation_help') || 'Η κοινότητα προτείνει τροπολογίες, το AI συνθέτει το τελικό κείμενο και οι αντιπροτάσεις ψηφίζονται ως εναλλακτικές.'}
                      </span>
                    </span>
                  </label>
                  <label
                    htmlFor="track-vote"
                    className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer ${track === 'vote' ? 'border-primary bg-muted/40' : ''}`}
                  >
                    <RadioGroupItem
                      value="vote"
                      id="track-vote"
                      className="mt-0.5"
                      data-testid="proposal-track-vote"
                    />
                    <span className="space-y-1">
                      <span className="block text-sm font-medium">
                        {t('proposal.track_vote') || 'Άμεση ψηφοφορία'}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {t('proposal.track_vote_help') || 'Χωρίς διαβούλευση — η πρόταση πάει κατευθείαν σε ψηφοφορία ναι/όχι με διάρκεια που ορίζετε εσείς.'}
                      </span>
                    </span>
                  </label>
                </RadioGroup>
              </div>

              {track === 'deliberation' && !editProposalId && (
                <div className="space-y-2">
                  <Label htmlFor="deliberationDurationHours">
                    {t('proposal.deliberation_duration_label')}
                  </Label>
                  <Input
                    id="deliberationDurationHours"
                    type="number"
                    min={deliberationMin}
                    max={deliberationMax}
                    step={1}
                    value={deliberationDurationHours}
                    onChange={(e) => setDeliberationDurationHours(e.target.value)}
                    placeholder={String(targetCommunity?.communitySignalHours ?? 48)}
                    className="max-w-[10rem]"
                    data-testid="proposal-deliberation-duration"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('proposal.deliberation_duration_hint', { min: deliberationMin, max: deliberationMax })}
                  </p>
                </div>
              )}

              {track === 'vote' && (
                <div className="space-y-2">
                  <Label htmlFor="votingDurationHours">
                    {t('proposal.track_vote_duration_label') || 'Διάρκεια ψηφοφορίας (ώρες)'} <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="votingDurationHours"
                    type="number"
                    min={votingMin}
                    max={votingMax}
                    step={1}
                    required
                    value={votingDurationHours}
                    onChange={(e) => setVotingDurationHours(e.target.value)}
                    className="max-w-[10rem]"
                    data-testid="proposal-voting-duration"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('proposal.track_vote_duration_hint') || '72 = 3 ημέρες, 168 = 1 εβδομάδα'}
                    {` — ${votingMin}–${votingMax}`}
                  </p>

                  <div className="space-y-2 pt-2">
                    <Label>{t('proposal.vote_options_label') || 'Επιλογές ψηφοφορίας (προαιρετικά)'}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t('proposal.vote_options_hint') || 'Κενό = απλή ψηφοφορία Ναι/Όχι. Με επιλογές, οι ψηφοφόροι διαλέγουν μία — και προστίθεται αυτόματα η επιλογή «Καμία αλλαγή».'}
                    </p>
                    {voteOptions.map((opt, i) => (
                      <div key={i} className="flex gap-2">
                        <Input
                          value={opt}
                          maxLength={200}
                          placeholder={`${t('proposal.vote_option_placeholder') || 'Επιλογή'} ${i + 1}`}
                          onChange={(e) => setVoteOptions(v => v.map((o, j) => (j === i ? e.target.value : o)))}
                          data-testid={`proposal-vote-option-${i}`}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => setVoteOptions(v => v.filter((_, j) => j !== i))}
                          aria-label={t('common.remove') || 'Αφαίρεση'}
                        >
                          ×
                        </Button>
                      </div>
                    ))}
                    {voteOptions.length < 10 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setVoteOptions(v => [...v, ''])}
                        data-testid="proposal-vote-option-add"
                      >
                        + {t('proposal.vote_option_add') || 'Προσθήκη επιλογής'}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="question">
              {t('proposal.question_label')} <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="question"
              placeholder={t('proposal.question_placeholder')}
              value={formData.question}
              onChange={(e) => setFormData({ ...formData, question: e.target.value })}
              className="min-h-[120px]"
              required
            />
            <p className="text-sm text-muted-foreground">
              {t('proposal.question_hint')}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="solution">
              {t('proposal.solution_label')} <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="solution"
              placeholder={t('proposal.solution_placeholder')}
              value={formData.solution}
              onChange={(e) => setFormData({ ...formData, solution: e.target.value })}
              className="min-h-[120px]"
              required
            />
            <p className="text-sm text-muted-foreground">
              {t('proposal.solution_hint')}
            </p>
          </div>

          <div className="space-y-2">
            <Label>
              <span className="flex items-center gap-2">
                <Paperclip className="h-4 w-4" />
                {t('proposal.attachments_label')}
              </span>
            </Label>
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
            <div className="flex items-center gap-3 flex-wrap">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => attachRef.current?.click()}
                data-testid="proposal-attach-button"
              >
                <Paperclip className="h-4 w-4 mr-2" />
                {t('proposal.attach_document')}
              </Button>
              <p className="text-xs text-muted-foreground">{t('media.docSizeLimit')}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">{t('proposal.category_label')}</Label>
            <Select
              value={formData.category}
              onValueChange={(value) => setFormData({ ...formData, category: value })}
            >
              <SelectTrigger>
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

          <div className="space-y-2">
            <div className="flex items-center justify-end gap-2 flex-wrap">
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
                {loading && submitModeRef.current === 'save' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('proposal.submitting')}
                  </>
                ) : (
                  editProposalId ? t('proposal.edit_button') : t('proposal.submit_button')
                )}
              </Button>
              <Button
                type="submit"
                disabled={loading}
                onClick={() => { submitModeRef.current = 'submit'; }}
                data-testid="proposal-submit-review"
              >
                {loading && submitModeRef.current === 'submit' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('proposal.submitting_review')}
                  </>
                ) : (
                  t('proposal.submit_for_review')
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-right">
              {!editProposalId && track === 'vote'
                ? (t('proposal.track_vote_submit_hint') || 'Το προσχέδιο δεν προχωρά σε ψηφοφορία μέχρι να υποβληθεί για έλεγχο.')
                : t('proposal.submit_vs_save_hint')}
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
