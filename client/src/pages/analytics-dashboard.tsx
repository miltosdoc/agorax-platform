/**
 * Platform analytics — real aggregates over the current data model:
 * communities, proposals (both tracks), ratification ballots, amendments,
 * debate, surveys, conferences. Replaces the legacy polls-era dashboard
 * that rendered empty stubs.
 *
 * Viz notes (dataviz method): stat tiles for headline numbers; one 30-day
 * activity line chart with a validated 3-hue categorical palette
 * (#2a78d6/#1baf7a/#eda100 — CVD ΔE 47, contrast WARN relieved by the
 * legend, direct series labels and the table view below); a single-hue
 * status bar chart; a community table. One axis per chart, thin marks,
 * hover tooltips everywhere.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, LabelList,
} from 'recharts';
import {
  Users, FileText, Vote, GitPullRequest, BarChart3, Mic, MessagesSquare, Landmark,
} from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';
import { Link } from 'wouter';

type Lang = 'el' | 'en';
const L: Record<Lang, Record<string, string>> = {
  el: {
    title: 'Αναλυτικά Πλατφόρμας',
    subtitle: 'Δημόσια, συγκεντρωτικά στοιχεία — χωρίς προσωπικά δεδομένα.',
    members: 'Μέλη', membersSub: 'νέα σε 30 ημέρες',
    communities: 'Κοινότητες',
    proposals: 'Προτάσεις', proposalsSub: 'άμεσες ψηφοφορίες',
    ballots: 'Ψήφοι', ballotsSub: 'έγκυρα ψηφοδέλτια',
    amendments: 'Τροπολογίες', amendmentsSub: 'ποσοστό αποδοχής',
    debate: 'Συζήτηση', debateSub: 'θέματα & επιχειρήματα',
    surveys: 'Δημοσκοπήσεις', surveysSub: 'απαντήσεις',
    conferences: 'Συνδιασκέψεις',
    activityTitle: 'Δραστηριότητα — τελευταίες 30 ημέρες',
    statusTitle: 'Προτάσεις ανά φάση',
    communitiesTitle: 'Κοινότητες',
    thName: 'Κοινότητα', thMembers: 'Μέλη', thProposals: 'Προτάσεις', thDecided: 'Αποφασισμένες', thScore: 'Δείκτης Δημοκρατίας',
    sProposals: 'Προτάσεις', sAmendments: 'Τροπολογίες', sVotes: 'Ψήφοι',
    active: 'σε ψηφοφορία τώρα', decided: 'αποφασισμένες',
    empty: 'Δεν υπάρχουν ακόμη δεδομένα.',
    error: 'Τα αναλυτικά δεν είναι διαθέσιμα αυτή τη στιγμή.',
  },
  en: {
    title: 'Platform Analytics',
    subtitle: 'Public aggregate figures — no personal data.',
    members: 'Members', membersSub: 'new in 30 days',
    communities: 'Communities',
    proposals: 'Proposals', proposalsSub: 'direct votes',
    ballots: 'Ballots', ballotsSub: 'valid ballots',
    amendments: 'Amendments', amendmentsSub: 'acceptance rate',
    debate: 'Debate', debateSub: 'threads & arguments',
    surveys: 'Polls', surveysSub: 'responses',
    conferences: 'Conferences',
    activityTitle: 'Activity — last 30 days',
    statusTitle: 'Proposals by phase',
    communitiesTitle: 'Communities',
    thName: 'Community', thMembers: 'Members', thProposals: 'Proposals', thDecided: 'Decided', thScore: 'Democracy Score',
    sProposals: 'Proposals', sAmendments: 'Amendments', sVotes: 'Ballots',
    active: 'in voting now', decided: 'decided',
    empty: 'No data yet.',
    error: 'Analytics are unavailable right now.',
  },
};

const STATUS_LABELS: Record<Lang, Record<string, string>> = {
  el: {
    review: 'Έλεγχος', author_review: 'Κρίση συγγραφέα', community_signal: 'Διαβούλευση',
    sortition_synthesis: 'Κλήρωση', final_review: 'Τελικό κείμενο', voting: 'Ψηφοφορία',
    decided: 'Αποφασίστηκε', archived: 'Αρχειοθετήθηκε',
  },
  en: {
    review: 'Review', author_review: 'Author review', community_signal: 'Deliberation',
    sortition_synthesis: 'Sortition', final_review: 'Final text', voting: 'Voting',
    decided: 'Decided', archived: 'Archived',
  },
};
const STATUS_ORDER = ['review', 'author_review', 'community_signal', 'sortition_synthesis', 'final_review', 'voting', 'decided', 'archived'];

// Validated categorical palette (light): blue / aqua / yellow.
const SERIES = { proposals: '#2a78d6', amendments: '#1baf7a', votes: '#eda100' };
const BAR = '#2a78d6';

interface Overview {
  totalUsers: number; newUsers7: number; newUsers30: number;
  totalCommunities: number; totalProposals: number; directVoteProposals: number;
  decidedProposals: number; activeVotes: number; proposalsByStatus: Record<string, number>;
  totalBallots: number; totalAmendments: number; amendmentAcceptRate: number | null;
  totalDebate: number; totalSurveyPolls: number; totalSurveyResponses: number; conferences: number;
}
interface TrendDay { date: string; proposals: number; amendments: number; votes: number; debate: number }
interface CommunityRow { id: number; name: string; democracyScore: number | null; members: number; proposals: number; decided: number }

function StatTile({ icon: Icon, label, value, sub }: { icon: typeof Users; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">{label}</span>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="text-3xl font-serif tabular-nums">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function AnalyticsDashboard() {
  const { locale } = useTranslation();
  const s = L[locale === 'en' ? 'en' : 'el'];
  const statusLabels = STATUS_LABELS[locale === 'en' ? 'en' : 'el'];

  const { data: overview, isLoading: l1, isError: e1 } = useQuery<Overview>({ queryKey: ['/api/analytics/overview'], retry: false });
  const { data: trends, isLoading: l2 } = useQuery<TrendDay[]>({ queryKey: ['/api/analytics/activity-trends'], retry: false });
  const { data: communities, isLoading: l3 } = useQuery<CommunityRow[]>({ queryKey: ['/api/analytics/communities'], retry: false });

  const loading = l1 || l2 || l3;
  const nf = (n: number | undefined | null) => (n ?? 0).toLocaleString(locale === 'en' ? 'en-US' : 'el-GR');

  const statusData = overview
    ? STATUS_ORDER.filter((k) => (overview.proposalsByStatus[k] ?? 0) > 0)
        .map((k) => ({ name: statusLabels[k] ?? k, count: overview.proposalsByStatus[k] }))
    : [];

  const trendData = (trends ?? []).map((d) => ({ ...d, label: d.date.slice(5).replace('-', '/') }));

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <div className="container mx-auto max-w-6xl p-6 pb-16 sm:pb-6 flex-grow">
        <div className="mb-8">
          <h1 className="text-3xl font-serif font-bold mb-1">{s.title}</h1>
          <p className="text-muted-foreground text-sm">{s.subtitle}</p>
        </div>

        {loading ? (
          <div className="animate-pulse space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => <div key={i} className="h-24 bg-muted rounded" />)}
            </div>
            <div className="h-72 bg-muted rounded" />
          </div>
        ) : e1 || !overview ? (
          <Card><CardContent className="p-10 text-center text-muted-foreground">{s.error}</CardContent></Card>
        ) : (
          <>
            {/* Headline numbers */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <StatTile icon={Users} label={s.members} value={nf(overview.totalUsers)} sub={`+${nf(overview.newUsers30)} ${s.membersSub}`} />
              <StatTile icon={Landmark} label={s.communities} value={nf(overview.totalCommunities)} />
              <StatTile icon={FileText} label={s.proposals} value={nf(overview.totalProposals)} sub={`${nf(overview.activeVotes)} ${s.active} · ${nf(overview.decidedProposals)} ${s.decided}`} />
              <StatTile icon={Vote} label={s.ballots} value={nf(overview.totalBallots)} sub={s.ballotsSub} />
              <StatTile
                icon={GitPullRequest}
                label={s.amendments}
                value={nf(overview.totalAmendments)}
                sub={overview.amendmentAcceptRate != null ? `${Math.round(overview.amendmentAcceptRate * 100)}% ${s.amendmentsSub}` : undefined}
              />
              <StatTile icon={MessagesSquare} label={s.debate} value={nf(overview.totalDebate)} sub={s.debateSub} />
              <StatTile icon={BarChart3} label={s.surveys} value={nf(overview.totalSurveyPolls)} sub={`${nf(overview.totalSurveyResponses)} ${s.surveysSub}`} />
              <StatTile icon={Mic} label={s.conferences} value={nf(overview.conferences)} />
            </div>

            {/* 30-day activity */}
            <Card className="mb-8">
              <CardHeader><CardTitle className="text-base">{s.activityTitle}</CardTitle></CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData} margin={{ top: 8, right: 16, bottom: 0, left: -18 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.08} vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval={4} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip />
                      <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="proposals" name={s.sProposals} stroke={SERIES.proposals} strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="amendments" name={s.sAmendments} stroke={SERIES.amendments} strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="votes" name={s.sVotes} stroke={SERIES.votes} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Proposals by phase — single hue, direct labels */}
              <Card>
                <CardHeader><CardTitle className="text-base">{s.statusTitle}</CardTitle></CardHeader>
                <CardContent>
                  {statusData.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">{s.empty}</p>
                  ) : (
                    <div style={{ height: Math.max(160, statusData.length * 44) }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={statusData} layout="vertical" margin={{ top: 0, right: 32, bottom: 0, left: 8 }}>
                          <XAxis type="number" hide />
                          <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                          <Tooltip />
                          <Bar dataKey="count" fill={BAR} radius={[0, 4, 4, 0]} barSize={18}>
                            <LabelList dataKey="count" position="right" style={{ fontSize: 12, fill: 'currentColor' }} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Community table — the accessible view */}
              <Card>
                <CardHeader><CardTitle className="text-base">{s.communitiesTitle}</CardTitle></CardHeader>
                <CardContent className="p-0">
                  {(communities ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">{s.empty}</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
                            <th className="px-4 py-2 font-semibold">{s.thName}</th>
                            <th className="px-2 py-2 font-semibold text-right">{s.thMembers}</th>
                            <th className="px-2 py-2 font-semibold text-right">{s.thProposals}</th>
                            <th className="px-2 py-2 font-semibold text-right">{s.thDecided}</th>
                            <th className="px-4 py-2 font-semibold text-right">{s.thScore}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {(communities ?? []).map((c) => (
                            <tr key={c.id}>
                              <td className="px-4 py-2">
                                <Link href={`/communities/${c.id}`} className="hover:underline">{c.name}</Link>
                              </td>
                              <td className="px-2 py-2 text-right tabular-nums">{nf(c.members)}</td>
                              <td className="px-2 py-2 text-right tabular-nums">{nf(c.proposals)}</td>
                              <td className="px-2 py-2 text-right tabular-nums">{nf(c.decided)}</td>
                              <td className="px-4 py-2 text-right tabular-nums">
                                {c.democracyScore != null ? `${Math.round(c.democracyScore)}/100` : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
      <Footer />
    </div>
  );
}
