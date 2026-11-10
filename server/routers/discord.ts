/**
 * Discord: sign in with Discord, and a community's Discord channel settings.
 *
 * Sign-in mirrors Google sign-in (server/auth.ts): the callback is also the
 * sign-up, the new member joins the General community, and consent is asked
 * on first visit through users.requiresConsent like every other new account.
 * One difference: Discord accounts can carry an unverified email, so an
 * existing AgoraX account is matched by email only when Discord has verified
 * that address. Otherwise anyone could claim an account by typing its email
 * into Discord.
 *
 * Web only for now; the Android app keeps Google and email sign-in.
 */

import type { Express, Request, Response } from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { users, type User } from '@shared/schema';
import { requireAuth, storage } from '../auth';
import { communityRepo } from '../storage';
import { addMember, getGeneralCommunity } from '../utils/community-manager';
import { isContentPublic } from '../utils/community-visibility';
import {
  DiscordError, connect, disconnect, getConnection, normalizeWebhookUrl, sendTestMessage, setAllowPrivate,
} from '../utils/discord';

const DISCORD_API = 'https://discord.com/api';
const STATE_TTL_MS = 10 * 60_000;

export const discordLoginConfigured = () => !!(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);

function callbackUrl(): string {
  if (process.env.DISCORD_CALLBACK_URL) return process.env.DISCORD_CALLBACK_URL;
  const base = (process.env.APP_PUBLIC_URL || 'https://agoraxdemocracy.com').replace(/\/+$/, '');
  return `${base}/auth/discord/callback`;
}

/** Same rule as utils/session-user: only active accounts may hold a session. */
const accountActive = (user: { accountStatus?: string | null }) => user.accountStatus == null || user.accountStatus === 'active';

const safeReturnTo = (value: unknown) =>
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/feed';

interface DiscordProfile {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
  email?: string | null;
  verified?: boolean;
}

async function fetchDiscordProfile(code: string): Promise<DiscordProfile> {
  const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    signal: AbortSignal.timeout(10_000),
    body: new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID!,
      client_secret: process.env.DISCORD_CLIENT_SECRET!,
      grant_type: 'authorization_code',
      code,
      redirect_uri: callbackUrl(),
    }),
  });
  if (!tokenRes.ok) throw new Error(`token exchange ${tokenRes.status}`);
  const { access_token } = await tokenRes.json() as { access_token?: string };
  if (!access_token) throw new Error('no access token');
  const meRes = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${access_token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!meRes.ok) throw new Error(`profile ${meRes.status}`);
  return await meRes.json() as DiscordProfile;
}

type SignInResult = { user: User } | { error: 'no_email' | 'unverified_email' | 'inactive' };

