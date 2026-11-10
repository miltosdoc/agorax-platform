/**
 * Discord bridge: one-way announcements from a community into its Discord
 * channel, through a channel webhook the community's admin pastes in.
 *
 * Discord is where the students talk; AgoraX is where they decide. So the
 * posts only point back here: a new proposal, a vote opening, a vote about to
 * close, a result, a meeting. Nothing is ever voted on in Discord, and nothing
 * sensitive is posted: no removal votes, no names on ballots, no tallies.
 *
 * Privacy: a community whose content is members-only posts nothing unless the
 * admin confirmed the Discord channel is limited to the community's members
 * (allowPrivate). If the community later switches to members-only, posting
 * stops on its own.
 *
 * Every call here is best-effort: a Discord outage must never break a
 * proposal transition or a notification fan-out.
 */

import { db } from '../db';
import { communities, communityDiscord, discordPosts, proposals } from '@shared/schema';
import { and, eq, gt, lt, sql } from 'drizzle-orm';
import { isContentPublic } from './community-visibility';

const WEBHOOK_RE = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/(\d{15,25})\/([A-Za-z0-9_-]{30,100})$/;
const BRAND_COLOR = 0x173b63;
const TIMEOUT_MS = 8000;

export type DiscordEvent = 'new_proposal' | 'vote_started' | 'vote_closing' | 'decided' | 'meeting' | 'test';

