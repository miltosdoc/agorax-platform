/**
 * Amendment Tree Visualization — Civic Tech Best Practice
 * 
 * Displays amendments as a branching tree (not a flat list), with each
 * amendment linked to its parent proposal. Shows status (proposed, under
 * review, accepted, rejected) with color-coded badges.
 * 
 * Users can trace the genealogy of any change — who proposed it, when,
 * and what happened to it. Prevents the "moving goalpost" feeling that
 * erodes trust.
 * 
 * Inspired by LiquidFeedback and Loomio patterns.
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  GitBranch,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/use-translation';

interface AmendmentNode {
  id: number;
  text: string;
  authorName: string;
  createdAt: string;
  status: 'proposed' | 'under_review' | 'accepted' | 'rejected' | 'overridden';
  parentId?: number;
  children?: AmendmentNode[];
}

interface AmendmentTreeProps {
  root: AmendmentNode;
  onToggle?: (id: number) => void;
  onAction?: (id: number, action: string) => void;
  className?: string;
}

function statusBadge(status: string) {
  const config: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    proposed: {
      label: 'Proposed',
      color: 'bg-blue-50 text-blue-700 border-blue-200',
      icon: <FileText className="w-3 h-3" />,
    },
    under_review: {
      label: 'Under Review',
      color: 'bg-amber-50 text-amber-700 border-amber-200',
      icon: <Clock className="w-3 h-3" />,
    },
    accepted: {
      label: 'Accepted',
      color: 'bg-green-50 text-green-700 border-green-200',
      icon: <CheckCircle2 className="w-3 h-3" />,
    },
    rejected: {
      label: 'Rejected',
      color: 'bg-red-50 text-red-700 border-red-200',
      icon: <XCircle className="w-3 h-3" />,
    },
    overridden: {
      label: 'Community Override',
      color: 'bg-purple-50 text-purple-700 border-purple-200',
      icon: <GitBranch className="w-3 h-3" />,
    },
  };
  const cfg = config[status] || config.proposed;
  return (
    <Badge variant="outline" className={cn('gap-1', cfg.color)}>
      {cfg.icon}
      {cfg.label}
    </Badge>
  );
}

function AmendmentNodeItem({
  node,
  depth = 0,
  onToggle,
  onAction,
}: {
  node: AmendmentNode;
  depth?: number;
  onToggle?: (id: number) => void;
  onAction?: (id: number, action: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const { t } = useTranslation();
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className={cn('relative', depth > 0 && 'ml-4 pl-4 border-l-2 border-muted')}>
      <div
        className={cn(
          'flex items-start gap-3 p-3 rounded-lg border',
          node.status === 'accepted' && 'border-green-200 bg-green-50/30',
          node.status === 'rejected' && 'border-red-200 bg-red-50/30',
          node.status === 'overridden' && 'border-purple-200 bg-purple-50/30',
          'border-muted'
        )}
      >
        {/* Expand/collapse toggle */}
        {hasChildren && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 flex-shrink-0"
            onClick={() => {
              setExpanded(!expanded);
              onToggle?.(node.id);
            }}
          >
            {expanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </Button>
        )}

        <div className="flex-1 min-w-0 space-y-2">
          {/* Header: status + author + date */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            {statusBadge(node.status)}
            <div className="text-xs text-muted-foreground">
              {node.authorName} · {new Date(node.createdAt).toLocaleDateString()}
            </div>
          </div>

          {/* Amendment text */}
          <p className="text-sm whitespace-pre-wrap">{node.text}</p>

          {/* Actions */}
          {node.status === 'under_review' && onAction && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-green-700 hover:bg-green-50"
                onClick={() => onAction(node.id, 'accept')}
              >
                <CheckCircle2 className="w-4 h-4 mr-1" />
                {t('amendment.accept') || 'Accept'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-red-700 hover:bg-red-50"
                onClick={() => onAction(node.id, 'reject')}
              >
                <XCircle className="w-4 h-4 mr-1" />
                {t('amendment.reject') || 'Reject'}
              </Button>
            </div>
          )}

          {/* Community override indicator */}
          {node.status === 'rejected' && (
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <GitBranch className="w-3 h-3" />
              {t('amendment.communityOverride') || 'Community can override with 30% threshold'}
            </div>
          )}
        </div>
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <div className="mt-2 space-y-2">
          {node.children!.map((child) => (
            <AmendmentNodeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              onToggle={onToggle}
              onAction={onAction}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function AmendmentTree({
  root,
  onToggle,
  onAction,
  className,
}: AmendmentTreeProps) {
  const { t } = useTranslation();

  return (
    <Card className={cn(className)} data-testid="amendment-tree">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <GitBranch className="w-5 h-5" />
          {t('amendment.tree') || 'Amendment Tree'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Root proposal */}
        <div className="p-3 rounded-lg border border-blue-200 bg-blue-50/30">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              <FileText className="w-3 h-3 mr-1" />
              {t('amendment.originalProposal') || 'Original Proposal'}
            </Badge>
          </div>
          <p className="text-sm whitespace-pre-wrap">{root.text}</p>
        </div>

        {/* Amendment children */}
        {root.children && root.children.length > 0 ? (
          root.children.map((child) => (
            <AmendmentNodeItem
              key={child.id}
              node={child}
              depth={1}
              onToggle={onToggle}
              onAction={onAction}
            />
          ))
        ) : (
          <div className="text-center text-muted-foreground text-sm py-4">
            {t('amendment.noAmendments') || 'No amendments yet'}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default AmendmentTree;
