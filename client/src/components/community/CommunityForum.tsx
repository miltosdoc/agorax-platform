/**
 * Community Forum — η αγορά της κοινότητας.
 *
 * Two views in one component: a list of topics, and one open topic with its
 * replies. Deliberately not a chat. A topic has a title, sorts by liveliness
 * rather than by birthday, and carries the action that justifies the whole
 * surface — «Γίνε πρόταση», which sends the reader to the proposal form with
 * the topic already written into it.
 *
 * The open topic is kept in the URL (?tab=forum&post=N) so a link to an
 * argument is a link to that argument, not to the front of the forum.
 */

import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/api';
import {
  ArrowLeft, ChevronUp, ChevronDown, EyeOff, Flag, MessageSquare, Pencil,
  Pin, PinOff, Send, Shield, Trash2, Undo2, Lightbulb,
} from 'lucide-react';

interface ForumAuthor {
  id: number;
  username: string;
  name: string | null;
  profilePicture: string | null;
}

interface ForumPost {
  id: number;
  communityId: number;
  parentId: number | null;
  title: string | null;
  content: string;
  author: ForumAuthor | null;
  upvotes: number;
  downvotes: number;
  replyCount: number;
  pinned: boolean;
  score: number;
  yourVote: 'up' | 'down' | null;
  yourFlag: 'hide' | 'keep' | null;
  flags: { hide: number; keep: number };
  removed: 'hidden' | 'deleted' | null;
  hiddenReason: string | null;
  hiddenByMembers: boolean;
  promotedProposalId: number | null;
  lastActivityAt: string;
  createdAt: string;
  editedAt: string | null;
}

interface Props {
  communityId: number;
  isMember: boolean;
  canManage: boolean;
}

const authorName = (a: ForumAuthor | null, fallback: string) =>
  a ? (a.name?.trim() || a.username) : fallback;

