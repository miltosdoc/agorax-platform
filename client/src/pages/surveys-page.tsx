/**
 * Surveys hub — live + closed polls for everyone, the caller's drafts, and
 * the panel-enrollment call-to-action. The two tiers carry a hard visual
 * split: community polls are amber-flagged «Ανεπίσημη», certified polls are
 * the platform's published findings.
 */
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import AppShell from '@/components/layout/AppShell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, PlusCircle, ShieldCheck, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { fetchPanelMe } from '@/lib/panel-client';
import ShareButton from '@/components/ShareButton';
import HowPollsWork from '@/components/surveys/HowPollsWork';

interface SurveyListPoll {
  id: number;
  tier: 'community' | 'certified';
  title: string;
  topicTag: string;
  status: string;
  creatorId: number | null;
  createdAt: string;
  completion: { completed: number; qualityPassed: number } | null;
}

export function TierBadge({ tier }: { tier: string }) {
  return tier === 'certified' ? (
    <Badge className="bg-primary"><ShieldCheck className="w-3 h-3 mr-1" />Πιστοποιημένη</Badge>
  ) : (
    <Badge variant="outline" className="border-amber-400 text-amber-700 bg-amber-50">
      Κοινοτική · Ανεπίσημη
    </Badge>
  );
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Πρόχειρο',
  live: 'Σε εξέλιξη',
  closed: 'Ολοκληρώθηκε',
  gatekeeper_flagged: 'Απορρίφθηκε',
};

export default function SurveysPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [polls, setPolls] = useState<SurveyListPoll[] | null>(null);
  const [mine, setMine] = useState<SurveyListPoll[]>([]);
  const [isPanelist, setIsPanelist] = useState<boolean | null>(null);
  const [tab, setTab] = useState<'open' | 'closed' | 'mine'>('open');

  useEffect(() => {
    api.get<SurveyListPoll[]>('/api/surveys').then((r) => setPolls(r.data)).catch(() => setPolls([]));
    if (user) {
      api.get<SurveyListPoll[]>('/api/surveys?mine=1').then((r) => setMine(r.data)).catch(() => {});
    }
    fetchPanelMe().then((me) => setIsPanelist(!!me)).catch(() => setIsPanelist(false));
  }, [user]);

  const list = tab === 'mine' ? mine
    : (polls ?? []).filter((p) => (tab === 'open' ? p.status === 'live' : p.status === 'closed'));

  return (
    <AppShell
      title="Δημοσκοπήσεις"
      actions={user ? (
        <Button size="sm" onClick={() => navigate('/surveys/new')}>
          <PlusCircle className="w-4 h-4 mr-1" /> Νέα δημοσκόπηση
        </Button>
      ) : undefined}
    >
      <p className="text-sm text-muted-foreground -mt-4 mb-4">
        Ανοιχτή πλατφόρμα μέτρησης της κοινής γνώμης — με πλήρη μεθοδολογική
        διαφάνεια σε κάθε αποτέλεσμα.
      </p>

      {isPanelist === false && (
        <Card className="mb-6 border-primary/40">
          <CardContent className="py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <Users className="w-6 h-6 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm">Γίνε μέλος του ανώνυμου πάνελ</p>
                <p className="text-xs text-muted-foreground">
                  Απάντησε σε δημοσκοπήσεις και κέρδισε Πόντους Δημοκρατίας. Οι
                  απαντήσεις σου δεν συνδέονται ποτέ με την ταυτότητά σου.
                </p>
              </div>
            </div>
            <Button size="sm" onClick={() => navigate('/panel')}>Εγγραφή στο πάνελ</Button>
          </CardContent>
        </Card>
      )}

      <HowPollsWork />

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mb-4">
        <TabsList>
          <TabsTrigger value="open">Ενεργές</TabsTrigger>
          <TabsTrigger value="closed">Ολοκληρωμένες</TabsTrigger>
          {user && <TabsTrigger value="mine">Οι δικές μου</TabsTrigger>}
        </TabsList>
      </Tabs>

      {polls === null && <div className="py-12 text-center text-sm text-muted-foreground">Φόρτωση…</div>}

      {polls !== null && list.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Δεν υπάρχουν δημοσκοπήσεις εδώ ακόμη.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {list.map((poll) => (
          <Card key={poll.id} className="hover:border-primary/40 transition-colors">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-base">{poll.title}</CardTitle>
                  <CardDescription>{poll.topicTag}</CardDescription>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <TierBadge tier={poll.tier} />
                  <Badge variant="secondary">{STATUS_LABELS[poll.status] ?? poll.status}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {poll.completion ? `${poll.completion.completed} συμμετοχές` : ''}
              </span>
              <div className="flex gap-2">
                {(poll.status === 'live' || poll.status === 'closed') && (
                  <ShareButton url={`/surveys/${poll.id}`} title={poll.title} text={poll.topicTag} variant="ghost" iconOnly />
                )}
                {poll.status === 'live' && (
                  <Link href={`/surveys/${poll.id}/take`}>
                    <Button size="sm">Συμμετοχή</Button>
                  </Link>
                )}
                {(poll.status === 'closed' || (user && poll.creatorId === user.id)) && (
                  <Link href={`/surveys/${poll.id}`}>
                    <Button size="sm" variant="ghost">
                      <BarChart3 className="w-4 h-4 mr-1" />
                      {poll.status === 'draft' ? 'Προεπισκόπηση & δημοσίευση' : 'Αποτελέσματα'}
                    </Button>
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
