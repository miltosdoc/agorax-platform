/**
 * Community Forum Router — η αγορά της κοινότητας.
 *
 * Threaded discussion that belongs to a community rather than to a proposal:
 * the antechamber where something is argued before anyone is ready to put it
 * to a vote. A topic carries a "make this a proposal" action, which is the
 * whole point — the forum feeds the deliberation machinery instead of
 * quietly replacing it.
 *
 * ── Who may do what ────────────────────────────────────────────────────────
 * read     the community's own contentVisibility, via canViewCommunityContent
 * write    members only, and only past the consent gate
 * edit     the author of the post, and nobody else
 * delete   the author (tombstone; replies keep their anchor)
 * pin      founder/admin, in both kinds of community — pinning orders, it
 *          does not suppress, and it is the same curation power the founder
 *          already has over the community's name and library
 * hide     depends on the kind of community, and this is deliberate:
 *
 *            managed     → an administrator hides, with a stated reason.
 *                          Member reports are a signal to them, not a verdict.
 *            autonomous  → there is no administrator, by the community's own
 *                          definition. The members decide by majority of those
 *                          who voted, exactly as they decide every other rule
 *                          there. See shared/forum-moderation.ts for the
 *                          quorum and the tie rule.
 *
 * That split is not an implementation detail: `type` is the field this
 * platform actually enforces everywhere else, so it is the field that decides
 * who holds the power to remove someone's words.
 */

import type { Express, Response } from 'express';
import { communityRepo, communityForumRepo, proposalRepo } from '../storage';
import { requireAuth, requireConsent } from '../auth';
import { canViewCommunityContentById } from '../utils/community-visibility';
import { isFlagDirection } from '../../shared/forum-moderation';
import { createNotification } from '../utils/notifications';
import { logger } from '../utils/logger';

/** Longest a topic title may be. Long enough for a sentence, short enough to scan. */
const TITLE_MAX = 140;
const CONTENT_MAX = 8000;

/**
 * Minimum gap between two posts by the same person, anywhere. Not a
 * rate-limiter for abuse — a brake on the accidental double-submit and on
 * the flood that makes a young forum unreadable in an afternoon.
 */
