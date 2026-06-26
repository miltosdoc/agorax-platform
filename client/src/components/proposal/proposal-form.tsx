/**
 * Proposal Form Component
 * 
 * Form for creating new proposals within a community.
 * Collects: question (problem), solution, category, and optional description.
 */

import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useTranslation } from '@/hooks/use-translation';
import { apiRequest } from '@/lib/queryClient';

interface ProposalFormProps {
  communityId?: number;  // Optional for demo mode
}

interface MemberCommunity {
  id: number;
  name: string;
  isGeneral?: boolean;
}

export function ProposalForm({ communityId }: ProposalFormProps) {
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
      const res = await apiRequest('POST', `/api/communities/${targetCommunityId}/proposals`, formData);

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || t('proposal.create_error'));
      }

      const proposal = await res.json();
      setLocation(`/proposals/${proposal.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.unknown_error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('proposal.submit_title')}</CardTitle>
        <CardDescription>
          {t('proposal.submit_description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
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
                t('proposal.submit_button')
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