function relativeDate(iso: string, locale: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(locale === 'en' ? 'en-GB' : 'el-GR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function CommunityForum({ communityId, isMember, canManage }: Props) {
  const { t, locale } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const [topics, setTopics] = useState<ForumPost[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<number | null>(() => {
    const raw = new URLSearchParams(window.location.search).get('post');
    return raw && /^\d+$/.test(raw) ? parseInt(raw, 10) : null;
  });
  const [thread, setThread] = useState<{ topic: ForumPost; replies: ForumPost[] } | null>(null);
  // Μια κοινότητα «μόνο για μέλη» δεν είναι άδεια κοινότητα. Το να δείχνουμε
  // «κανένα θέμα ακόμη» σε κάποιον που απλώς δεν έχει δικαίωμα ανάγνωσης
  // είναι λάθος πληροφορία, όχι κενή.
  const [locked, setLocked] = useState(false);
  const [moderation, setModeration] = useState<'admins' | 'members'>('members');

  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [replyContent, setReplyContent] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState('');

  // The open topic lives in the URL so it can be linked and so the browser
  // back button walks out of a topic rather than off the page.
  const setOpen = useCallback((id: number | null) => {
    setOpenId(id);
    const params = new URLSearchParams(window.location.search);
    params.set('tab', 'forum');
    if (id) params.set('post', String(id)); else params.delete('post');
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  }, []);

  const loadTopics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/api/communities/${communityId}/posts`);
      const data = res.data as { topics: ForumPost[]; total: number };
      setTopics(data.topics ?? []);
      setTotal(data.total ?? 0);
      setLocked(false);
    } catch (e: any) {
      setTopics([]);
      setLocked(e?.status === 403);
    }
    setLoading(false);
  }, [communityId]);

  const loadThread = useCallback(async (postId: number) => {
    setLoading(true);
    try {
      const res = await api.get(`/api/communities/${communityId}/posts/${postId}`);
      const data = res.data as { topic: ForumPost; replies: ForumPost[]; moderation: 'admins' | 'members' };
      setThread({ topic: data.topic, replies: data.replies ?? [] });
      setModeration(data.moderation ?? 'members');
    } catch {
      setThread(null);
      setOpen(null);
      toast({ title: t('forum.topic_missing'), variant: 'destructive' });
    }
    setLoading(false);
  }, [communityId, setOpen, t, toast]);

  useEffect(() => {
    if (openId) void loadThread(openId);
    else void loadTopics();
  }, [openId, loadThread, loadTopics]);

  const refresh = () => (openId ? loadThread(openId) : loadTopics());

  // api.ts throws ApiError, whose message is already the server's own text —
  // which for this router is the explanation of *why* something was refused
  // ("wait 20s", "you cannot flag your own post"). Showing it beats a generic
  // failure toast that leaves the member guessing.
  const fail = (e: any) =>
    toast({ title: e?.message || t('common.unknown_error'), variant: 'destructive' });

  // ── Actions ──────────────────────────────────────────────────────────────

  async function createTopic() {
    if (!newTitle.trim() || !newContent.trim()) return;
    setBusy(true);
    try {
      const res = await api.post(`/api/communities/${communityId}/posts`, {
        title: newTitle.trim(), content: newContent.trim(),
      });
      setNewTitle(''); setNewContent(''); setComposerOpen(false);
      setOpen((res.data as ForumPost).id);
    } catch (e) { fail(e); }
    setBusy(false);
  }

  async function reply() {
    if (!replyContent.trim() || !openId) return;
    setBusy(true);
    try {
      await api.post(`/api/communities/${communityId}/posts`, {
        parentId: openId, content: replyContent.trim(),
      });
      setReplyContent('');
      await loadThread(openId);
    } catch (e) { fail(e); }
    setBusy(false);
  }

  async function vote(post: ForumPost, direction: 'up' | 'down') {
    try {
      await api.post(`/api/communities/${communityId}/posts/${post.id}/vote`, { direction });
      await refresh();
    } catch (e) { fail(e); }
  }

  async function saveEdit(post: ForumPost) {
    if (!editText.trim()) return;
    setBusy(true);
    try {
      await api.patch(`/api/communities/${communityId}/posts/${post.id}`, { content: editText.trim() });
      setEditing(null);
      await refresh();
    } catch (e) { fail(e); }
    setBusy(false);
  }

  async function remove(post: ForumPost) {
    if (!window.confirm(t('forum.confirm_delete'))) return;
    try {
      await api.delete(`/api/communities/${communityId}/posts/${post.id}`);
      if (post.parentId == null && openId === post.id) setOpen(null);
      else await refresh();
    } catch (e) { fail(e); }
  }

  async function flag(post: ForumPost, direction: 'hide' | 'keep') {
    // A report says what is wrong, or it is just a downvote with a worse name.
    let reason: string | null = null;
    if (direction === 'hide' && post.yourFlag !== 'hide') {
      reason = window.prompt(t('forum.report_reason_prompt')) ?? null;
      if (reason === null) return;
    }
    try {
      const res = await api.post(`/api/communities/${communityId}/posts/${post.id}/flag`, { direction, reason });
      const data = res.data as { hidden: boolean; moderation: 'admins' | 'members' };
      toast({
        title: data.hidden
          ? t('forum.report_hidden')
          : data.moderation === 'admins' ? t('forum.report_sent_admins') : t('forum.report_recorded'),
      });
      await refresh();
    } catch (e) { fail(e); }
  }

  async function hide(post: ForumPost) {
    const reason = window.prompt(t('forum.hide_reason_prompt'));
    if (!reason?.trim()) return;
    try {
      await api.post(`/api/communities/${communityId}/posts/${post.id}/hide`, { reason: reason.trim() });
      await refresh();
    } catch (e) { fail(e); }
  }

  async function unhide(post: ForumPost) {
    try {
      await api.post(`/api/communities/${communityId}/posts/${post.id}/unhide`, {});
      await refresh();
    } catch (e) { fail(e); }
  }

  async function togglePin(post: ForumPost) {
    try {
      await api.post(`/api/communities/${communityId}/posts/${post.id}/pin`, { pinned: !post.pinned });
      await refresh();
    } catch (e) { fail(e); }
  }

  /**
   * The topic goes to the proposal form, not straight into the database: a
   * proposal needs a track and a duration, and a forum post that quietly
   * became a proposal would be worse than a moment of friction.
   */
  function promote(topic: ForumPost) {
    const params = new URLSearchParams({
      community: String(communityId),
      question: topic.title ?? '',
      solution: topic.content,
      fromPost: String(topic.id),
    });
    navigate(`/proposals/new?${params.toString()}`);
  }

  // ── Pieces ───────────────────────────────────────────────────────────────

  function Tombstone({ post }: { post: ForumPost }) {
    return (
      <div className="rounded border border-dashed border-muted-foreground/30 bg-muted/30 p-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-2 font-medium">
          <EyeOff className="w-4 h-4" />
          {post.removed === 'deleted'
            ? t('forum.removed_by_author')
            : post.hiddenByMembers ? t('forum.hidden_by_members') : t('forum.hidden_by_admin')}
        </div>
        {post.hiddenReason && (
          <p className="mt-1">{t('forum.hidden_reason')}: {post.hiddenReason}</p>
        )}
        {/* A members' hide is reversible by the members, so the vote stays open. */}
        {post.removed === 'hidden' && post.hiddenByMembers && isMember && (
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => flag(post, 'keep')}>
            <Undo2 className="w-4 h-4 mr-1" />{t('forum.vote_keep')}
          </Button>
        )}
      </div>
    );
  }

  function Votes({ post }: { post: ForumPost }) {
    return (
      <div className="flex flex-col items-center shrink-0 pt-1">
        <button
          className={`p-1 rounded hover:bg-muted disabled:opacity-40 ${post.yourVote === 'up' ? 'text-primary' : 'text-muted-foreground'}`}
          disabled={!isMember} onClick={() => vote(post, 'up')} aria-label={t('forum.useful')}
        >
          <ChevronUp className="w-5 h-5" />
        </button>
        <span className="text-sm font-medium tabular-nums">{post.score}</span>
        <button
          className={`p-1 rounded hover:bg-muted disabled:opacity-40 ${post.yourVote === 'down' ? 'text-destructive' : 'text-muted-foreground'}`}
          disabled={!isMember} onClick={() => vote(post, 'down')} aria-label={t('forum.not_useful')}
        >
          <ChevronDown className="w-5 h-5" />
        </button>
      </div>
    );
  }

  function PostActions({ post }: { post: ForumPost }) {
    const mine = user?.id === post.author?.id;
    return (
      <div className="flex flex-wrap items-center gap-1 mt-2">
        {mine && !post.removed && (
          <>
            <Button variant="ghost" size="sm" onClick={() => { setEditing(post.id); setEditText(post.content); }}>
              <Pencil className="w-3.5 h-3.5 mr-1" />{t('forum.edit')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => remove(post)}>
              <Trash2 className="w-3.5 h-3.5 mr-1" />{t('forum.delete')}
            </Button>
          </>
        )}
        {isMember && !mine && !post.removed && (
          <Button
            variant="ghost" size="sm"
            className={post.yourFlag === 'hide' ? 'text-destructive' : ''}
            onClick={() => flag(post, 'hide')}
          >
            <Flag className="w-3.5 h-3.5 mr-1" />
            {post.yourFlag === 'hide' ? t('forum.reported') : t('forum.report')}
          </Button>
        )}
        {/* The tally is public while a post is under review: a moderation vote
            that nobody can see is indistinguishable from a moderator. */}
        {post.flags.hide > 0 && !post.removed && (
          <span className="text-xs text-muted-foreground">
            {moderation === 'members'
              ? t('forum.flag_tally').replace('{hide}', String(post.flags.hide)).replace('{keep}', String(post.flags.keep))
              : t('forum.flag_reported').replace('{n}', String(post.flags.hide))}
          </span>
        )}
        {canManage && moderation === 'admins' && !post.removed && (
          <Button variant="ghost" size="sm" onClick={() => hide(post)}>
            <Shield className="w-3.5 h-3.5 mr-1" />{t('forum.hide')}
          </Button>
        )}
        {canManage && moderation === 'admins' && post.removed === 'hidden' && !post.hiddenByMembers && (
          <Button variant="ghost" size="sm" onClick={() => unhide(post)}>
            <Undo2 className="w-3.5 h-3.5 mr-1" />{t('forum.restore')}
          </Button>
        )}
      </div>
    );
  }

  function PostBody({ post }: { post: ForumPost }) {
    if (post.removed) return <Tombstone post={post} />;
    if (editing === post.id) {
      return (
        <div className="space-y-2">
          <Textarea value={editText} onChange={e => setEditText(e.target.value)} rows={4} />
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => saveEdit(post)}>{t('forum.save')}</Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
          </div>
        </div>
      );
    }
    return <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{post.content}</p>;
  }

  function Meta({ post }: { post: ForumPost }) {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          {authorName(post.author, t('forum.removed_author'))}
        </span>
        <span>{relativeDate(post.createdAt, locale)}</span>
        {post.editedAt && <span>· {t('forum.edited')}</span>}
      </div>
    );
  }

  // ── One topic ────────────────────────────────────────────────────────────

  if (openId && thread) {
    const { topic, replies } = thread;
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setOpen(null)}>
          <ArrowLeft className="w-4 h-4 mr-1" />{t('forum.back_to_topics')}
        </Button>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start gap-3">
              <Votes post={topic} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {topic.pinned && <Badge variant="secondary"><Pin className="w-3 h-3 mr-1" />{t('forum.pinned')}</Badge>}
                  <CardTitle className="text-xl">
                    {topic.removed ? t('forum.removed_topic') : topic.title}
                  </CardTitle>
                </div>
                <div className="mt-1"><Meta post={topic} /></div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <PostBody post={topic} />

            {topic.promotedProposalId ? (
              <div className="rounded border bg-muted/30 p-3 text-sm flex flex-wrap items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-500" />
                <span>{t('forum.became_proposal')}</span>
                <Button variant="link" size="sm" className="px-1"
                  onClick={() => navigate(`/proposals/${topic.promotedProposalId}`)}>
                  {t('forum.open_proposal')}
                </Button>
              </div>
            ) : isMember && !topic.removed && (
              <div className="rounded border border-primary/20 bg-primary/5 p-3 flex flex-wrap items-center gap-3">
                <Lightbulb className="w-4 h-4 text-primary shrink-0" />
                <span className="text-sm flex-1 min-w-[12rem]">{t('forum.promote_hint')}</span>
                <Button size="sm" onClick={() => promote(topic)}>{t('forum.promote')}</Button>
              </div>
            )}

            <PostActions post={topic} />
            {canManage && (
              <Button variant="ghost" size="sm" onClick={() => togglePin(topic)}>
                {topic.pinned
                  ? <><PinOff className="w-3.5 h-3.5 mr-1" />{t('forum.unpin')}</>
                  : <><Pin className="w-3.5 h-3.5 mr-1" />{t('forum.pin')}</>}
              </Button>
            )}
          </CardContent>
        </Card>

        <h3 className="text-sm font-medium text-muted-foreground">
          {replies.length === 1 ? t('forum.one_reply') : t('forum.n_replies').replace('{n}', String(replies.length))}
        </h3>

        <div className="space-y-3">
          {replies.map(r => (
            <Card key={r.id}>
              <CardContent className="p-4 flex items-start gap-3">
                <Votes post={r} />
                <div className="min-w-0 flex-1 space-y-2">
                  <Meta post={r} />
                  <PostBody post={r} />
                  <PostActions post={r} />
                </div>
              </CardContent>
            </Card>
          ))}
          {replies.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('forum.no_replies')}</p>
          )}
        </div>

        {isMember && !topic.removed && (
          <Card>
            <CardContent className="p-4 space-y-2">
              <Textarea
                value={replyContent}
                onChange={e => setReplyContent(e.target.value)}
                placeholder={t('forum.reply_placeholder')}
                rows={3}
              />
              <Button size="sm" disabled={busy || !replyContent.trim()} onClick={reply}>
                <Send className="w-4 h-4 mr-1" />{t('forum.send_reply')}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // ── Topic list ───────────────────────────────────────────────────────────

  if (locked) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <EyeOff className="w-8 h-8 mx-auto mb-3 opacity-50" />
          <p>{t('forum.members_only')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {total === 0 ? t('forum.empty_hint') : t('forum.n_topics').replace('{n}', String(total))}
        </p>
        {isMember && (
          <Button size="sm" onClick={() => setComposerOpen(o => !o)}>
            <MessageSquare className="w-4 h-4 mr-1" />{t('forum.new_topic')}
          </Button>
        )}
      </div>

      {composerOpen && isMember && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <Input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder={t('forum.title_placeholder')}
              maxLength={140}
            />
            <Textarea
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              placeholder={t('forum.content_placeholder')}
              rows={5}
            />
            <div className="flex gap-2">
              <Button size="sm" disabled={busy || !newTitle.trim() || !newContent.trim()} onClick={createTopic}>
                {t('forum.publish')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setComposerOpen(false)}>
                {t('common.cancel')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}

      {!loading && topics.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <MessageSquare className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p>{t('forum.empty')}</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {topics.map(topic => (
          <Card
            key={topic.id}
            className="cursor-pointer transition-colors hover:bg-muted/40"
            onClick={() => setOpen(topic.id)}
          >
            <CardContent className="p-4 flex items-start gap-3">
              <div className="flex flex-col items-center shrink-0 pt-0.5 w-8">
                <span className="text-sm font-medium tabular-nums">{topic.score}</span>
                <span className="text-[10px] text-muted-foreground">{t('forum.score')}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {topic.pinned && <Pin className="w-3.5 h-3.5 text-muted-foreground" />}
                  <span className="font-medium truncate">
                    {topic.removed ? t('forum.removed_topic') : topic.title}
                  </span>
                  {topic.promotedProposalId && (
                    <Badge variant="outline" className="shrink-0">
                      <Lightbulb className="w-3 h-3 mr-1" />{t('forum.badge_proposal')}
                    </Badge>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{authorName(topic.author, t('forum.removed_author'))}</span>
                  <span className="inline-flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" />{topic.replyCount}
                  </span>
                  <span>{relativeDate(topic.lastActivityAt, locale)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
