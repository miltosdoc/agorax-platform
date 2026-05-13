/**
 * Sortition Synthesis Page
 * 
 * Sortition body members compose the final proposal text using:
 * - The author's draft (with accepted amendments merged)
 * - Flagged amendments (rejected by author but flagged by community)
 * 
 * The composed text becomes the final version for ratification voting.
 */

import { useState, useEffect } from 'react';
import { useParams } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { ArrowLeft, PenTool, AlertCircle, CheckCircle } from 'lucide-react';
import Footer from '@/components/layout/footer';
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
  community: {
    id: number;
    name: string;
    amendmentThreshold: number;
  };
}

export default function SortitionSynthesis() {
  const params = useParams<{ id: string }>();
  const proposalId = parseInt(params.id || '0', 10);
  const { t } = useTranslation();
  
  const [input, setInput] = useState<SortitionInput | null>(null);
  const [finalText, setFinalText] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadSortitionInput();
  }, [proposalId]);

  async function loadSortitionInput() {
    try {
      const res = await api.get<SortitionInput>(`/api/proposals/${proposalId}/sortition-input`);
      setInput(res.data);
      setFinalText(res.data.authorDraft); // Pre-fill with author draft
    } catch (e) {
      setError(t('sortition.synthesis.error.loadFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function submitFinalText() {
    if (!finalText.trim()) {
      setError(t('sortition.synthesis.error.emptyText'));
      return;
    }
    
    setSubmitting(true);
    try {
      await api.post(`/api/proposals/${proposalId}/final-text`, { finalText });
      setSuccess(true);
    } catch (e) {
      setError(t('sortition.synthesis.error.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto py-6 px-4 max-w-3xl">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="container mx-auto py-6 px-4 max-w-3xl">
        <Card className="border-green-200 bg-green-50">
          <CardContent className="py-12 text-center">
            <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-green-700 mb-2">{t('sortition.synthesis.finalTextSubmitted')}</h2>
            <p className="text-green-600">
              {t('sortition.synthesis.synthesisComplete')}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 px-4 max-w-3xl">
      <div className="flex items-center gap-2 mb-6">
        <Button variant="ghost" size="sm" onClick={() => window.history.back()}>
          <ArrowLeft className="w-4 h-4 mr-1" /> {t('general.back')}
        </Button>
        <h1 className="text-2xl font-bold">{t('sortition.synthesis.title')}</h1>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PenTool className="w-5 h-5 text-purple-600" />
            {t('sortition.synthesis.composeTitle')}
          </CardTitle>
          <CardDescription>
            {t('sortition.synthesis.composeDescription')}
            {input && <span className="block mt-1">{t('sortition.synthesis.communityLabel', { name: input.community.name })}</span>}
          </CardDescription>
        </CardHeader>
      </Card>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-4 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {input && (
        <>
          {/* Author Draft */}
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

          {/* Flagged Amendments */}
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
                  {input.flaggedAmendments.map(amendment => (
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

          {/* Final Text Editor */}
          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t('sortition.synthesis.finalTextTitle')}</CardTitle>
              <CardDescription>
                {t('sortition.synthesis.finalTextDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={finalText}
                onChange={e => setFinalText(e.target.value)}
                className="min-h-[200px] text-sm"
              />
            </CardContent>
          </Card>

          {/* Submit */}
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
                <>
                  {t('sortition.synthesis.submitFinalText')} <ArrowLeft className="ml-2 w-4 h-4 rotate-180" />
                </>
              )}
            </Button>
          </div>
        </>
      )}
      <Footer />
    </div>
  );
}
