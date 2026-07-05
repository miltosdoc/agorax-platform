/**
 * Proposal Form Component
 * 
 * Form for creating new proposals within a community.
 * Collects: question (problem), solution, category, and optional description.
 */

import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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
  const [formData, setFormData] = useState({
    question: '',
    solution: '',
    category: '',
  });

  // Document attachments — picked now, uploaded right after the proposal
  // is created (the upload endpoint needs a proposal id).
  const [attachments, setAttachments] = useState<File[]>([]);
  const attachRef = useRef<HTMLInputElement>(null);

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
    setLoading(true);
    setError(null);

    try {
      const res = editProposalId
        ? await apiRequest('PATCH', `/api/proposals/${editProposalId}`, formData)
        : await apiRequest('POST', `/api/communities/${targetCommunityId}/proposals`, formData);

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

          <div className="flex items-center justify-end space-x-2">
            <Button type="button" variant="outline" onClick={() => window.history.back()}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('proposal.submitting')}
                </>
              ) : (
                editProposalId ? t('proposal.edit_button') : t('proposal.submit_button')
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
