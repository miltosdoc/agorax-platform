/**
 * Sortition workspace resolver — route `/proposals/:id/sortition`.
 *
 * The sortition jury now scores and revises a proposal from one workspace:
 * the scoring page (`/sortition/:memberId`), where each revision is recorded
 * as an amendment on the author's original. That page is keyed by the
 * viewer's sortition-member id, so this resolver looks up the current user's
 * assignment for the proposal and forwards them to it. Non-members (and any
 * lookup failure) land on the sortition dashboard.
 */

import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';

export default function SortitionSynthesisPage() {
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  // /proposals/:id/sortition  →  ['', 'proposals', ':id', 'sortition']
  const proposalId = location.split('/')[2];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!proposalId) {
        navigate('/sortition');
        return;
      }
      try {
        const resp = await api.get<{ members: Array<{ memberId: number; userId: number }> }>(
          `/api/proposals/${proposalId}/sortition-body`,
        );
        const mine = user
          ? resp.data.members.find((m) => m.userId === user.id)
          : undefined;
        if (!cancelled) {
          navigate(mine ? `/sortition/${mine.memberId}` : '/sortition');
        }
      } catch {
        if (!cancelled) navigate('/sortition');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [proposalId, user, navigate]);

  return null;
}
