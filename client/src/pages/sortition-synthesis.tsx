/**
 * Sortition synthesis — retired.
 *
 * The sortition jury now scores and revises a proposal from a single
 * workspace (the scoring page), where each revision is recorded as an
 * amendment layered on the author's original. This route redirects to the
 * sortition dashboard so any existing links keep working.
 */

import { useEffect } from 'react';
import { useLocation } from 'wouter';

export default function SortitionSynthesisPage() {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate('/sortition');
  }, [navigate]);
  return null;
}
