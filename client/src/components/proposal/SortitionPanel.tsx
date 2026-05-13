/**
 * SortitionPanel — shows the sortition jury for a proposal:
 *   - Status badge (active / completed / etc.)
 *   - Size + response progress
 *   - Avatars of selected members with a green tick once responded
 *   - Deadline countdown
 *   - "Open synthesis workspace" link for jurors
 */

import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { api } from '@/lib/api';
import { useTranslation } from '@/hooks/use-translation';
import { Users, Clock, CheckCircle2, ArrowRight } from 'lucide-react';

interface SortitionBodySnapshot {
  body: {
    id: number;
    status: 'selecting' | 'active' | 'completed' | 'timeout';
    purpose: string;
    size: number;
    responseHours: number;
    selectedAt: string | null;
    completedAt: string | null;
  } | null;
  members: Array<{
    memberId: number;
    userId: number;
    responded: boolean;
    scoredAt: string | null;
    username: string;
    name: string | null;
    profilePicture: string | null;
  }>;
  respondedCount: number;
  userIsMember: boolean;
  deadline: string | null;
  baseline: string | null;
}

interface SortitionPanelProps {
  proposalId: number;
  proposalStatus: string;
}

const STATUS_CONFIG: Record<string, { color: string; labelKey: string }> = {
  selecting: { color: 'bg-blue-100 text-blue-800', labelKey: 'workspace.sortition.status.selecting' },
  active: { color: 'bg-green-100 text-green-800', labelKey: 'workspace.sortition.status.active' },
  completed: { color: 'bg-emerald-100 text-emerald-800', labelKey: 'workspace.sortition.status.completed' },
  timeout: { color: 'bg-red-100 text-red-700', labelKey: 'workspace.sortition.status.timeout' },
};

function formatRemaining(iso: string | null): string {
  if (!iso) return '—';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h`;
  const minutes = Math.floor(ms / (1000 * 60));
  return `${minutes}m`;
}

export function SortitionPanel({ proposalId, proposalStatus }: SortitionPanelProps) {
  const { t } = useTranslation();
  const [snap, setSnap] = useState<SortitionBodySnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<SortitionBodySnapshot>(`/api/proposals/${proposalId}/sortition-body`)
      .then((r) => setSnap(r.data))
      .catch(() => setSnap(null))
      .finally(() => setLoading(false));
  }, [proposalId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          {t('workspace.amendments.loading')}
        </CardContent>
      </Card>
    );
  }

  if (!snap?.body) {
    // Explain *why* there's no jury, based on the proposal's current phase.
    const before = ['draft', 'review', 'author_review', 'community_signal'].includes(proposalStatus);
    const skipped = ['voting', 'decided', 'archived'].includes(proposalStatus);
    const expectedNow = proposalStatus === 'sortition_synthesis';
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            {t('workspace.tabs.sortition')}
          </CardTitle>
          <CardDescription>
            {t('workspace.sortition.what_is_sortition') || 'Σώμα τυχαία επιλεγμένων πολιτών που συντάσσει το τελικό κείμενο μόνο όταν η κοινότητα έχει επισημάνει τροπολογίες προς επανεξέταση.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {expectedNow && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded text-sm">
              {t('workspace.sortition.expected_but_missing') || 'Η πρόταση είναι στη φάση σύνθεσης κληρωτού σώματος, αλλά κανένα σώμα δεν έχει σχηματιστεί ακόμη. Ενδέχεται να σχηματίζεται.'}
            </div>
          )}
          {before && (
            <p className="text-sm text-muted-foreground">
              {t('workspace.sortition.not_applicable_yet') || 'Δεν εφαρμόζεται ακόμη. Το κληρωτό σώμα ενεργοποιείται μόνο αν η κοινότητα επισημάνει απορριφθείσες τροπολογίες κατά τη φάση «Σήμα Κοινότητας».'}
            </p>
          )}
          {skipped && (
            <p className="text-sm text-muted-foreground">
              {t('workspace.sortition.skipped') || 'Παραλείφθηκε. Καμία τροπολογία δεν επισημάνθηκε από την κοινότητα, οπότε η πρόταση πέρασε απευθείας στην ψηφοφορία.'}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  const body = snap.body;
  const config = STATUS_CONFIG[body.status] ?? STATUS_CONFIG.active;
  const total = body.size || snap.members.length;
  const responseRate = total > 0 ? Math.round((snap.respondedCount / total) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              {t('workspace.tabs.sortition')}
              <Badge variant="secondary">{snap.members.length}/{total}</Badge>
            </CardTitle>
            <CardDescription>
              {t(`workspace.sortition.purpose.${body.purpose}`) || body.purpose}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={config.color}>{t(config.labelKey) || body.status}</Badge>
            {snap.deadline && (
              <Badge variant="outline" className="gap-1">
                <Clock className="w-3 h-3" />
                {formatRemaining(snap.deadline)}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Response progress */}
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted-foreground">
              {t('workspace.sortition.responded') || 'Απάντησαν'}
            </span>
            <span className="font-medium">{snap.respondedCount}/{total} ({responseRate}%)</span>
          </div>
          <Progress value={responseRate} />
        </div>

        {/* Member avatars */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">
            {t('workspace.sortition.selected_members') || 'Επιλεγμένα μέλη'}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {snap.members.map((m) => (
              <div
                key={m.memberId}
                className={`flex items-center gap-2 p-2 rounded border ${
                  m.responded ? 'border-green-200 bg-green-50' : 'border-muted bg-background'
                }`}
              >
                {m.profilePicture ? (
                  <img src={m.profilePicture} alt="" className="w-7 h-7 rounded-full object-cover" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                    {(m.name || m.username).slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{m.name || m.username}</p>
                </div>
                {m.responded && <CheckCircle2 className="w-3 h-3 text-green-600 flex-shrink-0" />}
              </div>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 pt-2 border-t">
          {snap.userIsMember && body.status !== 'completed' && (
            <Button size="sm" asChild>
              <Link href={`/proposals/${proposalId}/sortition`}>
                <ArrowRight className="w-4 h-4 mr-1" />
                {t('workspace.sortition.open_workspace') || 'Άνοιγμα χώρου εργασίας'}
              </Link>
            </Button>
          )}
          {!snap.userIsMember && body.status !== 'completed' && (
            <Button size="sm" variant="outline" asChild>
              <Link href={`/proposals/${proposalId}/sortition`}>
                <ArrowRight className="w-4 h-4 mr-1" />
                {t('workspace.sortition.observe') || 'Παρακολούθηση'}
              </Link>
            </Button>
          )}
        </div>

        {body.completedAt && (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <CheckCircle2 className="w-4 h-4" />
            <span>{t('workspace.sortition.completed_on') || 'Ολοκληρώθηκε'} {new Date(body.completedAt).toLocaleDateString()}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
