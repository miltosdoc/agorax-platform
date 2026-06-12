/**
 * Client-side panel enrollment + panel-token API glue.
 *
 * Enrollment mirrors the anonymous-vote dance (lib/anonymous-vote.ts):
 *   1. GET  /api/panel/enroll/key      → enrollment public key (authenticated)
 *   2. blind(publicKey) locally        → { token, blindingFactor, blinded }
 *   3. POST /api/panel/enroll/sign     → blind signature (authenticated;
 *                                        records one-per-user + consent)
 *   4. unblind locally                 → RSA-PSS signature on the token
 *   5. POST /api/panel/register        → panelist row (UNauthenticated,
 *                                        credentials OMITTED — the session
 *                                        must never ride along)
 *   6. localStorage keeps the token — it IS the panel identity. Clearing
 *      browser storage loses panel membership permanently (the enrollment
 *      ledger blocks a second blind signature by design).
 */
import { blind, unblind, bytesToBase64, type PublicKey } from '@shared/blind-sig';
import type { PanelProfileInput } from '@shared/polling';
import { api } from './api';

const TOKEN_KEY = 'agorax_panel_token_v1';

export function getPanelToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function clearPanelToken(): void {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* noop */ }
}

/**
 * Import a panel identity from another device. The token is the bearer
 * credential — we validate it against /api/panel/me before storing, so a
 * typo can't silently brick the panel UI.
 */
export async function importPanelToken(token: string): Promise<boolean> {
  const trimmed = token.trim();
  if (!trimmed || trimmed.length > 200) return false;
  const res = await fetch('/api/panel/me', {
    credentials: 'omit',
    headers: { 'X-Panel-Token': trimmed, 'ngrok-skip-browser-warning': '1' },
  });
  if (!res.ok) return false;
  try { localStorage.setItem(TOKEN_KEY, trimmed); } catch { return false; }
  return true;
}

export interface EnrollKeyInfo {
  publicKey: PublicKey;
  alreadyEnrolled: boolean;
  consentVersion: string;
  consentText: Record<'el' | 'en', string>;
}

export async function fetchEnrollKey(): Promise<EnrollKeyInfo> {
  const resp = await api.get<EnrollKeyInfo>('/api/panel/enroll/key');
  return resp.data;
}

/** Run the full blind-signature enrollment and register the panelist. */
export async function enrollInPanel(
  profile: PanelProfileInput,
  consentVersion: string,
  locale: 'el' | 'en' = 'el',
): Promise<{ panelistId: number }> {
  const info = await fetchEnrollKey();

  const req = await blind(info.publicKey, Date.now());

  const signResp = await api.post<{ signature: string; publicKey: PublicKey; sourceChannel: string }>(
    '/api/panel/enroll/sign',
    { blindedToken: req.blinded, consentVersion, consentLocale: locale },
  );

  const signature = await unblind(
    signResp.data.signature,
    req.token,
    req.preparedMsg,
    req.blindingFactor,
    signResp.data.publicKey,
  );

  const tokenB64 = bytesToBase64(req.token);
  // credentials: 'omit' — the anonymous registration must not carry the
  // session cookie, or the operator could correlate panelist ↔ user.
  // ngrok-skip-browser-warning: cookieless requests through an ngrok
  // tunnel would otherwise get the HTML warning interstitial (the bypass
  // cookie is stripped along with everything else). Harmless elsewhere.
  const res = await fetch('/api/panel/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
    credentials: 'omit',
    body: JSON.stringify({
      token: tokenB64,
      preparedMsg: bytesToBase64(req.preparedMsg),
      signature,
      sourceChannel: signResp.data.sourceChannel,
      profile,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `Registration failed (${res.status})`);
  }
  const json = await res.json();
  try { localStorage.setItem(TOKEN_KEY, tokenB64); } catch { /* noop */ }
  return { panelistId: json.panelistId };
}

/** Panel-token-authenticated fetch (anonymous side — no cookies). */
export async function panelFetch<T>(
  url: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const token = getPanelToken();
  if (!token) throw new Error('not_panelist');
  const res = await fetch(url, {
    method: init?.method ?? 'GET',
    credentials: 'omit',
    headers: {
      'X-Panel-Token': token,
      // Cookieless fetches through ngrok need this to skip the HTML
      // interstitial (see enrollInPanel). Harmless on other hosts.
      'ngrok-skip-browser-warning': '1',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const contentType = res.headers.get('content-type') ?? '';
  if (res.ok && !contentType.includes('application/json')) {
    throw new Error('Μη αναμενόμενη απάντηση διακομιστή — δοκίμασε ξανά.');
  }
  if (res.status === 401) {
    throw new Error('not_panelist');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export interface PanelMe {
  panelistId: number;
  sourceChannel: string;
  enrolledAt: string;
  profile: Record<string, unknown> | null;
  profileRefreshDue: boolean;
}

export async function fetchPanelMe(): Promise<PanelMe | null> {
  if (!getPanelToken()) return null;
  try {
    return await panelFetch<PanelMe>('/api/panel/me');
  } catch (err) {
    if (err instanceof Error && err.message === 'not_panelist') return null;
    throw err;
  }
}
