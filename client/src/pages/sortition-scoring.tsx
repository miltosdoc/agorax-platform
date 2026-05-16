/**
 * Sortition Scoring Interface
 * 
 * Interface for sortition body members to score proposals.
 * Members see the proposal, similar proposals, and submit their score.
 */

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, Clock, ThumbsUp, ThumbsDown, XCircle } from 'lucide-react';
import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { api, ApiError } from '@/lib/api';
import { useTranslation } from '@/hooks/use-translation';

interface SortitionAssignment {
  id: number;
  proposalId: number;
  proposalQuestion: string;
  proposalSolution: string;
  responseDeadline: string;
  similarProposals: Array<{
    id: number;
    question: string;
    state: string;
  }>;
}

interface AttendanceState {
  summary: {
    invited: number;
    accepted: number;
    declined: number;
    noShow: number;
    completed: number;
    total: number;
    confirmedPct: number;
  };
  userMemberId: number | null;
  userAttendance: {
    status: 'invited' | 'accepted' | 'declined' | 'no-show' | 'completed';
  } | null;
  responseDeadline: string | null;
}

/** Page shell — full header/footer chrome and a centered desktop column. */
function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow pt-16 pb-10">
        <div className="container mx-auto px-4 max-w-3xl">{children}</div>
      </main>
      <Footer />
    </div>
  );
}

