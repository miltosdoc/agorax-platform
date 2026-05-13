/**
 * Sortition Synthesis Page
 *
 * What this phase does:
 *   A randomly-selected jury of community members composes the final text
 *   of the proposal, integrating the original draft + amendments the
 *   community flagged for reconsideration. The composed text becomes the
 *   binding text put to the ratification vote.
 *
 * Page layout:
 *   1. "What is this?" explainer card
 *   2. Jury panel — who was selected, how many have responded, deadline
 *   3. AI-pre-merged baseline (read-only) — what the LLM stitched together
 *   4. Original draft + flagged amendments — context
 *   5. Editor — only enabled if the current user is on the jury
 */

import { useState, useEffect } from 'react';
import { useParams } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { ArrowLeft, PenTool, AlertCircle, CheckCircle, Users, Clock, Eye } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import { useTranslation } from '@/hooks/use-translation';

interface SortitionInput {
  authorDraft: string;
  flaggedAmendments: Array<{
    id: number;
    authorId: number;
    type: string;
    text: string;
    authorDecision: string | null;
    authorReason: string | null;
    rejectionUpvotes: number;
    rejectionDownvotes: number;
    llmScore: number | null;
    createdAt: string;
  }>;
  community: { id: number; name: string; amendmentThreshold: number };
}

interface SortitionBodySnapshot {
  body: {
    id: number;
    status: string;
    purpose: string;
    size: number;
    responseHours: number;
    selectedAt: string | null;
    completedAt: string | null;
  } | null;
  members: Array<{
    memberId: number;
    userId: number;
    responded: boolean;
    scoredAt: string | null;
    username: string;
    name: string | null;
    profilePicture: string | null;
  }>;
  respondedCount: number;
  userIsMember: boolean;
  deadline: string | null;
  baseline: string | null;
}

