/**
 * Device transfer for ALL anonymous, device-bound data:
 *
 *   - panel identity token   (agorax_panel_token_v1   — panel-client.ts)
 *   - anonymous vote receipts (agorax_anon_receipts_v1 — anonymous-vote.ts)
 *   - pending (maturing) ballots (agorax_pending_ballots_v1 — anonymous-vote.ts)
 *
 * These live only in localStorage by design: the server cannot know which
 * panel identity / ballot belongs to which user, so it cannot sync them.
 * Export bundles everything into one base64 code; import validates and
 * merges it on the other device.
 */

const PANEL_KEY = 'agorax_panel_token_v1';
const RECEIPTS_KEY = 'agorax_anon_receipts_v1';
const PENDING_KEY = 'agorax_pending_ballots_v1';

interface AnonBundle {
  v: 1;
  panel?: string;
  receipts?: unknown[];
  pending?: unknown[];
}

function readJsonArray(key: string): unknown[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export interface AnonInventory {
  hasPanel: boolean;
  receipts: number;
  pending: number;
}

/** What anonymous data exists on this device right now. */
export function anonInventory(): AnonInventory {
  let hasPanel = false;
  try { hasPanel = !!localStorage.getItem(PANEL_KEY); } catch { /* noop */ }
  return {
    hasPanel,
    receipts: readJsonArray(RECEIPTS_KEY).length,
    pending: readJsonArray(PENDING_KEY).length,
  };
}

/** Bundle everything into a single transfer code (base64 of JSON). */
export function exportAnonData(): string | null {
  const bundle: AnonBundle = { v: 1 };
  try {
    const panel = localStorage.getItem(PANEL_KEY);
    if (panel) bundle.panel = panel;
  } catch { /* noop */ }
  const receipts = readJsonArray(RECEIPTS_KEY);
  if (receipts.length) bundle.receipts = receipts;
  const pending = readJsonArray(PENDING_KEY);
  if (pending.length) bundle.pending = pending;
  if (!bundle.panel && !bundle.receipts && !bundle.pending) return null;
  // btoa needs latin1 — go through UTF-8 bytes for the Greek content.
  const json = JSON.stringify(bundle);
  return btoa(String.fromCharCode(...new TextEncoder().encode(json)));
}

export interface ImportResult {
  ok: boolean;
  panelImported: boolean;
  receiptsAdded: number;
  pendingAdded: number;
  error?: 'invalid_code' | 'panel_invalid';
}

/**
 * Merge a transfer code into this device. Receipts/ballots union by
 * proposalId with local entries winning (each proposal can only ever have
 * one, cast from one device). A panel token is validated against the
 * server before it replaces the local one.
 */
export async function importAnonData(code: string): Promise<ImportResult> {
  const fail = (error: ImportResult['error']): ImportResult =>
    ({ ok: false, panelImported: false, receiptsAdded: 0, pendingAdded: 0, error });

  let bundle: AnonBundle;
  try {
    const bytes = Uint8Array.from(atob(code.trim()), (c) => c.charCodeAt(0));
    bundle = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return fail('invalid_code');
  }
  if (!bundle || bundle.v !== 1) return fail('invalid_code');

  let panelImported = false;
  if (typeof bundle.panel === 'string' && bundle.panel.length <= 200) {
    const res = await fetch('/api/panel/me', {
      credentials: 'omit',
      headers: { 'X-Panel-Token': bundle.panel, 'ngrok-skip-browser-warning': '1' },
    }).catch(() => null);
    if (!res?.ok) return fail('panel_invalid');
    try { localStorage.setItem(PANEL_KEY, bundle.panel); panelImported = true; } catch { /* noop */ }
  }

  const mergeByProposal = (key: string, incoming: unknown[]): number => {
    const local = readJsonArray(key) as Array<{ proposalId?: number }>;
    const have = new Set(local.map((r) => r?.proposalId));
    let added = 0;
    for (const item of incoming as Array<{ proposalId?: number }>) {
      if (typeof item?.proposalId !== 'number' || have.has(item.proposalId)) continue;
      local.push(item);
      have.add(item.proposalId);
      added++;
    }
    if (added) {
      try { localStorage.setItem(key, JSON.stringify(local)); } catch { return 0; }
    }
    return added;
  };

  const receiptsAdded = Array.isArray(bundle.receipts) ? mergeByProposal(RECEIPTS_KEY, bundle.receipts) : 0;
  const pendingAdded = Array.isArray(bundle.pending) ? mergeByProposal(PENDING_KEY, bundle.pending) : 0;

  return { ok: true, panelImported, receiptsAdded, pendingAdded };
}
