/**
 * The one empty/loading pattern: centered muted text in a card (empty)
 * or bare (loading), with an optional icon and a single CTA.
 */
import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="py-12 text-center text-sm text-muted-foreground">{label}</div>
  );
}

export function EmptyState({ icon, title, action }: { icon?: ReactNode; title: string; action?: ReactNode }) {
  return (
    <Card>
      <CardContent className="py-12 flex flex-col items-center text-center gap-3">
        {icon && <div className="text-muted-foreground/40">{icon}</div>}
        <p className="text-sm text-muted-foreground">{title}</p>
        {action}
      </CardContent>
    </Card>
  );
}
