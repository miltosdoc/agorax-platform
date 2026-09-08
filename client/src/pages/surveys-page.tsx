/**
 * Surveys hub — live + closed polls for everyone, the caller's drafts, and
 * the panel-enrollment call-to-action. The two tiers carry a hard visual
 * split: community polls are amber-flagged unofficial, certified polls are
 * the platform's published findings. Fully bilingual (el/en).
 */
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import AppShell from '@/components/layout/AppShell';
import { DiscoveryRail } from '@/components/rails/discovery-rail';
import { EntityCard } from '@/components/cards/entity-card';
import { CARD_STACK } from '@/components/rails/rail-section';
import { AgoraFeedRail } from '@/components/rails/agora-feed-rail';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, KeyRound, PlusCircle, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { useTranslation } from '@/hooks/use-translation';
import { fetchPanelMe } from '@/lib/panel-client';
import ShareButton from '@/components/ShareButton';
import HowPollsWork from '@/components/surveys/HowPollsWork';
import TierBadge from '@/components/surveys/TierBadge';
import { EmptyState, LoadingState } from '@/components/ui/empty-state';

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
      leftRail={<DiscoveryRail />}
      rightRail={<AgoraFeedRail />}
      title={t('surveys.title')}
      actions={user ? (
        <div className="flex gap-2">
          {/* Non-members get the enrollment card below instead — one path each. */}
          {isPanelist && (
            <Button size="sm" variant="outline" onClick={() => navigate('/panel')}>
              <KeyRound className="w-4 h-4 mr-1" /> {t('surveys.panelButton')}
            </Button>
          )}
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

      {/* "Panel" is jargon on first contact, and the full explanation was
          buried behind the dialog above. Say the essential part in place. */}
      <div
        className="mb-6 rounded-lg border bg-sunken/50 p-4"
        data-testid="panel-explainer"
      >
        <div className="flex items-start gap-3">
          <Users className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="space-y-1">
            <p className="text-sm font-medium">{t('surveys.panelExplainer.title')}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t('surveys.panelExplainer.body')}
            </p>
          </div>
        </div>
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

      {polls === null && <LoadingState label={t('surveys.loading')} />}

      {polls !== null && list.length === 0 && (
        <EmptyState icon={<BarChart3 className="h-12 w-12" />} title={t('surveys.empty')} />
      )}

      {/* Same card language and gap as the feed, proposals and the rails. */}
      <div className={CARD_STACK}>
        {list.map((poll) => {
          const live = poll.status === 'live';
          const openable = live || poll.status === 'closed' || (user && poll.creatorId === user.id);
          return (
            <EntityCard
              key={poll.id}
              subject="survey"
              kindLabel={t('nav.surveys')}
              id={poll.id}
              title={poll.title}
              excerpt={poll.topicTag}
              href={live ? `/surveys/${poll.id}/take` : `/surveys/${poll.id}`}
              ctaLabel={live
                ? t('surveys.take')
                : poll.status === 'draft' ? t('surveys.previewPublish') : t('surveys.results')}
              tag={poll.topicTag}
              badge={
                <span className="flex items-center gap-1.5">
                  <TierBadge tier={poll.tier} />
                  <Badge variant="secondary">{t(`surveys.status.${poll.status}`)}</Badge>
                </span>
              }
              bookmarkKind="survey"
              thumbnailKey={(poll as { thumbnailKey?: string | null }).thumbnailKey}
              meta={
                poll.completion ? (
                  <span className="text-xs text-ink-faint">
                    {t('surveys.completions', { n: poll.completion.completed })}
                  </span>
                ) : undefined
              }
            />
          );
        })}
      </div>
    </AppShell>
  );
}
