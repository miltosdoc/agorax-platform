/**
 * Ballot-box audit run in the visitor's browser.
 *
 * Given only a proposal number it cross-checks three independent records:
 *   1. the live chain on this server (full recomputation + current head),
 *   2. the anchors we published to GitHub, fetched straight from GitHub,
 *   3. the Bitcoin timestamps of those anchors, checked against a public
 *      block explorer.
 * The comparisons happen here, not on the server, so a server that lied
 * about its own chain would be caught by the records it cannot edit.
 */
import { checkBitcoinAttestation, parseOts, sha256Hex, type BitcoinCheck } from './ots-lite';

const GENESIS = '0'.repeat(64);

export interface PublishedAnchor {
  line: number;
  v: number;
  proposalId: number;
  phase: 'open' | 'final';
  headHash: string;
  total: number;
  verifyOk: boolean;
  capturedAt: string;
  prevAnchorHash: string;
  anchorHash: string;
  hashOk: boolean;
  linkOk: boolean;
  included: boolean | null;
}

export interface BitcoinResult {
  anchorHash: string;
  capturedAt: string;
  status: 'confirmed' | 'mismatch' | 'pending' | 'error';
  height: number | null;
  blockTime: number | null;
  blockHash: string | null;
  proofUrl: string;
  detail?: string;
}

export interface AuditReport {
  proposalId: number;
  server: {
    reachable: boolean;
    chainOk: boolean | null;
    headHash: string | null;
    total: number | null;
    firstBreakAt?: unknown;
    error?: string;
  };
  github: {
    url: string | null;
    fetched: boolean;
    anchors: PublishedAnchor[];
    sequenceOk: boolean;
    totalsMonotonic: boolean;
    inclusionChecked: number;
    inclusionMissing: number;
    finalMatches: boolean | null;
    error?: string;
  };
  bitcoin: BitcoinResult[];
  verdict: 'ok' | 'problem' | 'incomplete';
}

export interface AuditOptions {
  apiBase?: string;
  fetchImpl?: typeof fetch;
  explorerBase?: string;
  /** How many anchors to check against Bitcoin (latest ones + the final). */
  bitcoinLimit?: number;
  onProgress?: (step: 'server' | 'github' | 'inclusion' | 'bitcoin') => void;
}

function canonical(a: Omit<PublishedAnchor, 'line' | 'anchorHash' | 'hashOk' | 'linkOk' | 'included'>): string {
  return JSON.stringify({
    v: a.v, proposalId: a.proposalId, phase: a.phase, headHash: a.headHash, total: a.total,
    verifyOk: a.verifyOk, capturedAt: a.capturedAt, prevAnchorHash: a.prevAnchorHash,
  });
}

function parseRemote(remote: string | null): { repo: string; branch: string } | null {
  const m = remote?.match(/^github:([^@]+)@(.+)$/);
  return m ? { repo: m[1], branch: m[2] } : null;
}

