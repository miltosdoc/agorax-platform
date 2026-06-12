/**
 * Surveys hub — live + closed polls for everyone, the caller's drafts, and
 * the panel-enrollment call-to-action. The two tiers carry a hard visual
 * split: community polls are amber-flagged unofficial, certified polls are
 * the platform's published findings. Fully bilingual (el/en).
 */
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import AppShell from '@/components/layout/AppShell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, KeyRound, PlusCircle, ShieldCheck, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { useTranslation } from '@/hooks/use-translation';
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
  const { t } = useTranslation();
  return tier === 'certified' ? (
    <Badge className="bg-primary"><ShieldCheck className="w-3 h-3 mr-1" />{t('surveys.tier.certified')}</Badge>
  ) : (
    <Badge variant="outline" className="border-amber-400 text-amber-700 bg-amber-50">
      {t('surveys.tier.community')}
    </Badge>
  );
}

export default function SurveysPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
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
      title={t('surveys.title')}
      actions={user ? (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => navigate('/panel')}>
            <KeyRound className="w-4 h-4 mr-1" /> {t('surveys.panelButton')}
          </Button>
          <Button size="sm" onClick={() => navigate('/surveys/new')}>
            <PlusCircle className="w-4 h-4 mr-1" /> {t('surveys.new')}
          </Button>
        </div>
      ) : undefined}
    >
      <div className="flex items-center justify-between gap-2 -mt-4 mb-4 flex-wrap">
        <p className="text-sm text-muted-foreground">{t('surveys.subtitle')}</p>
        <HowPollsWork />
      </div>

      {isPanelist === false && (
        <Card className="mb-6 border-primary/40">
          <CardContent className="py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <Users className="w-6 h-6 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm">{t('surveys.panelCta.title')}</p>
                <p className="text-xs text-muted-foreground">{t('surveys.panelCta.body')}</p>
              </div>
            </div>
            <Button size="sm" onClick={() => navigate('/panel')}>{t('surveys.panelCta.button')}</Button>
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mb-4">
        <TabsList>
          <TabsTrigger value="open">{t('surveys.tabs.open')}</TabsTrigger>
          <TabsTrigger value="closed">{t('surveys.tabs.closed')}</TabsTrigger>
          {user && <TabsTrigger value="mine">{t('surveys.tabs.mine')}</TabsTrigger>}
        </TabsList>
      </Tabs>

      {polls === null && <div className="py-12 text-center text-sm text-muted-foreground">{t('surveys.loading')}</div>}

      {polls !== null && list.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {t('surveys.empty')}
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
                  <Badge variant="secondary">{t(`surveys.status.${poll.status}`)}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {poll.completion ? t('surveys.completions', { n: poll.completion.completed }) : ''}
              </span>
              <div className="flex gap-2">
                {(poll.status === 'live' || poll.status === 'closed') && (
                  <ShareButton url={`/surveys/${poll.id}`} title={poll.title} text={poll.topicTag} variant="ghost" iconOnly />
                )}
                {poll.status === 'live' && (
                  <Link href={`/surveys/${poll.id}/take`}>
                    <Button size="sm">{t('surveys.take')}</Button>
                  </Link>
                )}
                {(poll.status === 'closed' || (user && poll.creatorId === user.id)) && (
                  <Link href={`/surveys/${poll.id}`}>
                    <Button size="sm" variant="ghost">
                      <BarChart3 className="w-4 h-4 mr-1" />
                      {poll.status === 'draft' ? t('surveys.previewPublish') : t('surveys.results')}
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
