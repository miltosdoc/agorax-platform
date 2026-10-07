/**
 * Surveys hub — live + closed polls for everyone, the caller's drafts, and
 * the panel-enrollment call-to-action. The two tiers carry a hard visual
 * split: community polls are amber-flagged unofficial, certified polls are
 * the platform's published findings. Fully bilingual (el/en).
 */
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import AppShell from '@/components/layout/AppShell';
import { EntityCard } from '@/components/cards/entity-card';
import { CARD_STACK } from '@/components/rails/rail-section';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, KeyRound, PlusCircle, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { useTranslation } from '@/hooks/use-translation';
import { fetchPanelMe } from '@/lib/panel-client';
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
  const { t, locale } = useTranslation();
  const [, navigate] = useLocation();
  const [polls, setPolls] = useState<SurveyListPoll[] | null>(null);
  const [mine, setMine] = useState<SurveyListPoll[] | null>(null);
  const [listError, setListError] = useState(false);
  const [mineError, setMineError] = useState(false);
  const [reload, setReload] = useState(0);
  const [isPanelist, setIsPanelist] = useState<boolean | null>(null);
  const [tab, setTab] = useState<'open' | 'closed' | 'mine'>('open');

  useEffect(() => {
    let cancelled = false;
    setPolls(null);
    setMine(null);
    setListError(false);
    setMineError(false);
    api.get<SurveyListPoll[]>('/api/surveys')
      .then((r) => { if (!cancelled) setPolls(r.data); })
      .catch(() => { if (!cancelled) setListError(true); });
    if (user) {
      api.get<SurveyListPoll[]>('/api/surveys?mine=1')
        .then((r) => { if (!cancelled) setMine(r.data); })
        .catch(() => { if (!cancelled) setMineError(true); });
    } else {
      setMine([]);
      setTab((previous) => previous === 'mine' ? 'open' : previous);
    }
    fetchPanelMe()
      .then((me) => { if (!cancelled) setIsPanelist(!!me); })
      .catch(() => { if (!cancelled) setIsPanelist(false); });
    return () => { cancelled = true; };
  }, [user?.id, reload]);

  const list = tab === 'mine' ? (mine ?? [])
    : (polls ?? []).filter((p) => (tab === 'open' ? p.status === 'live' : p.status === 'closed'));
  const failed = tab === 'mine' ? mineError : listError;
  const loading = !failed && (tab === 'mine' ? mine === null : polls === null);
  const openCount = polls?.filter((poll) => poll.status === 'live').length;
  const closedCount = polls?.filter((poll) => poll.status === 'closed').length;

  return (
    <AppShell
      title={t('surveys.title')}
      actions={(
        <div className="flex gap-2">
          {/* Non-members get the enrollment card below instead — one path each. */}
          {isPanelist && (
            <Button size="sm" variant="outline" onClick={() => navigate('/panel')}>
              <KeyRound className="w-4 h-4 mr-1" /> {t('surveys.panelButton')}
            </Button>
          )}
          <Button size="sm" onClick={() => navigate('/surveys/new')}>
            <PlusCircle className="w-4 h-4 mr-1" /> {t(user ? 'surveys.new' : 'redesign.surveys.signInCreate')}
          </Button>
        </div>
      )}
    >
      <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
        <p className="text-base text-muted-foreground">{t('surveys.subtitle')}</p>
        <HowPollsWork />
      </div>

      <div className="mb-6 rounded-lg border bg-muted/30 p-4 sm:p-5">
        <p className="text-base leading-relaxed">{t('redesign.surveys.difference')}</p>
        <Link href="/proposals/new?kind=poll" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">{t('redesign.surveys.communityAction')}</Link>
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
            <p className="text-base font-medium">{t('surveys.panelExplainer.title')}</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
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
                <p className="font-medium text-base">{t('surveys.panelCta.title')}</p>
                <p className="text-sm text-muted-foreground">{t('surveys.panelCta.body')}</p>
              </div>
            </div>
            <Button size="sm" onClick={() => navigate('/panel')}>{t('surveys.panelCta.button')}</Button>
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mb-4">
        <TabsList className="h-auto flex flex-wrap justify-start gap-1">
          <TabsTrigger value="open" className="min-h-11">{t('surveys.tabs.open')}{openCount !== undefined && ` (${openCount})`}</TabsTrigger>
          <TabsTrigger value="closed" className="min-h-11">{t('surveys.tabs.closed')}{closedCount !== undefined && ` (${closedCount})`}</TabsTrigger>
          {user && <TabsTrigger value="mine" className="min-h-11">{t('surveys.tabs.mine')}{mine && ` (${mine.length})`}</TabsTrigger>}
        </TabsList>
      </Tabs>
      <p className="mb-5 text-sm text-muted-foreground">{t(`redesign.surveys.${tab === 'mine' ? 'mine' : tab === 'open' ? 'open' : 'closed'}Hint`)}</p>

      {loading && <LoadingState label={t('surveys.loading')} />}
      {failed && <div role="alert" className="space-y-3 rounded-lg border p-5">
        <p>{t('redesign.surveys.loadFailed')}</p>
        <Button variant="outline" onClick={() => setReload((value) => value + 1)}>{t('redesign.surveys.retry')}</Button>
      </div>}

      {!loading && !failed && list.length === 0 && (
        <EmptyState icon={<BarChart3 className="h-12 w-12" />} title={t(`redesign.surveys.empty${tab === 'mine' ? 'Mine' : tab === 'open' ? 'Open' : 'Closed'}`)} action={user && <Button onClick={() => navigate('/surveys/new')}>{t('surveys.new')}</Button>} />
      )}

      {/* Same card language and gap as the feed, proposals and the rails. */}
      <div className={CARD_STACK}>
        {list.map((poll) => {
          const live = poll.status === 'live';
          const ownDraft = poll.status === 'draft' && user?.id === poll.creatorId;
          return (
            <EntityCard
              key={poll.id}
              subject="survey"
              kindLabel={t('nav.surveys')}
              id={poll.id}
              title={poll.title}
              excerpt={poll.topicTag}
              href={ownDraft ? `/surveys/${poll.id}/edit` : live ? `/surveys/${poll.id}/take` : `/surveys/${poll.id}`}
              ctaLabel={live
                ? t('surveys.take')
                : ownDraft ? t('surveys.previewPublish') : poll.status === 'closed' ? t('surveys.results') : t('redesign.surveys.viewPoll')}
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
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span>{t('redesign.surveys.created', { date: new Date(poll.createdAt).toLocaleDateString(locale === 'en' ? 'en-GB' : 'el-GR') })}</span>
                  {poll.completion && <span>{t('surveys.completions', { n: poll.completion.completed })}</span>}
                </div>
              }
            />
          );
        })}
      </div>
      </div>
    </AppShell>
  );
}
