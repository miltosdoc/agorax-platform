/**
 * AmendmentsPanel — displays amendments for a proposal with status badges,
 * community signal indicators, and duplicate grouping.
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { useTranslation } from '@/hooks/use-translation';
import {
  FileText,
  Plus,
  Link2,
  TrendingUp,
  TrendingDown,
  MinusCircle,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react';

interface Amendment {
  id: number;
  proposalId: number;
  authorId: number;
  authorName?: string;
  text: string;
  status: 'pending' | 'accepted' | 'rejected' | 'flagged';
  createdAt: string;
  duplicateGroupId?: number | null;
  siblingIds?: number[];
  communitySignal?: number | null;
}

const STATUS_CONFIG = {
  pending: { icon: Clock, color: 'bg-yellow-100 text-yellow-800', labelKey: 'workspace.amendments.statusPending' },
  accepted: { icon: CheckCircle, color: 'bg-green-100 text-green-800', labelKey: 'workspace.amendments.statusAccepted' },
  rejected: { icon: XCircle, color: 'bg-red-100 text-red-700', labelKey: 'workspace.amendments.statusRejected' },
  flagged: { icon: AlertTriangle, color: 'bg-purple-100 text-purple-800', labelKey: 'workspace.amendments.statusFlagged' },
};

interface AmendmentsPanelProps {
  proposalId: number;
  proposalStatus: string;
  userIsAuthor?: boolean;
}

export function AmendmentsPanel({ proposalId, proposalStatus, userIsAuthor }: AmendmentsPanelProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [amendments, setAmendments] = useState<Amendment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newText, setNewText] = useState('');
  const [newType, setNewType] = useState<'improvement' | 'counter_proposal'>('improvement');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Amendment[]>(`/api/proposals/${proposalId}/amendments`)
      .then(resp => setAmendments(resp.data))
      .catch(() => setAmendments([]))
      .finally(() => setLoading(false));
  }, [proposalId]);

  const canSubmit = ['draft', 'author_review', 'community_signal'].includes(proposalStatus);

  const handleSubmit = async () => {
    if (!newText.trim() || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const resp = await api.post<Amendment>(`/api/proposals/${proposalId}/amendments`, {
        type: newType,
        text: newText.trim(),
      });
      setAmendments(prev => [...prev, resp.data]);
      setNewText('');
      setNewType('improvement');
    } catch (error) {
      setSubmitError(error instanceof ApiError ? error.message : t('workspace.amendments.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          {t('workspace.amendments.loading')}
        </CardContent>
      </Card>
    );
  }

  if (amendments.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {t('workspace.tabs.amendments')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-4">{t('workspace.amendments.empty')}</p>
          {canSubmit && user && (
            <div className="mt-4 space-y-3">
              <div className="space-y-1">
                <Label htmlFor="amendment-type">{t('workspace.amendments.typeLabel') || 'Τύπος'}</Label>
                <Select value={newType} onValueChange={(v) => setNewType(v as 'improvement' | 'counter_proposal')}>
                  <SelectTrigger id="amendment-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="improvement">{t('workspace.amendments.type.improvement') || 'Βελτίωση'}</SelectItem>
                    <SelectItem value="counter_proposal">{t('workspace.amendments.type.counter_proposal') || 'Αντιπρόταση'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Textarea
                placeholder={t('workspace.amendments.placeholder') || 'Προτείνετε τροπολογία...'}
                value={newText}
                onChange={e => setNewText(e.target.value)}
                rows={3}
              />
              <div className="flex justify-between items-center">
                {submitError && <span className="text-red-600 text-sm">{submitError}</span>}
                <Button size="sm" onClick={handleSubmit} disabled={submitting || !newText.trim()}>
                  <Plus className="w-4 h-4 mr-1" />
                  {t('workspace.amendments.submit') || 'Υποβολή'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Group by duplicate group
  const groups = new Map<number | null, Amendment[]>();
  for (const a of amendments) {
    const key = a.duplicateGroupId ?? null;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {t('workspace.tabs.amendments')}
            <Badge variant="secondary">{amendments.length}</Badge>
          </div>
          {canSubmit && user && (
            <Button size="sm" variant="outline" onClick={() => document.getElementById('new-amendment')?.focus()}>
              <Plus className="w-4 h-4 mr-1" />
              {t('workspace.amendments.new') || 'Νέα τροπολογία'}
            </Button>
          )}
        </CardTitle>
        <CardDescription>
          {amendments.filter(a => a.status === 'accepted').length}{' '}
          {t('workspace.amendments.statusAccepted').toLowerCase()},{' '}
          {amendments.filter(a => a.status === 'rejected').length}{' '}
          {t('workspace.amendments.statusRejected').toLowerCase()},{' '}
          {amendments.filter(a => a.status === 'pending').length}{' '}
          {t('workspace.amendments.statusPending').toLowerCase()}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {Array.from(groups.entries()).map(([groupId, group]) => (
          <div key={groupId ?? 'ungrouped'} className="space-y-2">
            {group.map((amendment) => {
              const config = STATUS_CONFIG[amendment.status];
              const Icon = config.icon;
              return (
                <div
                  key={amendment.id}
                  className="p-4 rounded-lg border bg-card hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="flex items-center gap-2">
                      <Badge className={config.color}>
                        <Icon className="w-3 h-3 mr-1" />
                        {t(config.labelKey)}
                      </Badge>
                      {amendment.duplicateGroupId && group.length > 1 && (
                        <Badge variant="outline" className="text-xs">
                          <Link2 className="w-3 h-3 mr-1" />
                          {t('workspace.amendments.duplicateGroup', { count: group.length }) || `${group.length} similar`}
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(amendment.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{amendment.text}</p>
                  <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                    <span>
                      {amendment.authorName || t('proposal.userWithId', { id: amendment.authorId })}
                    </span>
                    {amendment.communitySignal !== null && amendment.communitySignal !== undefined && (
                      <div className="flex items-center gap-1">
                        {amendment.communitySignal > 0 ? <TrendingUp className="w-3 h-3 text-green-600" /> :
                         amendment.communitySignal < 0 ? <TrendingDown className="w-3 h-3 text-red-600" /> :
                         <MinusCircle className="w-3 h-3" />}
                        <span>{t('workspace.amendments.signalNet')}: {amendment.communitySignal > 0 ? '+' : ''}{amendment.communitySignal}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {canSubmit && user && (
          <div className="pt-4 border-t space-y-3">
            <div className="space-y-1">
              <Label htmlFor="amendment-type-2">{t('workspace.amendments.typeLabel') || 'Τύπος'}</Label>
              <Select value={newType} onValueChange={(v) => setNewType(v as 'improvement' | 'counter_proposal')}>
                <SelectTrigger id="amendment-type-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="improvement">{t('workspace.amendments.type.improvement') || 'Βελτίωση'}</SelectItem>
                  <SelectItem value="counter_proposal">{t('workspace.amendments.type.counter_proposal') || 'Αντιπρόταση'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Textarea
              id="new-amendment"
              placeholder={t('workspace.amendments.placeholder') || 'Προτείνετε τροπολογία...'}
              value={newText}
              onChange={e => setNewText(e.target.value)}
              rows={3}
            />
            <div className="flex justify-between items-center">
              {submitError && <span className="text-red-600 text-sm">{submitError}</span>}
              <Button size="sm" onClick={handleSubmit} disabled={submitting || !newText.trim()}>
                <Plus className="w-4 h-4 mr-1" />
                {t('workspace.amendments.submit') || 'Υποβολή'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
