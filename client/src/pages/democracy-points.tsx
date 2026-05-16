/**
 * Democracy Points — the citizen-facing contribution page.
 *
 * Shows the viewer's balance and ledger, the published earning schedule, and
 * an honest explainer: points record civic contribution, they are not a
 * token, and they carry no monetary value until the platform has revenue.
 */

import { useEffect, useState } from 'react';
import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Award, Coins, History, Info, Lock } from 'lucide-react';
import { api } from '@/lib/api';
import { useTranslation } from '@/hooks/use-translation';

interface PointTxn {
  id: number;
  kind: string;
  points: number;
  actionKey: string;
  refType: string;
  refId: number;
  note: string | null;
  createdAt: string;
}
interface PointSummary {
  balance: number;
  lifetimeEarned: number;
  transactions: PointTxn[];
}
interface ScheduleRule {
  actionKey: string;
  points: number;
  label: string;
  cap?: { windowDays: number; max: number };
}
interface EconomySchedule {
  phase: string;
  pointsPerEur: number;
  redemptionOpen: boolean;
  schedule: ScheduleRule[];
}

export default function DemocracyPointsPage() {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<PointSummary | null>(null);
  const [economy, setEconomy] = useState<EconomySchedule | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = `AgoraX — ${t('points.title')}`;
    Promise.all([
      api.get<PointSummary>('/api/me/points').then((r) => r.data).catch(() => null),
      api.get<EconomySchedule>('/api/economy/schedule').then((r) => r.data).catch(() => null),
    ]).then(([s, e]) => {
      setSummary(s);
      setEconomy(e);
      setLoading(false);
    });
  }, []);

  const actionLabel = (key: string): string => t(`points.action.${key}`) || key;

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow pt-16 pb-12">
        <div className="container mx-auto px-4 max-w-3xl space-y-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Coins className="w-6 h-6 text-amber-500" />
              {t('points.title')}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">{t('points.subtitle')}</p>
          </div>

          {loading ? (
            <div className="py-16 text-center text-muted-foreground">
              {t('general.loading')}
            </div>
          ) : (
            <>
              {/* Balance */}
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="p-5">
                    <div className="text-xs text-muted-foreground mb-1">
                      {t('points.balance')}
                    </div>
                    <div className="text-3xl font-bold">{summary?.balance ?? 0}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-5">
                    <div className="text-xs text-muted-foreground mb-1">
                      {t('points.lifetime')}
                    </div>
                    <div className="text-3xl font-bold">
                      {summary?.lifetimeEarned ?? 0}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Honest explainer */}
              <Card className="border-amber-200 bg-amber-50/50">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Info className="w-4 h-4" />
                    {t('points.honestTitle')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-amber-900">
                  <p>{t('points.honestBody')}</p>
                  <p className="flex items-start gap-2">
                    <Lock className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{t('points.honestRedemption')}</span>
                  </p>
                </CardContent>
              </Card>

              {/* Earning schedule */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Award className="w-4 h-4" />
                    {t('points.scheduleTitle')}
                  </CardTitle>
                  <CardDescription>{t('points.scheduleHint')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {economy?.schedule.map((rule) => (
                      <div
                        key={rule.actionKey}
                        className="flex items-center justify-between gap-3 border rounded p-3"
                      >
                        <div className="text-sm">
                          <div className="font-medium">{actionLabel(rule.actionKey)}</div>
                          {rule.cap && (
                            <div className="text-xs text-muted-foreground">
                              {t('points.cap', {
                                max: rule.cap.max,
                                days: rule.cap.windowDays,
                              })}
                            </div>
                          )}
                        </div>
                        <Badge variant="secondary" className="shrink-0">
                          +{rule.points}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Contribution history */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <History className="w-4 h-4" />
                    {t('points.historyTitle')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {summary && summary.transactions.length > 0 ? (
                    <div className="divide-y">
                      {summary.transactions.map((txn) => (
                        <div
                          key={txn.id}
                          className="flex items-center justify-between gap-3 py-2 text-sm"
                        >
                          <div>
                            <div>{actionLabel(txn.actionKey)}</div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(txn.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                          <span
                            className={
                              txn.points >= 0
                                ? 'font-medium text-green-700'
                                : 'font-medium text-red-700'
                            }
                          >
                            {txn.points >= 0 ? '+' : ''}
                            {txn.points}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      {t('points.historyEmpty')}
                    </p>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
