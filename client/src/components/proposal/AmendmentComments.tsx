/**
 * AmendmentComments — the conversation about one proposed change.
 *
 * Collapsed to a single line until opened, because a proposal can carry
 * dozens of amendments and expanding every thread would bury the amendments
 * themselves. The count is visible while collapsed so a discussion worth
 * reading advertises itself.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { useTranslation } from '@/hooks/use-translation';
import { MessageSquare, Loader2 } from 'lucide-react';

export interface AmendmentComment {
  id: number;
  amendmentId: number;
  authorId: number;
  authorName?: string | null;
  content: string;
  createdAt: string;
}

interface AmendmentCommentsProps {
  amendmentId: number;
  comments: AmendmentComment[];
  /** False once the proposal leaves the states where discussion is allowed. */
  canComment: boolean;
  onPosted: (comment: AmendmentComment) => void;
}

export function AmendmentComments({
  amendmentId,
  comments,
  canComment,
  onPosted,
}: AmendmentCommentsProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const content = text.trim();
    if (!content || posting) return;
    setPosting(true);
    setError(null);
    try {
      const resp = await api.post<AmendmentComment>(
        `/api/amendments/${amendmentId}/comments`,
        { content },
      );
      onPosted(resp.data);
      setText('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('amendment.comments.postFailed'));
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="mt-3 border-t pt-2">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        data-testid={`amendment-comments-toggle-${amendmentId}`}
      >
        <MessageSquare className="h-3.5 w-3.5" />
        {comments.length > 0
          ? t('amendment.comments.count', { count: comments.length })
          : t('amendment.comments.none')}
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {comments.map(comment => (
            <div key={comment.id} className="rounded-md bg-muted/50 px-3 py-2 text-sm">
              <div className="mb-0.5 flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium">
                  {comment.authorName || t('amendment.comments.someone')}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(comment.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="whitespace-pre-line break-words">{comment.content}</p>
            </div>
          ))}

          {user && canComment && (
            <div className="space-y-1.5">
              <Textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder={t('amendment.comments.placeholder')}
                rows={2}
                maxLength={2000}
                className="text-sm"
                data-testid={`amendment-comment-input-${amendmentId}`}
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
              <Button
                size="sm"
                className="h-7"
                onClick={submit}
                disabled={posting || !text.trim()}
                data-testid={`amendment-comment-submit-${amendmentId}`}
              >
                {posting && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                {t('amendment.comments.post')}
              </Button>
            </div>
          )}
          {user && !canComment && (
            <p className="text-xs text-muted-foreground">{t('amendment.comments.closed')}</p>
          )}
        </div>
      )}
    </div>
  );
}
