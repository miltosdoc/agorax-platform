/**
 * Client-side anonymous voting glue.
 *
 * Wraps the four-step flow documented in
 * docs/compliance/04_ANONYMOUS_VOTING_DESIGN.md:
 *
 *   1. GET /api/proposals/:id/blind-key            → publicKey
 *   2. blind(publicKey) locally                    → { token, blindingFactor, blinded }
 *   3. POST /api/proposals/:id/blind-sign          → blindedSig
 *   4. unblind(blindedSig, blindingFactor)         → sig
 *   5. POST /api/proposals/:id/anonymous-vote      → receipt
 *   6. localStorage.set(receipt)                   so the voter can verify later
 *
 * The localStorage entry is the voter's only record of how they voted —
 * the server cannot tell. Clearing browser storage permanently loses the
 * choice (you can still confirm "did I vote" via the issuance ledger,
 * just not "how").
 */
import {
  blind,
  unblind,
  bytesToBase64,
  type PublicKey,
} from '@shared/blind-sig';
import { api } from './api';

// Classic ballots use 'yes' | 'no' | 'abstain'; option ballots use ids like
// 'final', 'counter_12', 'status_quo'. The blind-signature crypto is
// choice-agnostic — the server validates the choice against the proposal's
// actual option set when the ballot is cast.
export type AnonymousChoice = string;

export interface AnonymousReceipt {
  proposalId: number;
  token: string;       // base64 of the 40-byte token
  preparedMsg: string; // base64 of the prepared message (RFC 9474 Randomized)
  signature: string;   // base64 RSA-PSS signature
  publicKey: PublicKey;
  choice: AnonymousChoice;
  rowHash: string;     // server-returned chain row hash
  castAt: string;      // ISO timestamp from the server
  storedAt: string;    // when this receipt was saved client-side
}

const STORAGE_KEY = 'agorax_anon_receipts_v1';