async function findOrCreateUser(profile: DiscordProfile): Promise<SignInResult> {
  const avatar = profile.avatar ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png?size=256` : null;

  const linked = await storage.getUserByProviderId(profile.id, 'discord');
  if (linked) return accountActive(linked) ? { user: linked } : { error: 'inactive' };

  const email = profile.email?.trim().toLowerCase();
  if (!email) return { error: 'no_email' };
  const verified = profile.verified === true;

  const existing = await storage.getUserByEmail(email);
  if (existing) {
    if (!verified) return { error: 'unverified_email' };
    if (!accountActive(existing)) return { error: 'inactive' };
    // An account already tied to Google keeps that link (one provider per
    // row); later Discord sign-ins find it again through the verified email.
    const keepProvider = existing.provider && existing.provider !== 'local' && existing.provider !== 'discord';
    const changes = {
      ...(keepProvider ? {} : { provider: 'discord', providerId: profile.id }),
      ...(existing.profilePicture || !avatar ? {} : { profilePicture: avatar }),
      ...(!existing.emailVerifiedAt ? { emailVerifiedAt: new Date() } : {}),
    };
    // Often nothing to change (a Google-linked, verified account with a
    // picture), and an empty update is an error, not a no-op.
    if (Object.keys(changes).length === 0) return { user: existing };
    const [updated] = await db.update(users)
      .set(changes)
      .where(eq(users.id, existing.id))
      .returning();
    return { user: updated };
  }

  const base = (profile.username || 'user').toLowerCase().replace(/[^a-z0-9_.]/g, '') || 'user';
  let username = base;
  for (let n = 1; await storage.getUserByUsername(username); n++) username = `${base}${n}`;

  const user = await storage.createUser({
    username,
    name: profile.global_name || profile.username || 'User',
    email,
    provider: 'discord',
    providerId: profile.id,
    profilePicture: avatar,
    emailVerifiedAt: verified ? new Date() : null,
  } as any);

  try {
    const general = await getGeneralCommunity();
    if (general) await addMember(general.id, user.id);
    else console.warn(`[enrol] no General community exists — user ${user.id} signed up with no community`);
  } catch (err: any) {
    console.error(`[enrol] General-community enrolment failed for Discord user ${user.id}: ${err?.message}`);
  }
  return { user };
}

/** Who may connect a community to Discord: admins in managed, the founder in autonomous. */
async function canManageDiscord(communityId: number, userId: number) {
  const community = await communityRepo.getCommunity(communityId);
  if (!community) return { community: null, allowed: false };
  const role = await communityRepo.getCommunityMemberRole(communityId, userId);
  const allowed = community.type === 'managed'
    ? role === 'admin' || role === 'founder'
    : role === 'founder' || community.creatorId === userId;
  return { community, allowed };
}

export function registerDiscordRoutes(app: Express): void {
  // ─── Sign in with Discord ────────────────────────────────────────────────

  app.get('/api/auth/providers', (_req, res) => {
    res.json({
      google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      discord: discordLoginConfigured(),
    });
  });

  app.get('/auth/discord', (req: Request, res: Response) => {
    if (!discordLoginConfigured()) return res.redirect('/auth?error=discord_unavailable');
    const state = randomBytes(24).toString('hex');
    (req.session as any).discordOAuth = { state, returnTo: safeReturnTo(req.query.returnTo), expires: Date.now() + STATE_TTL_MS };
    const params = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID!,
      redirect_uri: callbackUrl(),
      response_type: 'code',
      scope: 'identify email',
      state,
      prompt: 'none',
    });
    req.session.save(() => res.redirect(`https://discord.com/oauth2/authorize?${params}`));
  });

  app.get('/auth/discord/callback', async (req: Request, res: Response) => {
    const attempt = (req.session as any).discordOAuth as { state: string; returnTo: string; expires: number } | undefined;
    delete (req.session as any).discordOAuth;
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const sameState = !!attempt && state.length === attempt.state.length
      && timingSafeEqual(Buffer.from(state), Buffer.from(attempt.state));
    if (!attempt || !sameState || attempt.expires < Date.now() || !code) {
      return res.redirect('/auth?error=authentication_failed');
    }
    try {
      const profile = await fetchDiscordProfile(code);
      const result = await findOrCreateUser(profile);
      if ('error' in result) return res.redirect(`/auth?error=discord_${result.error}`);
      req.login(result.user, (err) => {
        if (err) return res.redirect('/auth?error=login_failed');
        res.redirect(attempt.returnTo);
      });
    } catch (err: any) {
      console.warn(`[discord] sign-in failed: ${err?.message}`);
      res.redirect('/auth?error=authentication_failed');
    }
  });

  // ─── A community's Discord channel ─────────────────────────────────────

  app.get('/api/communities/:id/discord', requireAuth, async (req: any, res) => {
    try {
      const communityId = parseInt(req.params.id);
      const { community, allowed } = await canManageDiscord(communityId, req.user.id);
      if (!community) return res.status(404).json({ message: 'Community not found' });
      if (!allowed) return res.status(403).json({ message: 'Not authorized' });
      const conn = await getConnection(communityId);
      const contentPublic = isContentPublic(community);
      // The webhook URL itself never leaves the server.
      res.json({
        connected: !!conn,
        webhookName: conn?.webhookName ?? null,
        allowPrivate: conn?.allowPrivate ?? false,
        contentPublic,
        posting: !!conn && (contentPublic || conn.allowPrivate),
        lastError: conn?.lastError ?? null,
        connectedAt: conn?.createdAt ?? null,
      });
    } catch {
      res.status(500).json({ message: 'Failed to load Discord settings' });
    }
  });

  app.put('/api/communities/:id/discord', requireAuth, async (req: any, res) => {
    try {
      const communityId = parseInt(req.params.id);
      const { community, allowed } = await canManageDiscord(communityId, req.user.id);
      if (!community) return res.status(404).json({ message: 'Community not found' });
      if (!allowed) return res.status(403).json({ message: 'Not authorized' });
      const allowPrivate = req.body?.allowPrivate === true;

      // Only the privacy confirmation changes: no new URL needed.
      if (req.body?.webhookUrl === undefined) {
        if (!await getConnection(communityId)) return res.status(404).json({ message: 'Not connected' });
        await setAllowPrivate(communityId, allowPrivate);
        return res.json({ success: true });
      }

      const url = normalizeWebhookUrl(req.body.webhookUrl);
      if (!url) {
        return res.status(400).json({ message: 'That is not a Discord webhook URL. In Discord: channel settings → Integrations → Webhooks → Copy Webhook URL.' });
      }
      const info = await connect(communityId, url, allowPrivate, req.user.id);
      const testError = await sendTestMessage(communityId);
      res.json({ success: true, webhookName: info.name, testError });
    } catch (error) {
      if (error instanceof DiscordError) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: 'Failed to connect Discord' });
    }
  });

  app.post('/api/communities/:id/discord/test', requireAuth, async (req: any, res) => {
    try {
      const communityId = parseInt(req.params.id);
      const { community, allowed } = await canManageDiscord(communityId, req.user.id);
      if (!community) return res.status(404).json({ message: 'Community not found' });
      if (!allowed) return res.status(403).json({ message: 'Not authorized' });
      const error = await sendTestMessage(communityId);
      if (error) return res.status(502).json({ message: error });
      res.json({ success: true });
    } catch {
      res.status(500).json({ message: 'Failed to send test message' });
    }
  });

  app.delete('/api/communities/:id/discord', requireAuth, async (req: any, res) => {
    try {
      const communityId = parseInt(req.params.id);
      const { community, allowed } = await canManageDiscord(communityId, req.user.id);
      if (!community) return res.status(404).json({ message: 'Community not found' });
      if (!allowed) return res.status(403).json({ message: 'Not authorized' });
      await disconnect(communityId);
      res.json({ success: true });
    } catch {
      res.status(500).json({ message: 'Failed to disconnect Discord' });
    }
  });
}
