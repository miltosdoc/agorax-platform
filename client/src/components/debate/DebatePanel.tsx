/**
 * Debate Panel
 *
 * Threaded discussion attached to a proposal. Top-level threads are sorted
 * by net score (server-side); replies appear nested under their parent.
 * Authenticated members can open a new thread, reply, or up/downvote any
 * existing thread. The proposal status determines whether debate is open;
 * the server returns 409 ('closed') when it is not, surfaced as an inline
 * error.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { useLocation } from 'wouter';
import { ChevronDown, ChevronUp, MessageSquare, ThumbsDown, ThumbsUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { useTranslation } from '@/hooks/use-translation';
import { isDebateOpen } from '@shared/proposal-lifecycle';

interface ThreadNode {
  id: number;
  proposalId: number;
  authorId: number;
  authorName?: string;
  parentId: number | null;
  content: string;
  upvotes: number | null;
  downvotes: number | null;
  createdAt: string;
  replies: ThreadNode[];
}

interface DebateStats {
  totalThreads: number;
  totalUpvotes: number;
  totalDownvotes: number;
  topContributors: { userId: number; name: string; threadCount: number }[];
}

interface DebatePanelProps {
  proposalId: number;
  /** Omit to leave the composer open — callers that know the phase pass it. */
  proposalStatus?: string;
}

const EMPTY_STATS: DebateStats = {
  totalThreads: 0,
  totalUpvotes: 0,
  totalDownvotes: 0,
  topContributors: [],
};

