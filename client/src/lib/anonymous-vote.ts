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
  token: string;       // base64 of the 32-byte random
  signature: string;   // base64 RSA-FDH signature
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
  const req = await blind(publicKey);

  // 3. Get the server's blind signature.
  const bsResp = await api.post<{ signature: string; publicKey: PublicKey }>(
    `/api/proposals/${proposalId}/blind-sign`,
    { blindedToken: req.blinded },
  );

  // 4. Unblind to recover a valid signature on `token`.
  const sig = unblind(bsResp.data.signature, req.blindingFactor, bsResp.data.publicKey);

  // 5. Cast the vote (NO auth on this route — server-side CSRF + auth
  // are deliberately absent so the request cannot be correlated with
  // the voter's session).
  const tokenB64 = bytesToBase64(req.token);
  const voteResp = await fetch(`/api/proposals/${proposalId}/anonymous-vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: tokenB64, signature: sig, choice }),
  });
  if (!voteResp.ok) {
    let message = `vote failed (${voteResp.status})`;
    try {
      const j = await voteResp.json();
      if (typeof j?.message === 'string') message = j.message;
    } catch { /* keep default */ }
    throw new Error(message);
  }
  const result = (await voteResp.json()) as { rowHash: string; castAt: string };

  // 6. Persist the receipt locally — the only record of HOW the voter voted.
  const receipt: AnonymousReceipt = {
    proposalId,
    token: tokenB64,
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
