/**
 * Author Amendment Review Page
 * 
 * The proposal author reviews submitted amendments, accepting or rejecting each
 * with a brief justification. Rejected amendments go to community signal phase.
 */

import { useState, useEffect } from 'react';
import { useParams } from 'wouter';
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { ArrowLeft, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';

interface Amendment {
  id: number;
  authorId: number;
  type: string;
  text: string;
  authorDecision: 'accepted' | 'rejected' | null;
  authorReason: string | null;
  llmScore: number | null;
  createdAt: string;
}

export default function AmendmentAuthorReview() {
  const params = useParams<{ id: string }>();
  const proposalId = parseInt(params.id || '0', 10);
  const { t } = useTranslation();
  
  const [amendments, setAmendments] = useState<Amendment[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<Record<number, boolean>>({});
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [advanceError, setAdvanceError] = useState<string | null>(null);

  async function advanceToCommunitySignal() {
    setAdvancing(true);
    setAdvanceError(null);
    try {
      await api.post(`/api/proposals/${proposalId}/transition`, { newState: 'community_signal' });
      window.location.href = `/proposals/${proposalId}`;
    } catch (e: any) {
      setAdvanceError(e?.response?.data?.message || String(e?.message || e));
      setAdvancing(false);
    }
  }

  useEffect(() => {
    loadAmendments();
  }, [proposalId]);

  async function loadAmendments() {
    try {
      const res = await api.get<Amendment[]>(`/api/proposals/${proposalId}/amendments`);
      setAmendments(res.data);
    } catch (e) {
      setError(t('amendment.error.loadFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function reviewAmendment(amendmentId: number, decision: 'accepted' | 'rejected') {
    if (decision === 'rejected' && !reasons[amendmentId]?.trim()) {
      return; // Require reason for rejection
    }
    
    setReviewing(prev => ({ ...prev, [amendmentId]: true }));
    
    try {
      await api.post(`/api/amendments/${amendmentId}/review`, {
        decision,
        reason: decision === 'rejected' ? reasons[amendmentId] : undefined,
      });
      
      setAmendments(prev => prev.map(a => 
        a.id === amendmentId 
          ? { ...a, authorDecision: decision, authorReason: decision === 'rejected' ? reasons[amendmentId] : null }
          : a
      ));
    } catch (e) {
      setError(t('amendment.error.reviewFailed'));
    } finally {
      setReviewing(prev => ({ ...prev, [amendmentId]: false }));
    }
  }

  const allReviewed = amendments.length > 0 && amendments.every(a => a.authorDecision !== null);
  const acceptedCount = amendments.filter(a => a.authorDecision === 'accepted').length;
  const rejectedCount = amendments.filter(a => a.authorDecision === 'rejected').length;

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <div className="container mx-auto py-6 px-4 max-w-3xl flex-grow">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <div className="container mx-auto py-6 px-4 max-w-3xl flex-grow">
      <div className="flex items-center gap-2 mb-6">
        <Button variant="ghost" size="sm" onClick={() => window.history.back()}>
          <ArrowLeft className="w-4 h-4 mr-1" /> {t('general.back')}
        </Button>
        <h1 className="text-2xl font-bold">{t('amendment.authorReview.title')}</h1>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t('amendment.authorReview.youArePrimaryEditor')}</CardTitle>
          <CardDescription>
            {t('amendment.authorReview.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 text-sm">
            <Badge variant="secondary" className="bg-green-100 text-green-700">
              ✓ {t('amendment.authorReview.acceptedCount', { count: acceptedCount })}
            </Badge>
            <Badge variant="secondary" className="bg-red-100 text-red-700">
              ✗ {t('amendment.authorReview.rejectedCount', { count: rejectedCount })}
            </Badge>
            <Badge variant="secondary">
              {t('amendment.authorReview.pendingCount', { count: amendments.length - acceptedCount - rejectedCount })}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-4 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {amendments.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t('amendment.authorReview.noAmendments')}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {amendments.map(amendment => (
            <Card key={amendment.id} className={
              amendment.authorDecision === 'accepted' ? 'border-green-200 bg-green-50' :
              amendment.authorDecision === 'rejected' ? 'border-red-200 bg-red-50' :
              'border-muted'
            }>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{amendment.type}</Badge>
                    <span className="text-sm text-muted-foreground">
                      {t('amendment.fromUser', { id: amendment.authorId })}
                    </span>
                  </div>
                  {amendment.authorDecision && (
                    <div className="flex items-center gap-1">
                      {amendment.authorDecision === 'accepted' ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-600" />
                      )}
                      <span className="text-sm font-medium">
                        {amendment.authorDecision === 'accepted' ? t('amendment.accepted') : t('amendment.rejected')}
                      </span>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm mb-3">{amendment.text}</p>
                
                {amendment.authorDecision === 'rejected' && amendment.authorReason && (
                  <div className="p-2 bg-white rounded border text-xs text-muted-foreground mb-3">
                    <strong>{t('amendment.justification')}</strong> {amendment.authorReason}
                  </div>
                )}
                
                {amendment.authorDecision === null && (
                  <>
                    <Textarea
                      placeholder={t('amendment.justificationPlaceholder')}
                      className="min-h-[40px] text-sm mb-3"
                      value={reasons[amendment.id] || ''}
                      onChange={e => setReasons(prev => ({ ...prev, [amendment.id]: e.target.value }))}
                    />
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        className="bg-green-600 hover:bg-green-700 flex-1"
                        onClick={() => reviewAmendment(amendment.id, 'accepted')}
                        disabled={reviewing[amendment.id]}
                      >
                        <CheckCircle className="w-4 h-4 mr-1" /> {t('amendment.accept')}
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1"
                        onClick={() => reviewAmendment(amendment.id, 'rejected')}
                        disabled={reviewing[amendment.id] || !reasons[amendment.id]?.trim()}
                      >
                        <XCircle className="w-4 h-4 mr-1" /> {t('amendment.reject')}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ))}

          {allReviewed && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center space-y-3">
              <CheckCircle className="w-6 h-6 text-green-600 mx-auto" />
              <p className="font-medium text-green-700">{t('amendment.authorReview.reviewComplete')}</p>
              <p className="text-sm text-green-600">
                {t('amendment.authorReview.rejectedGoToCommunity')}
              </p>
              <Button onClick={advanceToCommunitySignal} disabled={advancing}>
                {advancing
                  ? (t('amendment.authorReview.advancing') || 'Μετάβαση…')
                  : (t('amendment.authorReview.advanceButton') || 'Μετάβαση στην επόμενη φάση')}
              </Button>
              {advanceError && <p className="text-sm text-red-600">{advanceError}</p>}
            </div>
          )}
        </div>
      )}
      </div>
      <Footer />
    </div>
  );
}