function formatDeadline(iso: string | null): string {
  if (!iso) return '—';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h`;
  const minutes = Math.floor(ms / (1000 * 60));
  return `${minutes}m`;
}

export default function SortitionSynthesis() {
  const params = useParams<{ id: string }>();
  const proposalId = parseInt(params.id || '0', 10);
  const { t } = useTranslation();

  const [input, setInput] = useState<SortitionInput | null>(null);
  const [snapshot, setSnapshot] = useState<SortitionBodySnapshot | null>(null);
  const [finalText, setFinalText] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!proposalId) return;
    setLoading(true);
    Promise.all([
      api.get<SortitionInput>(`/api/proposals/${proposalId}/sortition-input`).catch(() => null),
      api.get<SortitionBodySnapshot>(`/api/proposals/${proposalId}/sortition-body`).catch(() => null),
    ]).then(([inputResp, snapResp]) => {
      const inp = inputResp?.data ?? null;
      const snap = snapResp?.data ?? null;
      setInput(inp);
      setSnapshot(snap);
      // Prefer the AI-merged baseline; fall back to the author draft.
      setFinalText(snap?.baseline ?? inp?.authorDraft ?? '');
    }).finally(() => setLoading(false));
  }, [proposalId]);

  async function submitFinalText() {
    if (!finalText.trim()) {
      setError(t('sortition.synthesis.error.emptyText'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/api/proposals/${proposalId}/final-text`, { finalText });
      setSuccess(true);
    } catch {
      setError(t('sortition.synthesis.error.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  if (success) {
    return (
      <AppShell>
        <Card className="border-green-200 bg-green-50">
          <CardContent className="py-12 text-center">
            <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-green-700 mb-2">{t('sortition.synthesis.finalTextSubmitted')}</h2>
            <p className="text-green-600">{t('sortition.synthesis.synthesisComplete')}</p>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const userIsJuror = !!snapshot?.userIsMember;
  const responded = snapshot?.respondedCount ?? 0;
  const total = snapshot?.body?.size ?? snapshot?.members.length ?? 0;
  const progressPct = total > 0 ? Math.round((responded / total) * 100) : 0;

  return (
    <AppShell>
      <Button variant="ghost" size="sm" onClick={() => window.history.back()} className="mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" /> {t('general.back')}
      </Button>

      {/* Explainer */}
      <Card className="mb-6 border-purple-200 bg-purple-50/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PenTool className="w-5 h-5 text-purple-600" />
            {t('sortition.synthesis.title') || 'Σύνθεση κληρωτού σώματος'}
          </CardTitle>
          <CardDescription>
            {t('sortition.synthesis.whatIsIt') || 'Ένα τυχαία επιλεγμένο σώμα πολιτών συντάσσει το τελικό κείμενο της πρότασης, ενσωματώνοντας τις τροπολογίες που η κοινότητα επισήμανε για επανεξέταση. Το κείμενο που θα προκύψει είναι αυτό που θα τεθεί σε δεσμευτική ψηφοφορία.'}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Jury panel */}
      {snapshot?.body && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Users className="w-5 h-5" />
                  {t('sortition.synthesis.jury') || 'Κληρωτό σώμα'}
                  <Badge variant="secondary">{total}</Badge>
                </CardTitle>
                <CardDescription>
                  {responded}/{total} {t('sortition.synthesis.responded') || 'απάντησαν'} ({progressPct}%)
                </CardDescription>
              </div>
              {snapshot.deadline && (
                <Badge variant="outline" className="self-start gap-1">
                  <Clock className="w-3 h-3" />
                  {t('sortition.synthesis.deadline') || 'Προθεσμία'}: {formatDeadline(snapshot.deadline)}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {snapshot.members.map((m) => (
                <div
                  key={m.memberId}
                  className={`flex items-center gap-2 p-2 rounded border ${
                    m.responded ? 'border-green-200 bg-green-50' : 'border-muted bg-background'
                  }`}
                >
                  {m.profilePicture ? (
                    <img src={m.profilePicture} alt="" className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                      {(m.name || m.username).slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{m.name || m.username}</p>
                    <p className="text-[10px] text-muted-foreground truncate">@{m.username}</p>
                  </div>
                  {m.responded && <CheckCircle className="w-3 h-3 text-green-600 flex-shrink-0" />}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              {userIsJuror
                ? (t('sortition.synthesis.youAreJuror') || 'Είστε μέλος του κληρωτού σώματος. Μπορείτε να επεξεργαστείτε το τελικό κείμενο πιο κάτω.')
                : (t('sortition.synthesis.observerNote') || 'Παρακολουθείτε ως πολίτης. Μόνο τα μέλη του κληρωτού σώματος μπορούν να επεξεργαστούν το κείμενο.')}
            </p>
          </CardContent>
        </Card>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-4 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {input && (
        <>
          {/* Original draft */}
          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t('sortition.synthesis.authorDraft')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-3 bg-background rounded border text-sm whitespace-pre-wrap">
                {input.authorDraft}
              </div>
            </CardContent>
          </Card>

          {/* Flagged amendments */}
          {input.flaggedAmendments.length > 0 && (
            <Card className="mb-4 border-green-200 bg-green-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  {t('sortition.synthesis.flaggedAmendments')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {input.flaggedAmendments.map((amendment) => (
                    <div key={amendment.id} className="p-3 bg-white rounded border text-sm">
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant="outline">{amendment.type}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {t('amendment.net')}: +{amendment.rejectionUpvotes - amendment.rejectionDownvotes}
                        </span>
                      </div>
                      <p className="text-muted-foreground">{amendment.text}</p>
                      {amendment.authorReason && (
                        <p className="text-xs text-muted-foreground mt-1">
                          <strong>{t('amendment.authorJustification')}</strong> {amendment.authorReason}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Editor (jurors) or read-only baseline (observers) */}
          <Card className="mb-4">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  {userIsJuror ? <PenTool className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  {t('sortition.synthesis.finalTextTitle')}
                </CardTitle>
                {!userIsJuror && (
                  <Badge variant="outline">{t('sortition.synthesis.readOnly') || 'Μόνο ανάγνωση'}</Badge>
                )}
              </div>
              <CardDescription>
                {userIsJuror
                  ? (t('sortition.synthesis.finalTextDescription') || 'Επεξεργαστείτε το προτεινόμενο κείμενο. Έχει προ-συντεθεί από ΤΝ ως αφετηρία.')
                  : (t('sortition.synthesis.observerDescription') || 'Αυτό είναι το τρέχον κείμενο που συντάσσει το κληρωτό σώμα. Θα οριστικοποιηθεί όταν αρκετά μέλη έχουν απαντήσει.')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={finalText}
                onChange={(e) => setFinalText(e.target.value)}
                className="min-h-[260px] text-sm"
                disabled={!userIsJuror}
              />
            </CardContent>
          </Card>

          {userIsJuror && (
            <div className="flex justify-end">
              <Button
                className="bg-purple-600 hover:bg-purple-700"
                onClick={submitFinalText}
                disabled={submitting || !finalText.trim()}
              >
                {submitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                    {t('sortition.synthesis.submitting')}
                  </>
                ) : (
                  t('sortition.synthesis.submitFinalText')
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
