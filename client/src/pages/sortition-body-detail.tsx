/**
 * Sortition Body Detail
 *
 * Drill-down view of a single sortition body — member roster with
 * individual scores and feedback, plus headline metrics.
 */

import { useEffect, useState } from 'react';
import { useParams, Link } from 'wouter';
import AppShell from '@/components/layout/AppShell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, CheckCircle2, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { SortitionRoomSection } from '@/components/livekit/SortitionRoomSection';

interface BodyMember {
  id: number;
  userId: number;
  responded: boolean;
  score: string | null;
  feedback: string | null;
  scoredAt: string | null;
  user: { id: number; name: string; username: string } | null;
}

interface BodyDetail {
  id: number;
  communityId: number;
  proposalId: number | null;
  purpose: string;
  size: number;
  responseHours: number | null;
  status: string;
  selectedAt: string | null;
  completedAt: string | null;
  members: BodyMember[];
  memberCount: number;
}

export default function SortitionBodyDetailPage() {
  const params = useParams();
  const bodyId = params.bodyId;
  const [body, setBody] = useState<BodyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bodyId) return;
    api.get<BodyDetail>(`/api/sortition/${bodyId}`)
      .then((resp) => setBody(resp.data))
      .catch((e) => setError(e?.message ?? 'Σφάλμα φόρτωσης'));
  }, [bodyId]);

  const respondedCount = body?.members.filter(m => m.responded).length ?? 0;
  const scores = body?.members
    .filter(m => m.responded && m.score !== null)
    .map(m => parseFloat(m.score as string))
    .filter(n => Number.isFinite(n)) ?? [];
  const average = scores.length
    ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
    : null;

  return (
    <AppShell
      title="Σώμα τυχαίας επιλογής"
      breadcrumb={[{ label: "Σώματα", href: "/sortition" }]}
    >
        <Link href="/sortition">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-1" /> Όλα τα σώματα
          </Button>
        </Link>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700 mb-4">
            {error}
          </div>
        )}

        {!body && !error && (
          <div className="py-12 text-center text-sm text-muted-foreground">Φόρτωση…</div>
        )}

        {body && (
          <>
            <Card className="mb-6">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Κληρωτό σώμα #{body.id}</CardTitle>
                  <Badge variant={body.status === 'completed' ? 'secondary' : 'default'}>
                    {body.status}
                  </Badge>
                </div>
                <CardDescription>{body.purpose}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Μέλη</div>
                    <div className="font-medium">{body.memberCount}/{body.size}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Απαντήσεις</div>
                    <div className="font-medium">{respondedCount}/{body.memberCount}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Μέσος όρος</div>
                    <div className="font-medium">{average !== null ? average.toFixed(1) : '—'}</div>
                  </div>
                </div>
                {body.proposalId && (
                  <div className="mt-4">
                    <Link href={`/proposals/${body.proposalId}`}>
                      <Button variant="outline" size="sm">Στο προβούλευμα →</Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="mb-6">
              <SortitionRoomSection bodyId={body.id} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Μέλη</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {body.members.map((m) => (
                    <div key={m.id} className="py-3 flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="font-medium text-sm">
                          {m.user?.name ?? `Χρήστης #${m.userId}`}
                        </div>
                        {m.user?.username && (
                          <div className="text-xs text-muted-foreground">@{m.user.username}</div>
                        )}
                        {m.feedback && (
                          <div className="text-xs text-muted-foreground mt-1 italic">
                            "{m.feedback}"
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        {m.responded ? (
                          <>
                            <div className="text-sm font-mono font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5 text-green-600 inline mr-1" />
                              {m.score ?? '—'}
                            </div>
                            {m.scoredAt && (
                              <div className="text-xs text-muted-foreground">
                                {new Date(m.scoredAt).toLocaleDateString()}
                              </div>
                            )}
                          </>
                        ) : (
                          <Badge variant="outline" className="text-xs">
                            <Clock className="w-3 h-3 mr-1" /> Εκκρεμεί
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        )}
    </AppShell>
  );
}