export default function SortitionScoringPage() {
  const [location] = useLocation();
  const assignmentId = location.split('/').pop();
  const { t } = useTranslation();
  
  const [assignment, setAssignment] = useState<SortitionAssignment | null>(null);
  const [attendance, setAttendance] = useState<AttendanceState | null>(null);
  const [attendanceSubmitting, setAttendanceSubmitting] = useState(false);
  const [score, setScore] = useState(50);
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revisions, setRevisions] = useState<Array<{ id: number; text: string; authorName: string }>>([]);
  const [revisionText, setRevisionText] = useState('');
  const [revisionSubmitting, setRevisionSubmitting] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);

  useEffect(() => {
    if (!assignmentId) return;

    // DEMO MODE: Use mock data when backend is unavailable
    api.get<SortitionAssignment>(`/api/sortition/assignments/${assignmentId}`)
      .then(resp => {
        setAssignment(resp.data);
        setLoading(false);
      })
      .catch(() => {
        // Fallback to demo data
        setAssignment({
          id: 1,
          proposalId: 1,
          proposalQuestion: 'Πώς μπορούμε να βελτιώσουμε τη δημόσια συγκοινωνία στην περιοχή μας;',
          proposalSolution: 'Εισαγωγή ηλεκτρικών λεωφορείων και επέκταση του δικτύου ποδηλατοδρόμων με στόχο μείωση των εκπομπών CO2 κατά 30% έως το 2030.',
          responseDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          similarProposals: [
            { id: 2, question: 'Βελτίωση ποδηλατοδρόμων στο κέντρο', state: 'voting' },
            { id: 3, question: 'Δωρεάν εισιτήρια για μαθητές', state: 'deliberation' },
          ],
        });
        setLoading(false);
      });
  }, [assignmentId]);

  const refreshAttendance = useCallback(async (proposalId: number) => {
    try {
      const resp = await api.get<AttendanceState>(`/api/proposals/${proposalId}/attendance`);
      setAttendance(resp.data);
    } catch {
      setAttendance(null);
    }
  }, []);

  const refreshRevisions = useCallback(async (proposalId: number) => {
    try {
      const resp = await api.get<Array<{ id: number; text: string; authorName: string }>>(
        `/api/proposals/${proposalId}/sortition-amendments`,
      );
      setRevisions(resp.data);
    } catch {
      setRevisions([]);
    }
  }, []);

  useEffect(() => {
    if (assignment?.proposalId) {
      void refreshAttendance(assignment.proposalId);
      void refreshRevisions(assignment.proposalId);
    }
  }, [assignment?.proposalId, refreshAttendance, refreshRevisions]);

  const handleAttendance = async (status: 'accepted' | 'declined') => {
    if (!assignment?.proposalId || attendanceSubmitting) return;
    setAttendanceSubmitting(true);
    setAttendanceError(null);
    try {
      await api.post(`/api/proposals/${assignment.proposalId}/attendance`, {
        status,
        memberId: assignment.id,
      });
      await refreshAttendance(assignment.proposalId);
    } catch (e) {
      setAttendanceError(e instanceof ApiError ? e.message : t('sortition.attendance.failed'));
    } finally {
      setAttendanceSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!assignmentId) return;
    
    setSubmitting(true);
    setScoreError(null);
    try {
      await api.post(`/api/sortition/assignments/${assignmentId}/score`, {
        score,
        feedback,
      });
      setSubmitted(true);
    } catch (error) {
      setScoreError(error instanceof ApiError ? error.message : t('sortition.scoring.submitFailed'));
    }
    setSubmitting(false);
  };

  const handleAddRevision = async () => {
    if (!assignment?.proposalId || !revisionText.trim() || revisionSubmitting) return;
    setRevisionSubmitting(true);
    try {
      await api.post(`/api/proposals/${assignment.proposalId}/sortition-amendments`, {
        text: revisionText.trim(),
      });
      setRevisionText('');
      await refreshRevisions(assignment.proposalId);
    } catch (error) {
      console.error('Failed to submit revision:', error);
    } finally {
      setRevisionSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Shell>
        <div className="py-16 text-center text-muted-foreground">{t('general.loading')}</div>
      </Shell>
    );
  }

  if (!assignment) {
    return (
      <Shell>
        <div className="py-16 text-center text-muted-foreground">
          {t('sortition.scoring.assignmentNotFound')}
        </div>
      </Shell>
    );
  }

  const timeRemaining = new Date(assignment.responseDeadline).getTime() - Date.now();
  const hoursRemaining = Math.max(0, Math.floor(timeRemaining / (1000 * 60 * 60)));

  if (submitted) {
    return (
      <Shell>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              {t('sortition.scoring.scoreSubmitted')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p>{t('sortition.scoring.scoreRecorded')}</p>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{t('sortition.scoring.proposalReview')}</span>
            <Badge variant={hoursRemaining < 24 ? 'destructive' : 'secondary'}>
              <Clock className="w-3 h-3 mr-1" />
              {t('sortition.scoring.hoursRemaining', { hours: hoursRemaining })}
            </Badge>
          </CardTitle>
          <CardDescription>
            {t('sortition.scoring.description')}
          </CardDescription>
        </CardHeader>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t('sortition.scoring.proposal')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-1">{t('proposal.question')}</h4>
              <p>{assignment.proposalQuestion}</p>
            </div>
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-1">{t('sortition.scoring.proposedSolution')}</h4>
              <p>{assignment.proposalSolution}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Attendance confirmation */}
      <Card className="mb-6" data-testid="attendance-card">
        <CardHeader>
          <CardTitle className="text-base">{t('sortition.attendance.title')}</CardTitle>
          <CardDescription>{t('sortition.attendance.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {attendance && attendance.summary.total > 0 && (
            <div className="mb-4">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>{t('sortition.attendance.confirmedRate')}</span>
                <span>
                  {attendance.summary.accepted + attendance.summary.completed}/{attendance.summary.total}
                  {' '}({Math.round(attendance.summary.confirmedPct * 100)}%)
                </span>
              </div>
              <Progress value={attendance.summary.confirmedPct * 100} className="h-2" />
            </div>
          )}

          {attendance?.userAttendance ? (
            <div className="flex items-center gap-2 text-sm">
              <Badge variant={attendance.userAttendance.status === 'declined' ? 'destructive' : 'default'}>
                {t(`sortition.attendance.status.${attendance.userAttendance.status}`)}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                disabled={attendanceSubmitting}
                onClick={() =>
                  handleAttendance(
                    attendance.userAttendance!.status === 'accepted' ? 'declined' : 'accepted',
                  )
                }
              >
                {t('sortition.attendance.changeResponse')}
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={attendanceSubmitting}
                onClick={() => handleAttendance('accepted')}
                data-testid="attendance-confirm"
              >
                <ThumbsUp className="w-4 h-4 mr-1" />
                {t('sortition.attendance.confirm')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={attendanceSubmitting}
                onClick={() => handleAttendance('declined')}
                data-testid="attendance-decline"
              >
                <ThumbsDown className="w-4 h-4 mr-1" />
                {t('sortition.attendance.decline')}
              </Button>
            </div>
          )}
          {attendanceError && (
            <div className="mt-3 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              <XCircle className="w-4 h-4 shrink-0" />
              <span>{attendanceError}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {assignment.similarProposals.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-sm">{t('sortition.scoring.similarProposals')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {assignment.similarProposals.map((p) => (
                <div key={p.id} className="p-3 border rounded">
                  <div className="font-medium text-sm">{p.question}</div>
                  <Badge variant="outline" className="mt-1">{p.state}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t('sortition.scoring.yourEvaluation')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-sm font-medium">{t('sortition.scoring.qualityScore')}</label>
                <span className="text-sm font-mono">{score}/100</span>
              </div>
              <Slider
                value={[score]}
                onValueChange={([v]) => setScore(v)}
                max={100}
                step={1}
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>{t('sortition.scoring.returnToAuthor')}</span>
                <span>{t('sortition.scoring.sortitionReview')}</span>
                <span>{t('sortition.scoring.autoApprove')}</span>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">{t('sortition.scoring.feedbackOptional')}</label>
              <Textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder={t('sortition.scoring.feedbackPlaceholder')}
                rows={4}
              />
            </div>

            <div className="p-4 bg-muted rounded">
              <h4 className="text-sm font-medium mb-2">{t('sortition.scoring.scoringGuidelines')}</h4>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>{t('sortition.scoring.guidelineLow')}</li>
                <li>{t('sortition.scoring.guidelineMid')}</li>
                <li>{t('sortition.scoring.guidelineHigh')}</li>
              </ul>
            </div>

            {scoreError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                <XCircle className="w-4 h-4 shrink-0" />
                <span>{scoreError}</span>
              </div>
            )}
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? t('sortition.scoring.submitting') : t('sortition.scoring.submitScore')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Propose revisions — each becomes an amendment on the original */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t('sortition.revisions.title')}</CardTitle>
          <CardDescription>{t('sortition.revisions.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {revisions.length > 0 && (
              <div className="space-y-2">
                {revisions.map((r) => (
                  <div key={r.id} className="p-3 border rounded text-sm">
                    <div className="text-xs text-muted-foreground mb-1">{r.authorName}</div>
                    <p className="whitespace-pre-wrap">{r.text}</p>
                  </div>
                ))}
              </div>
            )}
            <Textarea
              value={revisionText}
              onChange={(e) => setRevisionText(e.target.value)}
              placeholder={t('sortition.revisions.placeholder')}
              rows={3}
            />
            <Button
              onClick={handleAddRevision}
              disabled={revisionSubmitting || !revisionText.trim()}
              variant="outline"
            >
              {revisionSubmitting ? t('sortition.revisions.adding') : t('sortition.revisions.add')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </Shell>
  );
}