const POST_COOLDOWN_MS = 20_000;

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function registerCommunityForumRoutes(app: Express) {
  // ── Gates ────────────────────────────────────────────────────────────────

  /** Can this viewer read the community's content at all? */
  async function requireReadable(communityId: number, userId: number | undefined, res: Response) {
    if (Number.isNaN(communityId)) {
      res.status(400).json({ message: 'Invalid community id' });
      return false;
    }
    const community = await communityRepo.getCommunity(communityId);
    if (!community) {
      res.status(404).json({ message: 'Community not found' });
      return false;
    }
    if (!(await canViewCommunityContentById(communityId, userId))) {
      res.status(403).json({ message: 'This community keeps its content to members' });
      return false;
    }
    return true;
  }

  /** Membership, which is what writing requires everywhere in this platform. */
  async function requireMember(communityId: number, userId: number, res: Response) {
    if (!(await communityRepo.isCommunityMember(communityId, userId))) {
      res.status(403).json({ message: 'Must be a community member' });
      return false;
    }
    return true;
  }

  async function isOfficer(communityId: number, userId: number) {
    const role = await communityRepo.getCommunityMemberRole(communityId, userId);
    return role === 'admin' || role === 'founder';
  }

  /**
   * Resolve a post and the community it belongs to, refusing anything that
   * does not line up. Every mutation goes through here so a post id from one
   * community can never be acted on through another community's URL.
   */
  async function loadPost(communityIdRaw: string, postIdRaw: string, res: Response) {
    const communityId = parseInt(communityIdRaw, 10);
    const postId = parseInt(postIdRaw, 10);
    if (Number.isNaN(communityId) || Number.isNaN(postId)) {
      res.status(400).json({ message: 'Invalid id' });
      return null;
    }
    const post = await communityForumRepo.getPost(postId);
    if (!post || post.communityId !== communityId) {
      res.status(404).json({ message: 'Post not found' });
      return null;
    }
    return { communityId, postId, post };
  }

  // ── Reading ──────────────────────────────────────────────────────────────

  app.get('/api/communities/:id/posts', async (req: any, res) => {
    try {
      const communityId = parseInt(req.params.id, 10);
      if (!(await requireReadable(communityId, req.user?.id, res))) return;

      const limit = Number.parseInt(String(req.query.limit ?? '20'), 10);
      const offset = Number.parseInt(String(req.query.offset ?? '0'), 10);
      const result = await communityForumRepo.listTopics(communityId, {
        userId: req.user?.id,
        limit: Number.isFinite(limit) ? limit : 20,
        offset: Number.isFinite(offset) ? offset : 0,
      });
      res.json({
        ...result,
        canPost: req.user ? await communityRepo.isCommunityMember(communityId, req.user.id) : false,
      });
    } catch (error) {
      logger.error('[forum] list topics failed', { err: (error as any)?.message });
      res.status(500).json({ message: 'Failed to load the forum' });
    }
  });

  app.get('/api/communities/:id/posts/:postId', async (req: any, res) => {
    try {
      const communityId = parseInt(req.params.id, 10);
      if (!(await requireReadable(communityId, req.user?.id, res))) return;

      const postId = parseInt(req.params.postId, 10);
      const thread = await communityForumRepo.getThread(postId, req.user?.id);
      if (!thread || thread.topic.communityId !== communityId) {
        return res.status(404).json({ message: 'Topic not found' });
      }
      const community = await communityRepo.getCommunity(communityId);
      res.json({
        ...thread,
        // The reader needs to know which regime they are under before they
        // report something, or the report is a shot in the dark.
        moderation: community?.type === 'managed' ? 'admins' : 'members',
        canPost: req.user ? await communityRepo.isCommunityMember(communityId, req.user.id) : false,
        canModerate: req.user ? await isOfficer(communityId, req.user.id) : false,
      });
    } catch (error) {
      logger.error('[forum] get thread failed', { err: (error as any)?.message });
      res.status(500).json({ message: 'Failed to load the topic' });
    }
  });

  // ── Writing ──────────────────────────────────────────────────────────────

  app.post('/api/communities/:id/posts', requireAuth, requireConsent, async (req: any, res) => {
    try {
      const communityId = parseInt(req.params.id, 10);
      if (!(await requireReadable(communityId, req.user.id, res))) return;
      if (!(await requireMember(communityId, req.user.id, res))) return;

      const content = trimmed(req.body?.content);
      const title = trimmed(req.body?.title);
      const parentId = req.body?.parentId == null ? null : Number(req.body.parentId);

      if (!content) return res.status(400).json({ message: 'Content is required' });
      if (content.length > CONTENT_MAX) {
        return res.status(400).json({ message: `Content must be at most ${CONTENT_MAX} characters` });
      }

      const last = await communityForumRepo.lastPostAt(req.user.id);
      if (last && Date.now() - last.getTime() < POST_COOLDOWN_MS) {
        const wait = Math.ceil((POST_COOLDOWN_MS - (Date.now() - last.getTime())) / 1000);
        return res.status(429).json({ message: `Wait ${wait}s before posting again`, retryAfterSeconds: wait });
      }

      // ── Reply ──
      if (parentId != null) {
        if (!Number.isInteger(parentId)) return res.status(400).json({ message: 'Invalid parentId' });
        const parent = await communityForumRepo.getPost(parentId);
        if (!parent || parent.communityId !== communityId) {
          return res.status(404).json({ message: 'Topic not found' });
        }
        // One level, not a tree: a reply to a reply attaches to the topic.
        const topicId = parent.parentId ?? parent.id;
        const topic = parent.parentId ? await communityForumRepo.getPost(topicId) : parent;
        if (topic?.deletedAt || topic?.hiddenAt) {
          return res.status(409).json({ message: 'This topic is closed' });
        }
        const reply = await communityForumRepo.createReply(topicId, communityId, req.user.id, content);

        // Only the topic's author is told, and only about their own topic.
        // Notifying every participant on every message is how a platform
        // teaches people to switch notifications off altogether.
        if (topic && topic.authorId !== req.user.id) {
          const short = content.length > 120 ? `${content.slice(0, 117)}…` : content;
          void createNotification({
            userId: topic.authorId,
            type: 'forum_reply',
            title: 'Νέα απάντηση στο θέμα σου',
            message: short,
            communityId,
            actionUrl: `/communities/${communityId}?tab=forum&post=${topicId}`,
          }).catch(() => { /* a missed notification must never fail the post */ });
        }
        return res.status(201).json(reply);
      }

      // ── Topic ──
      if (!title) return res.status(400).json({ message: 'A topic needs a title' });
      if (title.length > TITLE_MAX) {
        return res.status(400).json({ message: `Title must be at most ${TITLE_MAX} characters` });
      }
      const topic = await communityForumRepo.createTopic(communityId, req.user.id, title, content);
      res.status(201).json(topic);
    } catch (error) {
      logger.error('[forum] create post failed', { err: (error as any)?.message });
      res.status(500).json({ message: 'Failed to post' });
    }
  });

  app.patch('/api/communities/:id/posts/:postId', requireAuth, async (req: any, res) => {
    try {
      const found = await loadPost(req.params.id, req.params.postId, res);
      if (!found) return;
      const { post, postId } = found;

      if (post.authorId !== req.user.id) {
        return res.status(403).json({ message: 'Only the author can edit a post' });
      }
      if (post.deletedAt || post.hiddenAt) {
        return res.status(409).json({ message: 'This post can no longer be edited' });
      }
      const content = trimmed(req.body?.content);
      if (!content) return res.status(400).json({ message: 'Content is required' });
      if (content.length > CONTENT_MAX) {
        return res.status(400).json({ message: `Content must be at most ${CONTENT_MAX} characters` });
      }
      const title = post.parentId == null ? trimmed(req.body?.title) || post.title : null;
      if (title && title.length > TITLE_MAX) {
        return res.status(400).json({ message: `Title must be at most ${TITLE_MAX} characters` });
      }
      res.json(await communityForumRepo.editPost(postId, content, title));
    } catch (error) {
      logger.error('[forum] edit post failed', { err: (error as any)?.message });
      res.status(500).json({ message: 'Failed to edit the post' });
    }
  });

  app.delete('/api/communities/:id/posts/:postId', requireAuth, async (req: any, res) => {
    try {
      const found = await loadPost(req.params.id, req.params.postId, res);
      if (!found) return;
      const { post, postId, communityId } = found;

      // The author withdraws their own words; an officer of a managed
      // community removes someone else's through /hide, which demands a
      // reason and says who did it. Deleting silently is not moderation.
      if (post.authorId !== req.user.id) {
        return res.status(403).json({ message: 'Only the author can delete a post' });
      }
      if (post.deletedAt) return res.json({ ok: true });
      await communityForumRepo.softDelete(postId);
      logger.info('[forum] post withdrawn by author', { postId, communityId, userId: req.user.id });
      res.json({ ok: true });
    } catch (error) {
      logger.error('[forum] delete post failed', { err: (error as any)?.message });
      res.status(500).json({ message: 'Failed to delete the post' });
    }
  });

  // ── Usefulness votes ─────────────────────────────────────────────────────

  app.post('/api/communities/:id/posts/:postId/vote', requireAuth, async (req: any, res) => {
    try {
      const found = await loadPost(req.params.id, req.params.postId, res);
      if (!found) return;
      const { post, postId, communityId } = found;
      if (!(await requireMember(communityId, req.user.id, res))) return;
      if (post.deletedAt || post.hiddenAt) {
        return res.status(409).json({ message: 'This post is no longer open to votes' });
      }
      const direction = req.body?.direction;
      if (direction !== 'up' && direction !== 'down') {
        return res.status(400).json({ message: "direction must be 'up' or 'down'" });
      }
      res.json(await communityForumRepo.vote(postId, req.user.id, direction));
    } catch (error) {
      logger.error('[forum] vote failed', { err: (error as any)?.message });
      res.status(500).json({ message: 'Failed to record the vote' });
    }
  });

  // ── Moderation ───────────────────────────────────────────────────────────

  /**
   * Report a post, or defend one. In an autonomous community these votes are
   * the verdict; in a managed one they are a message to the administrators.
   */
  app.post('/api/communities/:id/posts/:postId/flag', requireAuth, async (req: any, res) => {
    try {
      const found = await loadPost(req.params.id, req.params.postId, res);
      if (!found) return;
      const { post, postId, communityId } = found;
      if (!(await requireMember(communityId, req.user.id, res))) return;
      if (post.deletedAt) return res.status(409).json({ message: 'This post is already gone' });

      const direction = req.body?.direction ?? 'hide';
      if (!isFlagDirection(direction)) {
        return res.status(400).json({ message: "direction must be 'hide' or 'keep'" });
      }
      // Nobody votes their own post down out of existence, and nobody needs
      // to defend their own: both are noise in the tally.
      if (post.authorId === req.user.id) {
        return res.status(403).json({ message: 'You cannot flag your own post' });
      }
      const reason = trimmed(req.body?.reason) || null;
      const tally = await communityForumRepo.flag(postId, req.user.id, direction, reason);

      const community = await communityRepo.getCommunity(communityId);
      let hidden = post.hiddenAt != null;
      if (community?.type !== 'managed') {
        hidden = await communityForumRepo.applyFlagVerdict(postId, tally);
        if (hidden && post.hiddenAt == null) {
          logger.info('[forum] post hidden by member majority', { postId, communityId, tally });
        }
      }
      res.json({ tally, hidden, moderation: community?.type === 'managed' ? 'admins' : 'members' });
    } catch (error) {
      logger.error('[forum] flag failed', { err: (error as any)?.message });
      res.status(500).json({ message: 'Failed to record the report' });
    }
  });

  /** Direct removal. Managed communities only — the others have no officer to do it. */
  app.post('/api/communities/:id/posts/:postId/hide', requireAuth, async (req: any, res) => {
    try {
      const found = await loadPost(req.params.id, req.params.postId, res);
      if (!found) return;
      const { post, postId, communityId } = found;

      const community = await communityRepo.getCommunity(communityId);
      if (community?.type !== 'managed') {
        return res.status(409).json({
          message: 'This community has no administrators; members hide a post by majority',
        });
      }
      if (!(await isOfficer(communityId, req.user.id))) {
        return res.status(403).json({ message: 'Not authorized' });
      }
      const reason = trimmed(req.body?.reason);
      // An unexplained removal is indistinguishable from censorship, so the
      // reason is required rather than optional.
      if (!reason) return res.status(400).json({ message: 'A reason is required' });

      await communityForumRepo.hide(postId, reason, req.user.id);
      logger.info('[forum] post hidden by officer', { postId, communityId, by: req.user.id, reason });
      res.json({ ok: true });
    } catch (error) {
      logger.error('[forum] hide failed', { err: (error as any)?.message });
      res.status(500).json({ message: 'Failed to hide the post' });
    }
  });

  app.post('/api/communities/:id/posts/:postId/unhide', requireAuth, async (req: any, res) => {
    try {
      const found = await loadPost(req.params.id, req.params.postId, res);
      if (!found) return;
      const { post, postId, communityId } = found;

      const community = await communityRepo.getCommunity(communityId);
      if (community?.type !== 'managed') {
        return res.status(409).json({
          message: 'This community has no administrators; the members decide by vote',
        });
      }
      if (!(await isOfficer(communityId, req.user.id))) {
        return res.status(403).json({ message: 'Not authorized' });
      }
      if (post.deletedAt) return res.status(409).json({ message: 'The author withdrew this post' });
      await communityForumRepo.unhide(postId);
      logger.info('[forum] post restored by officer', { postId, communityId, by: req.user.id });
      res.json({ ok: true });
    } catch (error) {
      logger.error('[forum] unhide failed', { err: (error as any)?.message });
      res.status(500).json({ message: 'Failed to restore the post' });
    }
  });

  app.post('/api/communities/:id/posts/:postId/pin', requireAuth, async (req: any, res) => {
    try {
      const found = await loadPost(req.params.id, req.params.postId, res);
      if (!found) return;
      const { post, postId, communityId } = found;

      if (post.parentId != null) return res.status(400).json({ message: 'Only a topic can be pinned' });
      if (!(await isOfficer(communityId, req.user.id))) {
        return res.status(403).json({ message: 'Not authorized' });
      }
      res.json(await communityForumRepo.setPinned(postId, req.body?.pinned !== false));
    } catch (error) {
      logger.error('[forum] pin failed', { err: (error as any)?.message });
      res.status(500).json({ message: 'Failed to pin the topic' });
    }
  });

  // ── Promotion to a proposal ──────────────────────────────────────────────

  /**
   * Record that a proposal came out of a topic.
   *
   * The proposal itself is written in the proposal form, not here: it needs a
   * track, durations and the author's attention, and a forum post silently
   * becoming a proposal would be a worse outcome than a little friction. The
   * client sends the reader to the form prefilled, and calls this once the
   * proposal exists so the topic can point at what it produced.
   */
  app.post('/api/communities/:id/posts/:postId/link-proposal', requireAuth, async (req: any, res) => {
    try {
      const found = await loadPost(req.params.id, req.params.postId, res);
      if (!found) return;
      const { post, postId, communityId } = found;
      if (!(await requireMember(communityId, req.user.id, res))) return;
      if (post.parentId != null) {
        return res.status(400).json({ message: 'Only a topic can become a proposal' });
      }

      const proposalId = Number(req.body?.proposalId);
      if (!Number.isInteger(proposalId)) {
        return res.status(400).json({ message: 'proposalId is required' });
      }
      const proposal = await proposalRepo.getProposal(proposalId);
      if (!proposal || proposal.communityId !== communityId) {
        return res.status(404).json({ message: 'Proposal not found in this community' });
      }
      // Only the person who wrote the proposal may attach it, and only to a
      // topic that has not already produced one — otherwise a topic's history
      // could be rewritten to claim someone else's work.
      if (proposal.authorId !== req.user.id) {
        return res.status(403).json({ message: 'Only the proposal author can link it' });
      }
      if (post.promotedProposalId) {
        return res.status(409).json({ message: 'This topic already became a proposal' });
      }
      res.json(await communityForumRepo.linkProposal(postId, proposalId));
    } catch (error) {
      logger.error('[forum] link proposal failed', { err: (error as any)?.message });
      res.status(500).json({ message: 'Failed to link the proposal' });
    }
  });
}