/** Canonical webhook URL, or null if it is not a Discord webhook URL. */
export function normalizeWebhookUrl(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim().split(/[?#]/)[0].replace(/\/+$/, '');
  const m = WEBHOOK_RE.exec(trimmed);
  // Always talk to discord.com, whatever host was pasted. Matching the strict
  // pattern above is also what keeps this from being a way to make the
  // server fetch arbitrary URLs.
  return m ? `https://discord.com/api/webhooks/${m[1]}/${m[2]}` : null;
}

function publicBaseUrl(): string {
  return (process.env.APP_PUBLIC_URL || 'https://agoraxdemocracy.com').replace(/\/+$/, '');
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
/** Discord timestamp markup: shown in each reader's own timezone and language. */
const when = (date: Date) => `<t:${Math.floor(date.getTime() / 1000)}:F> (<t:${Math.floor(date.getTime() / 1000)}:R>)`;

export class DiscordError extends Error {}

/** Ask Discord about a webhook. Throws DiscordError when it is not usable. */
export async function inspectWebhook(url: string): Promise<{ channelId: string | null; guildId: string | null; name: string | null }> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new DiscordError('Could not reach Discord. Try again in a moment.');
  }
  if (res.status === 401 || res.status === 404) {
    throw new DiscordError('Discord does not recognise this webhook. Copy the URL again from the channel settings.');
  }
  if (!res.ok) throw new DiscordError(`Discord answered ${res.status}. Try again in a moment.`);
  const body = await res.json().catch(() => ({})) as { channel_id?: string; guild_id?: string; name?: string };
  return { channelId: body.channel_id ?? null, guildId: body.guild_id ?? null, name: body.name ?? null };
}

interface Embed {
  title: string;
  description?: string;
  url?: string;
  footer?: string;
}

/** Post one message. Returns null on success, otherwise the error text. */
async function postToWebhook(url: string, embed: Embed): Promise<string | null> {
  try {
    const res = await fetch(`${url}?wait=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        username: 'AgoraX',
        // Titles are member-written: never let one ping @everyone or a role.
        allowed_mentions: { parse: [] },
        embeds: [{
          title: clip(embed.title, 256),
          description: embed.description ? clip(embed.description, 2000) : undefined,
          url: embed.url,
          color: BRAND_COLOR,
          footer: embed.footer ? { text: clip(embed.footer, 200) } : undefined,
          timestamp: new Date().toISOString(),
        }],
      }),
    });
    if (res.ok) return null;
    if (res.status === 401 || res.status === 404) return 'The webhook was deleted in Discord. Connect a new one.';
    if (res.status === 429) return 'Discord rate limit: try again shortly.';
    return `Discord answered ${res.status}.`;
  } catch (err: any) {
    return `Could not reach Discord (${err?.name === 'TimeoutError' ? 'timeout' : 'network'}).`;
  }
}

/** The community's connection, if it may post right now. */
async function postableConnection(communityId: number) {
  const [row] = await db
    .select({
      webhookUrl: communityDiscord.webhookUrl,
      allowPrivate: communityDiscord.allowPrivate,
      name: communities.name,
      contentVisibility: communities.contentVisibility,
    })
    .from(communityDiscord)
    .innerJoin(communities, eq(communities.id, communityDiscord.communityId))
    .where(eq(communityDiscord.communityId, communityId));
  if (!row) return null;
  if (!isContentPublic(row) && !row.allowPrivate) return null;
  return row;
}

async function recordResult(communityId: number, error: string | null): Promise<void> {
  await db.update(communityDiscord)
    .set({ lastError: error, updatedAt: new Date() })
    .where(eq(communityDiscord.communityId, communityId));
}

/**
 * Post an announcement once. The (community, event, subject) claim is taken
 * before posting so concurrent callers cannot double-post; it is released if
 * the post fails, so a later attempt may try again.
 */
async function announce(communityId: number, event: DiscordEvent, subjectId: number, build: (communityName: string) => Embed): Promise<void> {
  try {
    const conn = await postableConnection(communityId);
    if (!conn) return;
    const claimed = await db.insert(discordPosts)
      .values({ communityId, event, subjectId })
      .onConflictDoNothing()
      .returning({ id: discordPosts.id });
    if (claimed.length === 0) return;

    const error = await postToWebhook(conn.webhookUrl, build(conn.name));
    await recordResult(communityId, error);
    if (error) {
      await db.delete(discordPosts).where(eq(discordPosts.id, claimed[0].id));
      console.warn(`[discord] community ${communityId} ${event} #${subjectId}: ${error}`);
    }
  } catch (err: any) {
    console.warn(`[discord] community ${communityId} ${event} #${subjectId} failed: ${err?.message}`);
  }
}

/** Send a test message. Returns null on success, otherwise the error text. */
export async function sendTestMessage(communityId: number): Promise<string | null> {
  const [row] = await db
    .select({ webhookUrl: communityDiscord.webhookUrl, name: communities.name })
    .from(communityDiscord)
    .innerJoin(communities, eq(communities.id, communityDiscord.communityId))
    .where(eq(communityDiscord.communityId, communityId));
  if (!row) return 'Not connected.';
  const error = await postToWebhook(row.webhookUrl, {
    title: `👋 Η κοινότητα «${row.name}» συνδέθηκε με αυτό το κανάλι`,
    description: 'Εδώ θα εμφανίζονται οι νέες προτάσεις, οι ψηφοφορίες, τα αποτελέσματα και οι συναντήσεις. Η ψηφοφορία γίνεται πάντα στην πλατφόρμα.',
    url: `${publicBaseUrl()}/communities/${communityId}`,
    footer: row.name,
  });
  await recordResult(communityId, error);
  return error;
}

// ─── Events ─────────────────────────────────────────────────────────────────

async function loadProposal(proposalId: number) {
  const [p] = await db
    .select({
      id: proposals.id,
      communityId: proposals.communityId,
      question: proposals.question,
      status: proposals.status,
      kind: proposals.kind,
      phaseDeadline: proposals.phaseDeadline,
    })
    .from(proposals)
    .where(eq(proposals.id, proposalId));
  return p ?? null;
}

const proposalUrl = (id: number) => `${publicBaseUrl()}/proposals/${id}`;

export async function announceNewProposal(proposalId: number, opts: { collecting?: boolean } = {}): Promise<void> {
  const p = await loadProposal(proposalId).catch(() => null);
  if (!p || p.status === 'draft') return;
  const title = opts.collecting && p.kind === 'election' ? '🗳️ Άνοιξαν οι υποψηφιότητες'
    : opts.collecting && p.kind === 'poll' ? '📊 Νέα δημοσκόπηση'
    : '📝 Νέα πρόταση';
  const description = opts.collecting && p.kind === 'election' ? 'Δηλώστε υποψηφιότητα ή προτείνετε κάποιον στην πλατφόρμα.'
    : opts.collecting && p.kind === 'poll' ? 'Προτείνετε απαντήσεις στην πλατφόρμα.'
    : 'Διαβάστε, συζητήστε και βελτιώστε την στην πλατφόρμα.';
  await announce(p.communityId, 'new_proposal', p.id, (name) => ({
    title: `${title}: ${p.question}`,
    description,
    url: proposalUrl(p.id),
    footer: name,
  }));
}

export async function announceVoteStarted(proposalId: number): Promise<void> {
  const p = await loadProposal(proposalId).catch(() => null);
  if (!p) return;
  const poll = p.kind === 'poll';
  await announce(p.communityId, 'vote_started', p.id, (name) => ({
    title: `${poll ? '📊 Ψηφίστε στη δημοσκόπηση' : '🗳️ Ξεκίνησε η ψηφοφορία'}: ${p.question}`,
    description: [
      p.phaseDeadline ? `Ανοιχτή έως ${when(p.phaseDeadline)}.` : null,
      'Η ψήφος δίνεται στην πλατφόρμα και είναι ανώνυμη.',
    ].filter(Boolean).join('\n'),
    url: proposalUrl(p.id),
    footer: name,
  }));
}

export async function announceDecided(proposalId: number): Promise<void> {
  const p = await loadProposal(proposalId).catch(() => null);
  if (!p) return;
  await announce(p.communityId, 'decided', p.id, (name) => ({
    title: `${p.kind === 'poll' ? '📊 Έκλεισε η δημοσκόπηση' : '✅ Ολοκληρώθηκε η ψηφοφορία'}: ${p.question}`,
    description: 'Δείτε το αποτέλεσμα στην πλατφόρμα.',
    url: proposalUrl(p.id),
    footer: name,
  }));
}

export async function announceMeeting(input: { communityId: number; roomId: number; title: string; scheduledAt?: Date | null; actionUrl: string }): Promise<void> {
  await announce(input.communityId, 'meeting', input.roomId, (name) => ({
    title: `🎙️ Συνάντηση: ${input.title}`,
    description: input.scheduledAt ? when(input.scheduledAt) : 'Η συνάντηση είναι ενεργή τώρα.',
    url: `${publicBaseUrl()}${input.actionUrl.startsWith('/') ? input.actionUrl : `/${input.actionUrl}`}`,
    footer: name,
  }));
}

/**
 * "Closes in less than a day" for votes in connected communities. Skipped
 * when the opening was announced under 12 hours ago: a short vote would
 * otherwise get two posts back to back.
 */
export async function sweepClosingVotes(): Promise<number> {
  const now = new Date();
  const rows = await db
    .select({ id: proposals.id, communityId: proposals.communityId, question: proposals.question, kind: proposals.kind, phaseDeadline: proposals.phaseDeadline })
    .from(proposals)
    .innerJoin(communityDiscord, eq(communityDiscord.communityId, proposals.communityId))
    .where(and(
      eq(proposals.status, 'voting'),
      gt(proposals.phaseDeadline, new Date(now.getTime() + 60 * 60_000)),
      lt(proposals.phaseDeadline, new Date(now.getTime() + 24 * 60 * 60_000)),
      sql`NOT EXISTS (
        SELECT 1 FROM discord_posts d
        WHERE d.community_id = ${proposals.communityId} AND d.subject_id = ${proposals.id}
          AND (d.event = 'vote_closing' OR (d.event = 'vote_started' AND d.posted_at > now() - interval '12 hours'))
      )`,
    ));
  for (const p of rows) {
    await announce(p.communityId, 'vote_closing', p.id, (name) => ({
      title: `⏰ Κλείνει σύντομα: ${p.question}`,
      description: `Η ψηφοφορία κλείνει ${when(p.phaseDeadline!)}. Αν δεν έχετε ψηφίσει, προλαβαίνετε.`,
      url: proposalUrl(p.id),
      footer: name,
    }));
  }
  return rows.length;
}

// ─── Connection management ─────────────────────────────────────────────────

export async function getConnection(communityId: number) {
  const [row] = await db.select().from(communityDiscord).where(eq(communityDiscord.communityId, communityId));
  return row ?? null;
}

export async function connect(communityId: number, url: string, allowPrivate: boolean, userId: number) {
  const info = await inspectWebhook(url);
  const values = {
    webhookUrl: url,
    channelId: info.channelId,
    guildId: info.guildId,
    webhookName: info.name,
    allowPrivate,
    setByUserId: userId,
    lastError: null,
    updatedAt: new Date(),
  };
  await db.insert(communityDiscord)
    .values({ communityId, ...values })
    .onConflictDoUpdate({ target: communityDiscord.communityId, set: values });
  return info;
}

export async function disconnect(communityId: number): Promise<void> {
  await db.delete(communityDiscord).where(eq(communityDiscord.communityId, communityId));
}

export async function setAllowPrivate(communityId: number, allowPrivate: boolean): Promise<void> {
  await db.update(communityDiscord)
    .set({ allowPrivate, updatedAt: new Date() })
    .where(eq(communityDiscord.communityId, communityId));
}
