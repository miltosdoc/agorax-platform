/**
 * Sortition Dashboard
 *
 * Lists every sortition body across the user's communities, with status
 * filters, response/score summaries, and a deep-link into the per-body
 * detail view.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import AppShell from '@/components/layout/AppShell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Clock, Users, ArrowRight, CheckCircle2, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';

type BodyStatus = 'selecting' | 'active' | 'completed' | 'timeout';

interface DashboardBody {
  id: number;
  communityId: number;
  communityName: string | null;
  proposalId: number | null;
  proposalQuestion: string | null;
  purpose: string;
  status: BodyStatus;
  size: number;
  memberCount: number;
  respondedCount: number;
  averageScore: number | null;
  selectedAt: string | null;
  completedAt: string | null;
  deadline: string | null;
  isMember: boolean;
  userAssignmentId: number | null;
  userResponded: boolean;
}

type Filter = 'all' | 'active' | 'completed' | 'timeout';

function formatCountdown(deadline: string | null): string {
  if (!deadline) return '—';
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return 'Λήξη';
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 1) {
    const minutes = Math.max(1, Math.floor(ms / (1000 * 60)));
    return `${minutes} λεπτά`;
  }
  if (hours < 24) return `${hours} ώρες`;
  const days = Math.floor(hours / 24);
  return `${days} ημέρες`;
}

function statusVariant(status: BodyStatus) {
  switch (status) {
    case 'active': return 'default';
    case 'completed': return 'secondary';
    case 'timeout': return 'destructive';
    case 'selecting': return 'outline';
  }
}

export default function SortitionDashboardPage() {
  const [, navigate] = useLocation();
  const [bodies, setBodies] = useState<DashboardBody[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    api.get<DashboardBody[]>('/api/sortition/my-bodies')
      .then((resp) => setBodies(resp.data))
      .catch((e) => setError(e?.message ?? 'Σφάλμα φόρτωσης'));
  }, []);

  const filtered = useMemo(() => {
    if (!bodies) return [];
    if (filter === 'all') return bodies;
    if (filter === 'active') return bodies.filter(b => b.status === 'active' || b.status === 'selecting');
    if (filter === 'completed') return bodies.filter(b => b.status === 'completed');
    return bodies.filter(b => b.status === 'timeout');
  }, [bodies, filter]);

  return (
    <AppShell title="Κληρωτά Σώματα">
      <p className="text-sm text-muted-foreground -mt-4 mb-6">
        Κάθε σώμα στο οποίο μπορείς να συμμετάσχεις ή να παρακολουθήσεις.
      </p>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)} className="mb-6">
          <TabsList>
            <TabsTrigger value="all">Όλα</TabsTrigger>
            <TabsTrigger value="active">Ενεργά</TabsTrigger>
            <TabsTrigger value="completed">Ολοκληρωμένα</TabsTrigger>
            <TabsTrigger value="timeout">Σε λήξη</TabsTrigger>
          </TabsList>
          <TabsContent value={filter}>
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700 mb-4 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> {error}
              </div>
            )}

            {bodies === null && !error && (
              <div className="py-12 text-center text-sm text-muted-foreground">Φόρτωση…</div>
            )}

            {bodies && filtered.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  Δεν υπάρχουν κληρωτά σώματα για το συγκεκριμένο φίλτρο.
                </CardContent>
              </Card>
            )}

            <div className="grid gap-4">
              {filtered.map((body) => {
                const responseRate = body.memberCount > 0
                  ? Math.round((body.respondedCount / body.memberCount) * 100)
                  : 0;

                return (
                  <Card
                    key={body.id}
                    className="cursor-pointer hover:border-primary/40 transition-colors"
                    onClick={() => navigate(`/sortition/body/${body.id}`)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <CardTitle className="text-base truncate">
                            {body.proposalQuestion ?? body.purpose}
                          </CardTitle>
                          <CardDescription className="truncate">
                            {body.communityName ?? `Κοινότητα #${body.communityId}`} · {body.purpose}
                          </CardDescription>
                        </div>
                        <Badge variant={statusVariant(body.status)}>
                          {body.status === 'completed' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                          {body.status === 'timeout' && <AlertTriangle className="w-3 h-3 mr-1" />}
                          {body.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                        <div>
                          <div className="text-xs text-muted-foreground">Μέγεθος</div>
                          <div className="flex items-center gap-1 font-medium">
                            <Users className="w-3.5 h-3.5" /> {body.memberCount}/{body.size}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Απαντήσεις</div>
                          <div className="font-medium">{body.respondedCount}/{body.memberCount}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Μέσος όρος</div>
                          <div className="font-medium">
                            {body.averageScore !== null ? body.averageScore.toFixed(1) : '—'}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Προθεσμία</div>
                          <div className="flex items-center gap-1 font-medium">
                            <Clock className="w-3.5 h-3.5" />
                            {body.status === 'active' ? formatCountdown(body.deadline) : '—'}
                          </div>
                        </div>
                      </div>

                      <Progress value={responseRate} className="h-1.5" />

                      <div className="flex items-center justify-between">
                        {body.isMember && body.userAssignmentId && !body.userResponded && body.status === 'active' ? (
                          <Link href={`/sortition/${body.userAssignmentId}`}>
                            <Button size="sm" onClick={(e) => e.stopPropagation()}>
                              Η αξιολόγησή σου <ArrowRight className="w-3.5 h-3.5 ml-1" />
                            </Button>
                          </Link>
                        ) : body.isMember ? (
                          <Badge variant="outline">Είσαι μέλος</Badge>
                        ) : (
                          <span />
                        )}
                        <Link href={`/sortition/body/${body.id}`}>
                          <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()}>
                            Λεπτομέρειες
                          </Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
      </Tabs>
    </AppShell>
  );
}
