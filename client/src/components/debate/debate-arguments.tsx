/**
 * Debate Arguments Component
 * 
 * Placeholder for debate/arguments section on proposal detail pages.
 * TODO: Wire to backend API for fetching debate arguments.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare } from 'lucide-react';

interface DebateArgumentsProps {
  proposalId: number;
}

export function DebateArguments({ proposalId }: DebateArgumentsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          Debate Arguments
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">
          Debate arguments for this proposal will appear here once community members start submitting arguments.
        </p>
      </CardContent>
    </Card>
  );
}
