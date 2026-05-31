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

export type AnonymousChoice = 'yes' | 'no' | 'abstain';

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

/**
 * Run the full anonymous-vote dance and return the receipt. Throws on
 * any step that fails — callers should surface the error to the voter.
 */
export async function castAnonymousVote(
  proposalId: number,
  choice: AnonymousChoice,
): Promise<AnonymousReceipt> {
  // 1. Fetch the public key.
  const keyResp = await api.get<PublicKey>(`/api/proposals/${proposalId}/blind-key`);
  const publicKey = keyResp.data;

  // 2. Generate token + blinding factor + blinded value.
  // GDPR: Enforce a 30-minute delay between token issuance and vote casting.
  // This breaks timing correlation between the authenticated /blind-sign
  // request (server knows user_id) and the unauthenticated /anonymous-vote
  // request (server only sees the token). Without this delay, an operator
  // could correlate the two requests by timestamp and defeat unlinkability.
  // See docs/compliance/AUDIT_IDENTITY_VOTE_ANONYMITY.md §G2
  const MIN_CAST_DELAY_MS = 30 * 60 * 1000; // 30 minutes
  const minCastTime = Date.now() + MIN_CAST_DELAY_MS;
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

  // 5. Cast the vote (NO auth on this route — server-side CSRF + auth
  // are deliberately absent so the request cannot be correlated with
  // the voter's session).
  //
  // GDPR: credentials: 'omit' prevents the browser from sending session
  // cookies with the anonymous-vote request. Without this, the server
  // could correlate the vote to the voter's session via cookie-based
  // session ID, defeating the blind-signature unlinkability guarantee.
  // See docs/compliance/AUDIT_IDENTITY_VOTE_ANONYMITY.md §G5
  const tokenB64 = bytesToBase64(req.token);
  const preparedMsgB64 = bytesToBase64(req.preparedMsg);
  const voteResp = await fetch(`/api/proposals/${proposalId}/anonymous-vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: tokenB64, preparedMsg: preparedMsgB64, signature: sig, choice }),
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
    // If the token isn't yet valid, tell the user how long to wait.
    if (minCastTime && Date.now() < minCastTime) {
      const waitSec = Math.ceil((minCastTime - Date.now()) / 1000);
      throw new Error(`${message} (wait ${waitSec}s)`);
    }
    throw new Error(message);
  }
  const result = (await voteResp.json()) as { rowHash: string; castAt: string };

  // 6. Persist the receipt locally — the only record of HOW the voter voted.
  const receipt: AnonymousReceipt = {
    proposalId,
    token: tokenB64,
    preparedMsg: preparedMsgB64,
    signature: sig,
    publicKey: bsResp.data.publicKey,
    choice,
    rowHash: result.rowHash,
    castAt: result.castAt,
    storedAt: new Date().toISOString(),
  };
  saveReceipt(receipt);
  return receipt;
}

/**
 * Ask the server whether a given token has been counted, and what choice
 * it carries. The deniable property: anyone holding the token can do this
 * lookup, so the result cannot be used to coerce the voter.
 */
export async function verifyReceipt(
  proposalId: number,
  token: string,
): Promise<{ found: false } | { found: true; choice: AnonymousChoice; castAt: string; rowHash: string }> {
  const resp = await api.get<
    { found: false } | { found: true; choice: AnonymousChoice; castAt: string; rowHash: string }
  >(`/api/proposals/${proposalId}/verify-receipt?token=${encodeURIComponent(token)}`);
  return resp.data;
}