/** Load every receipt stored locally. */
export function loadReceipts(): AnonymousReceipt[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** Receipt for a specific proposal, if any. */
export function getReceipt(proposalId: number): AnonymousReceipt | undefined {
  return loadReceipts().find(r => r.proposalId === proposalId);
}

function saveReceipt(r: AnonymousReceipt): void {
  const list = loadReceipts().filter(x => x.proposalId !== r.proposalId);
  list.push(r);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

// GDPR: minimum delay between token issuance and vote casting. This breaks
// timing correlation between the authenticated /blind-sign request (server
// knows user_id) and the unauthenticated /anonymous-vote request (server
// only sees the token). Without this delay, an operator could correlate the
// two requests by timestamp and defeat unlinkability.
// See docs/compliance/AUDIT_IDENTITY_VOTE_ANONYMITY.md §G2
// Overridable for local testing via VITE_VOTE_DECOUPLE_MS.
// 90 seconds (2026-09-16, was 30 minutes): the long delay lost about one in
// nine ballots to voters who never reopened the app before the vote closed.
// A short delay still breaks second-level pairing of the two requests while
// keeping the cast inside the session the voter is already in.
export const MIN_CAST_DELAY_MS = Number((import.meta as any).env?.VITE_VOTE_DECOUPLE_MS ?? 90 * 1000);
// Random jitter ADDED to the minimum delay. A fixed delay defeats itself:
// cast time would equal issuance + exactly 30:00, restoring the timing
// correlation the delay exists to break. With uniform jitter the cast time
// only reveals "issued somewhere in the last 90-180 seconds" — a window, not
// a point. Drawn with crypto randomness; overridable via VITE_VOTE_JITTER_MS.
export const CAST_JITTER_MS = Number((import.meta as any).env?.VITE_VOTE_JITTER_MS ?? MIN_CAST_DELAY_MS);

function drawJitterMs(): number {
  if (CAST_JITTER_MS <= 0) return 0;
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return Math.floor((buf[0] / 0x1_0000_0000) * CAST_JITTER_MS);
}

/**
 * A ballot that has been blind-signed but is not yet valid to cast (the
 * anonymity delay hasn't elapsed). Persisted so the vote survives page
 * reloads and can be cast automatically when it matures.
 */
export interface PendingBallot {
  proposalId: number;
  token: string;       // base64 of the 40-byte token
  preparedMsg: string; // base64 of the prepared message
  signature: string;   // base64 unblinded RSA-PSS signature
  publicKey: PublicKey;
  choice: AnonymousChoice;
  minCastTime: number; // epoch ms when the ballot becomes valid
  requestedAt: string;
}

const PENDING_KEY = 'agorax_pending_ballots_v1';

function loadPendingBallots(): PendingBallot[] {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function getPendingBallot(proposalId: number): PendingBallot | undefined {
  return loadPendingBallots().find(b => b.proposalId === proposalId);
}

function savePendingBallot(b: PendingBallot): void {
  const list = loadPendingBallots().filter(x => x.proposalId !== b.proposalId);
  list.push(b);
  localStorage.setItem(PENDING_KEY, JSON.stringify(list));
}

export function clearPendingBallot(proposalId: number): void {
  const list = loadPendingBallots().filter(x => x.proposalId !== proposalId);
  localStorage.setItem(PENDING_KEY, JSON.stringify(list));
}

/**
 * Phase 1 of the anonymous vote: obtain a blind-signed ballot for the
 * chosen option and persist it locally. The ballot becomes valid to cast
 * after MIN_CAST_DELAY_MS (see castPendingBallot).
 */
export async function requestAnonymousBallot(
  proposalId: number,
  choice: AnonymousChoice,
): Promise<PendingBallot> {
  // 1. Fetch the public key.
  const keyResp = await api.get<PublicKey>(`/api/proposals/${proposalId}/blind-key`);
  const publicKey = keyResp.data;

  // 2. Generate token + blinding factor + blinded value.
  const minCastTime = Date.now() + MIN_CAST_DELAY_MS + drawJitterMs();
  const req = await blind(publicKey, minCastTime);

  // 3. Get the server's blind signature.
  const bsResp = await api.post<{ signature: string; publicKey: PublicKey }>(
    `/api/proposals/${proposalId}/blind-sign`,
    { blindedToken: req.blinded },
  );

  // 4. Unblind to recover a valid RSA-PSS signature on the prepared message.
  // RFC 9474 Randomized variant: prepare() injects fresh entropy, so the
  // prepared message must be stored and reused for finalize + verification.
  const sig = await unblind(
    bsResp.data.signature,
    req.token,
    req.preparedMsg,
    req.blindingFactor,
    bsResp.data.publicKey,
  );

  // Persist the pending ballot: it survives reloads and is cast (by
  // castPendingBallot) once the anonymity delay elapses.
  const pending: PendingBallot = {
    proposalId,
    token: bytesToBase64(req.token),
    preparedMsg: bytesToBase64(req.preparedMsg),
    signature: sig,
    publicKey: bsResp.data.publicKey,
    choice,
    minCastTime,
    requestedAt: new Date().toISOString(),
  };
  savePendingBallot(pending);
  return pending;
}

/**
 * Phase 2: cast a matured pending ballot (NO auth on this route —
 * server-side CSRF + auth are deliberately absent so the request cannot
 * be correlated with the voter's session).
 *
 * GDPR: credentials: 'omit' prevents the browser from sending session
 * cookies with the anonymous-vote request. Without this, the server
 * could correlate the vote to the voter's session via cookie-based
 * session ID, defeating the blind-signature unlinkability guarantee.
 * See docs/compliance/AUDIT_IDENTITY_VOTE_ANONYMITY.md §G5
 */
export async function castPendingBallot(pending: PendingBallot): Promise<AnonymousReceipt> {
  const { proposalId, choice } = pending;
  const voteResp = await fetch(`/api/proposals/${proposalId}/anonymous-vote`, {
    method: 'POST',
    // ngrok-skip-browser-warning: a cookieless request through an ngrok
    // tunnel otherwise gets the HTML warning interstitial (the bypass
    // cookie is stripped along with the session). Harmless elsewhere.
    headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
    body: JSON.stringify({ token: pending.token, preparedMsg: pending.preparedMsg, signature: pending.signature, choice }),
    credentials: 'omit', // GDPR: no session cookies on anonymous vote path
  });
  if (!voteResp.ok) {
    let message = `vote failed (${voteResp.status})`;
    let minCastTime: number | undefined;
    try {
      const j = await voteResp.json();
      if (typeof j?.message === 'string') message = j.message;
      if (typeof j?.minCastTime === 'number') minCastTime = j.minCastTime;
    } catch { /* keep default */ }
    // Not yet valid: keep the pending ballot so the caller can retry later.
    if (minCastTime && Date.now() < minCastTime) {
      const waitSec = Math.ceil((minCastTime - Date.now()) / 1000);
      throw new Error(`${message} (wait ${waitSec}s)`);
    }
    throw new Error(message);
  }
  const result = (await voteResp.json()) as { rowHash: string; castAt: string };

  // Persist the receipt locally — the only record of HOW the voter voted.
  const receipt: AnonymousReceipt = {
    proposalId,
    token: pending.token,
    preparedMsg: pending.preparedMsg,
    signature: pending.signature,
    publicKey: pending.publicKey,
    choice,
    rowHash: result.rowHash,
    castAt: result.castAt,
    storedAt: new Date().toISOString(),
  };
  saveReceipt(receipt);
  clearPendingBallot(proposalId);
  return receipt;
}

/**
 * Ask the server whether a given token has been counted, and what choice
 * it carries. The deniable property: anyone holding the token can do this
 * lookup, so the result cannot be used to coerce the voter.
 */
/**
 * Cast every pending ballot whose privacy delay has elapsed — called once on
 * app start so a voter who closed the browser mid-delay completes their vote
 * by merely opening AgoraX again, on any page. Best-effort: failures stay
 * pending and retry on the next app start or proposal-page visit.
 */
export async function castMaturedPendingBallots(): Promise<number> {
  let cast = 0;
  const raw = localStorage.getItem('agorax_pending_ballots_v1');
  if (!raw) return 0;
  let list: PendingBallot[] = [];
  try { list = JSON.parse(raw); } catch { return 0; }
  for (const pending of list) {
    if (pending.minCastTime > Date.now()) continue;
    try {
      await castPendingBallot(pending);
      cast++;
    } catch (e) {
      const message = e instanceof Error ? e.message : '';
      // Counted elsewhere (double-spend) or the vote closed — drop it so it
      // doesn't retry forever; anything else stays pending for retry.
      if (/already|duplicate|closed|410/i.test(message)) {
        clearPendingBallot(pending.proposalId);
      }
    }
  }
  return cast;
}

export async function verifyReceipt(
  proposalId: number,
  token: string,
): Promise<{ found: false } | { found: true; choice: AnonymousChoice; castAt: string; rowHash: string }> {
  const resp = await api.get<
    { found: false } | { found: true; choice: AnonymousChoice; castAt: string; rowHash: string }
  >(`/api/proposals/${proposalId}/verify-receipt?token=${encodeURIComponent(token)}`);
  return resp.data;
}