function formatTimestamp(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

export function DebatePanel({ proposalId, proposalStatus }: DebatePanelProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [, navigate] = useLocation();

  // Mirror the server's gate: once the proposal leaves the deliberation
  // states, posting 409s. Offering an enabled composer that always fails is
  // worse than showing none.
  const debateOpen = proposalStatus == null || isDebateOpen(proposalStatus);
  const canParticipate = !!user && debateOpen;

  const [threads, setThreads] = useState<ThreadNode[]>([]);
  const [stats, setStats] = useState<DebateStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [composerOpen, setComposerOpen] = useState(false);
  const [composerText, setComposerText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const refresh = async () => {
    try {
      const [threadResp, statsResp] = await Promise.all([
        api.get<ThreadNode[]>(`/api/proposals/${proposalId}/debate`),
        api.get<DebateStats>(`/api/proposals/${proposalId}/debate/stats`)
          .catch(() => ({ data: EMPTY_STATS })),
      ]);
      setThreads(threadResp.data ?? []);
      setStats(statsResp.data ?? EMPTY_STATS);
      setError(null);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : t('debate.loadFailed');
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalId]);

  const handleNewThread = async (e: FormEvent) => {
    e.preventDefault();
    if (!composerText.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/api/proposals/${proposalId}/debate`, { content: composerText.trim() });
      setComposerText('');
      setComposerOpen(false);
      await refresh();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : t('debate.postFailed');
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReply = async (parentId: number, content: string) => {
    await api.post(`/api/proposals/${proposalId}/debate`, { content, parentId });
    await refresh();
  };

  const handleVote = async (threadId: number, direction: 'up' | 'down') => {
    try {
      await api.post(`/api/debate/${threadId}/vote`, { direction });
      await refresh();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : t('debate.voteFailed');
      setError(message);
    }
  };

  return (
    <div className="space-y-4" data-testid="debate-panel">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <MessageSquare className="w-4 h-4" />
            {t('debate.title')}
          </span>
          <span data-testid="debate-thread-count">
            {t('debate.threadCount', { count: stats.totalThreads })}
          </span>
          <span className="flex items-center gap-1">
            <ThumbsUp className="w-3.5 h-3.5" />
            {stats.totalUpvotes}
          </span>
          <span className="flex items-center gap-1">
            <ThumbsDown className="w-3.5 h-3.5" />
            {stats.totalDownvotes}
          </span>
        </div>
        {user ? (
          <div className="flex items-center gap-2">
            {!debateOpen && (
              <span className="text-xs text-muted-foreground" data-testid="debate-closed-notice">
                {t('debate.closedNotice')}
              </span>
            )}
            <Button
              variant={composerOpen ? 'outline' : 'default'}
              size="sm"
              onClick={() => setComposerOpen((v) => !v)}
              disabled={!debateOpen}
              title={debateOpen ? undefined : t('debate.closedNotice')}
              data-testid="debate-new-thread-toggle"
            >
              {composerOpen ? t('debate.cancel') : t('debate.newThread')}
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => navigate('/auth')}>
            {t('debate.loginToParticipate')}
          </Button>
        )}
      </div>

      {composerOpen && user && (
        <Card>
          <CardContent className="p-4">
            <form onSubmit={handleNewThread} className="space-y-3">
              <Textarea
                value={composerText}
                onChange={(e) => setComposerText(e.target.value)}
                placeholder={t('debate.threadPlaceholder')}
                rows={4}
                data-testid="debate-new-thread-input"
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setComposerOpen(false);
                    setComposerText('');
                  }}
                >
                  {t('debate.cancel')}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={submitting || !composerText.trim()}
                  data-testid="debate-new-thread-submit"
                >
                  {submitting ? t('general.loading') : t('debate.post')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card>
          <CardContent className="p-4 text-sm text-red-600" data-testid="debate-error">
            {error}
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {t('general.loading')}
          </CardContent>
        </Card>
      ) : threads.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground" data-testid="debate-empty">
            {t('debate.empty')}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3" data-testid="debate-thread-list">
          {threads.map((thread) => (
            <ThreadCard
              key={thread.id}
              thread={thread}
              canParticipate={canParticipate}
              onVote={handleVote}
              onReply={handleReply}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ThreadCardProps {
  thread: ThreadNode;
  canParticipate: boolean;
  onVote: (threadId: number, direction: 'up' | 'down') => Promise<void>;
  onReply: (parentId: number, content: string) => Promise<void>;
  depth?: number;
}

function ThreadCard({ thread, canParticipate, onVote, onReply, depth = 0 }: ThreadCardProps) {
  const { t } = useTranslation();
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const submitReply = async (e: FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onReply(thread.id, replyText.trim());
      setReplyText('');
      setReplyOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const upvotes = thread.upvotes ?? 0;
  const downvotes = thread.downvotes ?? 0;
  const indentClass = depth > 0 ? 'ml-4 sm:ml-8 border-l-2 pl-4 border-muted' : '';

  return (
    <div className={indentClass} data-testid={`debate-thread-${thread.id}`}>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center gap-1 pt-1">
              <button
                type="button"
                disabled={!canParticipate}
                onClick={() => onVote(thread.id, 'up')}
                className="text-muted-foreground hover:text-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid={`debate-upvote-${thread.id}`}
                aria-label="upvote"
              >
                <ThumbsUp className="w-4 h-4" />
              </button>
              <span className="text-xs font-medium" data-testid={`debate-score-${thread.id}`}>
                {upvotes - downvotes}
              </span>
              <button
                type="button"
                disabled={!canParticipate}
                onClick={() => onVote(thread.id, 'down')}
                className="text-muted-foreground hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid={`debate-downvote-${thread.id}`}
                aria-label="downvote"
              >
                <ThumbsDown className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <span className="font-medium text-foreground">
                  {thread.authorName ?? t('proposal.userWithId', { id: thread.authorId })}
                </span>
                <span>·</span>
                <span>{formatTimestamp(thread.createdAt)}</span>
                <span>·</span>
                <span>↑ {upvotes}</span>
                <span>↓ {downvotes}</span>
              </div>
              <p className="text-sm whitespace-pre-wrap mb-2">{thread.content}</p>
              <div className="flex items-center gap-2">
                {canParticipate && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setReplyOpen((v) => !v)}
                    data-testid={`debate-reply-toggle-${thread.id}`}
                  >
                    {t('debate.reply')}
                  </Button>
                )}
                {thread.replies.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setCollapsed((v) => !v)}
                    data-testid={`debate-collapse-${thread.id}`}
                  >
                    {collapsed ? <ChevronDown className="w-4 h-4 mr-1" /> : <ChevronUp className="w-4 h-4 mr-1" />}
                    {thread.replies.length}
                  </Button>
                )}
              </div>

              {replyOpen && canParticipate && (
                <form onSubmit={submitReply} className="mt-3 space-y-2">
                  <Textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={t('debate.replyPlaceholder')}
                    rows={3}
                    data-testid={`debate-reply-input-${thread.id}`}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setReplyOpen(false);
                        setReplyText('');
                      }}
                    >
                      {t('debate.cancel')}
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={submitting || !replyText.trim()}
                      data-testid={`debate-reply-submit-${thread.id}`}
                    >
                      {submitting ? t('general.loading') : t('debate.post')}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {!collapsed && thread.replies.length > 0 && (
        <div className="mt-2 space-y-2">
          {thread.replies.map((reply) => (
            <ThreadCard
              key={reply.id}
              thread={reply}
              canParticipate={canParticipate}
              onVote={onVote}
              onReply={onReply}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default DebatePanel;