export async function auditBallotBox(proposalId: number, opts: AuditOptions = {}): Promise<AuditReport> {
  const f = opts.fetchImpl ?? fetch;
  const api = (opts.apiBase ?? '').replace(/\/$/, '');
  const report: AuditReport = {
    proposalId,
    server: { reachable: false, chainOk: null, headHash: null, total: null },
    github: { url: null, fetched: false, anchors: [], sequenceOk: true, totalsMonotonic: true, inclusionChecked: 0, inclusionMissing: 0, finalMatches: null },
    bitcoin: [],
    verdict: 'incomplete',
  };

  // 1. Server: full chain recomputation.
  opts.onProgress?.('server');
  let remote: string | null = null;
  try {
    const [verifyResp, anchorsResp] = await Promise.all([
      f(`${api}/api/proposals/${proposalId}/election/verify`),
      f(`${api}/api/proposals/${proposalId}/election/anchors`),
    ]);
    if (verifyResp.ok) {
      const v = await verifyResp.json() as { ok: boolean; payload?: { headHash?: string; total?: number }; firstBreakAt?: unknown };
      report.server = {
        reachable: true,
        chainOk: Boolean(v.ok),
        headHash: v.payload?.headHash ?? null,
        total: typeof v.payload?.total === 'number' ? v.payload.total : null,
        firstBreakAt: v.firstBreakAt,
      };
    } else {
      report.server.error = `HTTP ${verifyResp.status}`;
    }
    if (anchorsResp.ok) {
      const a = await anchorsResp.json() as { remote?: string | null };
      remote = a.remote ?? null;
    }
  } catch (err) {
    report.server.error = err instanceof Error ? err.message : String(err);
  }

  // 2. GitHub: the published anchors, read from GitHub itself.
  opts.onProgress?.('github');
  const gh = parseRemote(remote);
  if (gh) {
    const raw = `https://raw.githubusercontent.com/${gh.repo}/${gh.branch}/anchors/proposal-${proposalId}.jsonl`;
    report.github.url = `https://github.com/${gh.repo}/blob/${gh.branch}/anchors/proposal-${proposalId}.jsonl`;
    try {
      const resp = await f(`${raw}?t=${Date.now()}`, { cache: 'no-store' });
      if (resp.status === 404) {
        report.github.fetched = true; // reachable, simply nothing published yet
      } else if (!resp.ok) {
        report.github.error = `GitHub HTTP ${resp.status}`;
      } else {
        report.github.fetched = true;
        const text = await resp.text();
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        let prev = GENESIS;
        let prevTotal = -1;
        for (let i = 0; i < lines.length; i++) {
          const o = JSON.parse(lines[i]);
          const entry: PublishedAnchor = {
            line: i + 1, v: o.v, proposalId: o.proposalId, phase: o.phase, headHash: o.headHash, total: o.total,
            verifyOk: o.verifyOk, capturedAt: o.capturedAt, prevAnchorHash: o.prevAnchorHash, anchorHash: o.anchorHash,
            hashOk: false, linkOk: false, included: null,
          };
          entry.hashOk = (await sha256Hex(canonical(entry))) === entry.anchorHash;
          entry.linkOk = entry.prevAnchorHash === prev && entry.proposalId === proposalId;
          if (!entry.hashOk || !entry.linkOk) report.github.sequenceOk = false;
          if (entry.total < prevTotal) report.github.totalsMonotonic = false;
          prev = entry.anchorHash;
          prevTotal = entry.total;
          report.github.anchors.push(entry);
        }
      }
    } catch (err) {
      report.github.error = err instanceof Error ? err.message : String(err);
    }
  }

  // 3. Every published head must still be in the live chain.
  opts.onProgress?.('inclusion');
  if (report.server.reachable) {
    const toCheck = report.github.anchors.filter(a => a.headHash !== GENESIS).slice(-50);
    await Promise.all(toCheck.map(async (a) => {
      try {
        const resp = await f(`${api}/api/proposals/${proposalId}/receipt-inclusion?rowHash=${a.headHash}`);
        const data = resp.ok ? await resp.json() as { found?: boolean } : null;
        a.included = data ? Boolean(data.found) : null;
      } catch {
        a.included = null;
      }
      report.github.inclusionChecked++;
      if (a.included === false) report.github.inclusionMissing++;
    }));
    const last = report.github.anchors[report.github.anchors.length - 1];
    if (last && last.phase === 'final' && report.server.headHash) {
      report.github.finalMatches = last.headHash === report.server.headHash && last.total === report.server.total;
    }
  }

  // 4. Bitcoin: the latest anchors (and the final one) against the blockchain.
  opts.onProgress?.('bitcoin');
  if (gh && report.github.anchors.length > 0) {
    const limit = opts.bitcoinLimit ?? 3;
    const picked = new Map<string, PublishedAnchor>();
    const finalAnchor = [...report.github.anchors].reverse().find(a => a.phase === 'final');
    if (finalAnchor) picked.set(finalAnchor.anchorHash, finalAnchor);
    for (const a of [...report.github.anchors].reverse()) {
      if (picked.size >= limit) break;
      picked.set(a.anchorHash, a);
    }
    for (const a of picked.values()) {
      const proofRaw = `https://raw.githubusercontent.com/${gh.repo}/${gh.branch}/anchors/ots/${a.anchorHash}.ots`;
      const proofUrl = `https://github.com/${gh.repo}/blob/${gh.branch}/anchors/ots/${a.anchorHash}.ots`;
      const result: BitcoinResult = { anchorHash: a.anchorHash, capturedAt: a.capturedAt, status: 'pending', height: null, blockTime: null, blockHash: null, proofUrl };
      try {
        const resp = await f(`${proofRaw}?t=${Date.now()}`, { cache: 'no-store' });
        if (resp.status === 404) {
          report.bitcoin.push(result);
          continue;
        }
        if (!resp.ok) throw new Error(`GitHub HTTP ${resp.status}`);
        const proof = await parseOts(new Uint8Array(await resp.arrayBuffer()));
        const digestHex = Array.from(proof.digest).map(b => b.toString(16).padStart(2, '0')).join('');
        if (digestHex !== a.anchorHash) throw new Error('proof is for a different hash');
        const btc = proof.attestations.find((x): x is Extract<typeof x, { kind: 'bitcoin' }> => x.kind === 'bitcoin');
        if (!btc) {
          report.bitcoin.push(result);
          continue;
        }
        const check: BitcoinCheck = await checkBitcoinAttestation(btc, { apiBase: opts.explorerBase, fetchImpl: f });
        result.height = check.height;
        result.blockTime = check.blockTime;
        result.blockHash = check.blockHash;
        if (check.error) { result.status = 'error'; result.detail = check.error; }
        else result.status = check.ok ? 'confirmed' : 'mismatch';
      } catch (err) {
        result.status = 'error';
        result.detail = err instanceof Error ? err.message : String(err);
      }
      report.bitcoin.push(result);
    }
  }

  // Verdict.
  const problems =
    report.server.chainOk === false ||
    !report.github.sequenceOk ||
    !report.github.totalsMonotonic ||
    report.github.inclusionMissing > 0 ||
    report.github.finalMatches === false ||
    report.bitcoin.some(b => b.status === 'mismatch');
  const incomplete =
    !report.server.reachable ||
    !gh ||
    !report.github.fetched ||
    report.bitcoin.some(b => b.status === 'error');
  report.verdict = problems ? 'problem' : incomplete ? 'incomplete' : 'ok';
  return report;
}
