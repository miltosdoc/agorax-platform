/**
 * External anchoring of the vote hash chain.
 *
 * The per-proposal chain (vote-chain.ts) is tamper-evident only to someone
 * who already holds an earlier head hash: without that, the operator can
 * rewrite the whole chain and recompute every row hash. This module
 * publishes each proposal's head hash to a repository outside the server,
 * where every write is a commit with GitHub's own timestamp, so a rewrite
 * after publication is detectable by anyone.
 *
 * What leaves the server: proposal id, head hash, row count, verify result,
 * capture time. No ballots, no choices, no voters. See
 * docs/VOTE_CHAIN_ANCHORING.md for the third-party verification procedure.
 */
import { createHash } from 'node:crypto';
import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '../db';
import { proposals, voteChainAnchors, type VoteChainAnchor } from '@shared/schema';
import { GENESIS_PREV_HASH, getChainHead, verifyChain } from './vote-chain';
import { realOtsClient, type OtsClient } from './ots';

// ─── Configuration ──────────────────────────────────────────────────────────

export interface AnchorConfig {
  /** "owner/repo" */
  repo: string;
  branch: string;
  token: string;
  apiBase: string;
}

export function readAnchorConfig(env: NodeJS.ProcessEnv = process.env): AnchorConfig | null {
  const repo = env.ANCHOR_GITHUB_REPO?.trim();
  const token = env.ANCHOR_GITHUB_TOKEN?.trim();
  if (!repo || !token) return null;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    console.warn(`[chain-anchor] ANCHOR_GITHUB_REPO must be "owner/repo", got "${repo}" — anchoring disabled`);
    return null;
  }
  return {
    repo,
    token,
    branch: env.ANCHOR_GITHUB_BRANCH?.trim() || 'anchors',
    apiBase: (env.ANCHOR_GITHUB_API?.trim() || 'https://api.github.com').replace(/\/$/, ''),
  };
}

export function isAnchoringConfigured(): boolean {
  return readAnchorConfig() !== null;
}

/** Bitcoin timestamping rides on anchoring; ANCHOR_OTS=off switches it off alone. */
export function isOtsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return readAnchorConfig(env) !== null && !/^(off|0|false|no)$/i.test(env.ANCHOR_OTS?.trim() ?? '');
}

// ─── Record format ──────────────────────────────────────────────────────────

export type AnchorPhase = 'open' | 'final';

export interface AnchorRecord {
  v: 1;
  proposalId: number;
  phase: AnchorPhase;
  headHash: string;
  total: number;
  verifyOk: boolean;
  capturedAt: string;
  prevAnchorHash: string;
}

/**
 * Canonical serialization: fixed key order, no whitespace. This is what gets
 * hashed and what gets published, so any change here is a format change and
 * must bump `v`.
 */
export function canonicalizeAnchor(r: AnchorRecord): string {
  return JSON.stringify({
    v: r.v,
    proposalId: r.proposalId,
    phase: r.phase,
    headHash: r.headHash,
    total: r.total,
    verifyOk: r.verifyOk,
    capturedAt: r.capturedAt,
    prevAnchorHash: r.prevAnchorHash,
  });
}

export function hashAnchor(canonical: string): string {
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/** The published line: the canonical record plus its own hash. */
export function renderAnchorLine(r: AnchorRecord): { line: string; anchorHash: string } {
  const canonical = canonicalizeAnchor(r);
  const anchorHash = hashAnchor(canonical);
  // Append anchorHash as the last key so the canonical prefix is unchanged.
  const line = canonical.slice(0, -1) + `,"anchorHash":"${anchorHash}"}`;
  return { line, anchorHash };
}

export function anchorFilePath(proposalId: number): string {
  return `anchors/proposal-${proposalId}.jsonl`;
}

/** Where a completed OpenTimestamps proof for an anchor is published. */
export function otsProofPath(anchorHash: string): string {
  return `anchors/ots/${anchorHash}.ots`;
}

// ─── Publisher ──────────────────────────────────────────────────────────────

export interface PublishResult {
  remote: string;
  commit: string | null;
  url: string | null;
}

export interface AnchorPublisher {
  readonly remote: string;
  /** Append `line` to the proposal's anchor file. Must be append-only. */
  publish(proposalId: number, line: string, message: string): Promise<PublishResult>;
  /** Create or replace a file (used for .ots proofs, which are replaced once complete). */
  putFile(path: string, bytes: Buffer, message: string): Promise<PublishResult>;
}

type FetchLike = typeof fetch;

/**
 * Appends lines to `anchors/proposal-<id>.jsonl` on a dedicated branch via
 * the GitHub Contents API. The branch is created as an orphan on first use so
 * anchor commits never interleave with source history.
 */
export class GitHubAnchorPublisher implements AnchorPublisher {
  readonly remote: string;
  private branchReady = false;

  constructor(private readonly cfg: AnchorConfig, private readonly fetchImpl: FetchLike = fetch) {
    this.remote = `github:${cfg.repo}@${cfg.branch}`;
  }

  private async api(method: string, path: string, body?: unknown): Promise<Response> {
    const res = await this.fetchImpl(`${this.cfg.apiBase}/repos/${this.cfg.repo}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.cfg.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'agorax-chain-anchor',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return res;
  }

  private async fail(res: Response, what: string): Promise<never> {
    const text = await res.text().catch(() => '');
    throw new Error(`[chain-anchor] ${what}: HTTP ${res.status} ${text.slice(0, 300)}`);
  }

  /** Create the anchor branch as an orphan commit if it does not exist yet. */
  async ensureBranch(): Promise<void> {
    if (this.branchReady) return;
    const probe = await this.api('GET', `/branches/${encodeURIComponent(this.cfg.branch)}`);
    if (probe.ok) { this.branchReady = true; return; }
    if (probe.status !== 404) await this.fail(probe, 'branch probe failed');

    const readme =
      '# AgoraX vote-chain anchors\n\n' +
      'One file per proposal under `anchors/`, one JSON line per anchor, append-only.\n' +
      'Each line publishes the SHA-256 head of that proposal\'s vote chain at a point in time.\n' +
      'No ballots, choices or voters are recorded here. Verification procedure:\n' +
      'docs/VOTE_CHAIN_ANCHORING.md in the main branch.\n';
    const blob = await this.api('POST', '/git/blobs', { content: readme, encoding: 'utf-8' });
    if (!blob.ok) await this.fail(blob, 'blob create failed');
    const blobSha = (await blob.json() as { sha: string }).sha;

    const tree = await this.api('POST', '/git/trees', {
      tree: [{ path: 'README.md', mode: '100644', type: 'blob', sha: blobSha }],
    });
    if (!tree.ok) await this.fail(tree, 'tree create failed');
    const treeSha = (await tree.json() as { sha: string }).sha;

    const commit = await this.api('POST', '/git/commits', {
      message: 'Initialise vote-chain anchor branch',
      tree: treeSha,
      parents: [],
    });
    if (!commit.ok) await this.fail(commit, 'orphan commit failed');
    const commitSha = (await commit.json() as { sha: string }).sha;

    const ref = await this.api('POST', '/git/refs', { ref: `refs/heads/${this.cfg.branch}`, sha: commitSha });
    // 422 = someone else created it between our probe and now; that's fine.
    if (!ref.ok && ref.status !== 422) await this.fail(ref, 'branch create failed');
    this.branchReady = true;
  }

  /**
   * Create or update `path` on the anchor branch. `mutate` receives the
   * current bytes (empty when the file does not exist) and returns the next
   * contents. One retry covers a concurrent write (sha conflict → 409).
   */
  private async writeFile(path: string, message: string, mutate: (current: Buffer) => Buffer): Promise<PublishResult> {
    await this.ensureBranch();
    for (let attempt = 0; attempt < 2; attempt++) {
      const current = await this.api('GET', `/contents/${path}?ref=${encodeURIComponent(this.cfg.branch)}`);
      let existing = Buffer.alloc(0);
      let sha: string | undefined;
      if (current.ok) {
        const body = await current.json() as { content?: string; sha?: string };
        sha = body.sha;
        existing = Buffer.from((body.content ?? '').replace(/\n/g, ''), 'base64');
      } else if (current.status !== 404) {
        await this.fail(current, 'read file failed');
      }
      const put = await this.api('PUT', `/contents/${path}`, {
        message,
        content: mutate(existing).toString('base64'),
        branch: this.cfg.branch,
        ...(sha ? { sha } : {}),
      });
      if (put.ok) {
        const body = await put.json() as { commit?: { sha?: string; html_url?: string }; content?: { html_url?: string } };
        return {
          remote: this.remote,
          commit: body.commit?.sha ?? null,
          url: body.content?.html_url ?? body.commit?.html_url ?? null,
        };
      }
      if (put.status === 409 && attempt === 0) continue;
      await this.fail(put, `write ${path} failed`);
    }
    throw new Error('[chain-anchor] unreachable');
  }

  async publish(proposalId: number, line: string, message: string): Promise<PublishResult> {
    const result = await this.writeFile(anchorFilePath(proposalId), message, (current) => {
      let existing = current.toString('utf8');
      if (existing.length > 0 && !existing.endsWith('\n')) existing += '\n';
      return Buffer.from(existing + line + '\n', 'utf8');
    });
    // For the anchor line the commit is the interesting link, not the file.
    return { ...result, url: result.commit ? `https://github.com/${this.cfg.repo}/commit/${result.commit}` : result.url };
  }

  async putFile(path: string, bytes: Buffer, message: string): Promise<PublishResult> {
    return this.writeFile(path, message, () => bytes);
  }
}

let defaultPublisher: AnchorPublisher | null = null;
function getPublisher(): AnchorPublisher | null {
  if (defaultPublisher) return defaultPublisher;
  const cfg = readAnchorConfig();
  if (!cfg) return null;
  defaultPublisher = new GitHubAnchorPublisher(cfg);
  return defaultPublisher;
}

// ─── Anchoring ──────────────────────────────────────────────────────────────

function phaseFor(status: string): AnchorPhase | null {
  if (status === 'voting') return 'open';
  if (status === 'decided') return 'final';
  return null;
}

export async function latestAnchor(proposalId: number): Promise<VoteChainAnchor | undefined> {
  const [row] = await db
    .select()
    .from(voteChainAnchors)
    .where(eq(voteChainAnchors.proposalId, proposalId))
    .orderBy(desc(voteChainAnchors.id))
    .limit(1);
  return row;
}

export async function listAnchors(proposalId: number): Promise<VoteChainAnchor[]> {
  return db
    .select()
    .from(voteChainAnchors)
    .where(eq(voteChainAnchors.proposalId, proposalId))
    .orderBy(voteChainAnchors.id);
}

export interface AnchorOptions {
  publisher?: AnchorPublisher;
  ots?: OtsClient | null;
  now?: () => Date;
  /** Anchor even if the head has not moved since the last anchor. */
  force?: boolean;
}

function otsClientFor(opts: AnchorOptions): OtsClient | null {
  if (opts.ots !== undefined) return opts.ots;
  return isOtsEnabled() ? realOtsClient : null;
}

/**
 * Anchor one proposal if its chain moved (or it closed) since the last
 * anchor. Returns the new row, or null when nothing needed publishing.
 */
export async function anchorProposal(proposalId: number, opts: AnchorOptions = {}): Promise<VoteChainAnchor | null> {
  const publisher = opts.publisher ?? getPublisher();
  if (!publisher) return null;

  const [proposal] = await db
    .select({ status: proposals.status })
    .from(proposals)
    .where(eq(proposals.id, proposalId));
  if (!proposal) return null;
  const phase = phaseFor(proposal.status);
  if (!phase) return null;

  const head = await getChainHead(proposalId);
  const prev = await latestAnchor(proposalId);
  if (prev && !opts.force && prev.headHash === head.headHash && prev.phase === phase) return null;

  const verification = await verifyChain(proposalId);
  const capturedAt = (opts.now ?? (() => new Date()))();
  const record: AnchorRecord = {
    v: 1,
    proposalId,
    phase,
    headHash: head.headHash,
    total: head.total,
    verifyOk: verification.ok,
    capturedAt: capturedAt.toISOString(),
    prevAnchorHash: prev?.anchorHash ?? GENESIS_PREV_HASH,
  };
  const { line, anchorHash } = renderAnchorLine(record);

  const published = await publisher.publish(
    proposalId,
    line,
    `Anchor proposal ${proposalId} (${phase}): ${head.total} rows, head ${head.headHash.slice(0, 12)}`,
  );

  const [row] = await db
    .insert(voteChainAnchors)
    .values({
      proposalId,
      phase,
      headHash: head.headHash,
      total: head.total,
      verifyOk: verification.ok,
      capturedAt,
      prevAnchorHash: record.prevAnchorHash,
      anchorHash,
      record: line,
      remote: published.remote,
      remoteCommit: published.commit,
      remoteUrl: published.url,
    })
    .onConflictDoNothing()
    .returning();
  if (!verification.ok) {
    console.error(`[chain-anchor] proposal ${proposalId}: chain FAILED verification at anchor time`, verification.firstBreakAt);
  }
  // Bitcoin timestamp, best effort: a calendar outage must not undo the
  // anchor. The OTS sweep retries anything left unstamped.
  const ots = otsClientFor(opts);
  if (row && ots) {
    const stamped = await stampAnchor(row, ots, opts.now);
    if (stamped) return stamped;
  }
  return row ?? null;
}

// ─── OpenTimestamps ─────────────────────────────────────────────────────────

/** Submit an anchor's hash to the calendars and store the pending proof. */
export async function stampAnchor(row: VoteChainAnchor, ots: OtsClient, now: () => Date = () => new Date()): Promise<VoteChainAnchor | null> {
  try {
    const proof = await ots.stamp(row.anchorHash);
    const [updated] = await db
      .update(voteChainAnchors)
      .set({
        otsProof: proof,
        otsStatus: 'pending',
        otsStampedAt: now(),
        otsAttempts: sql`${voteChainAnchors.otsAttempts} + 1`,
        otsLastError: null,
      })
      .where(eq(voteChainAnchors.id, row.id))
      .returning();
    return updated ?? null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[chain-anchor] ots stamp failed for anchor ${row.id}: ${message}`);
    await db
      .update(voteChainAnchors)
      .set({ otsStatus: 'failed', otsAttempts: sql`${voteChainAnchors.otsAttempts} + 1`, otsLastError: message.slice(0, 500) })
      .where(eq(voteChainAnchors.id, row.id));
    return null;
  }
}

/**
 * Ask the calendars whether a pending proof has reached Bitcoin. When it
 * has, publish the completed .ots next to the anchors and record the block.
 */
export async function upgradeAnchor(
  row: VoteChainAnchor,
  ots: OtsClient,
  publisher: AnchorPublisher,
  now: () => Date = () => new Date(),
): Promise<'complete' | 'pending' | 'failed'> {
  if (!row.otsProof) return 'failed';
  try {
    const { proof, changed } = await ots.upgrade(row.otsProof);
    const info = await ots.inspect(proof);
    if (info.complete) {
      const published = await publisher.putFile(
        otsProofPath(row.anchorHash),
        proof,
        `OpenTimestamps proof for anchor ${row.anchorHash.slice(0, 12)} (proposal ${row.proposalId}, block ${info.height ?? '?'})`,
      );
      await db
        .update(voteChainAnchors)
        .set({
          otsProof: proof,
          otsStatus: 'complete',
          otsUpgradedAt: now(),
          otsBitcoinHeight: info.height,
          otsRemoteUrl: published.url,
          otsAttempts: sql`${voteChainAnchors.otsAttempts} + 1`,
          otsLastError: null,
        })
        .where(eq(voteChainAnchors.id, row.id));
      return 'complete';
    }
    await db
      .update(voteChainAnchors)
      .set({
        ...(changed ? { otsProof: proof } : {}),
        otsAttempts: sql`${voteChainAnchors.otsAttempts} + 1`,
      })
      .where(eq(voteChainAnchors.id, row.id));
    return 'pending';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[chain-anchor] ots upgrade failed for anchor ${row.id}: ${message}`);
    await db
      .update(voteChainAnchors)
      .set({ otsAttempts: sql`${voteChainAnchors.otsAttempts} + 1`, otsLastError: message.slice(0, 500) })
      .where(eq(voteChainAnchors.id, row.id));
    return 'failed';
  }
}

export interface OtsSweepResult { stamped: number; completed: number; pending: number; failed: number }

/**
 * Stamp anchors that have no proof yet and try to complete pending ones.
 * Upgrades are spaced out: the first try 30 minutes after stamping, then
 * 20 minutes later per attempt, since Bitcoin confirmation takes an hour or
 * more and every try is four calendar round-trips.
 */
export async function runOtsSweep(opts: AnchorOptions & { stampLimit?: number; upgradeLimit?: number } = {}): Promise<OtsSweepResult> {
  const result: OtsSweepResult = { stamped: 0, completed: 0, pending: 0, failed: 0 };
  const ots = otsClientFor(opts);
  const publisher = opts.publisher ?? getPublisher();
  if (!ots || !publisher) return result;
  const now = opts.now ?? (() => new Date());

  const toStamp = await db
    .select()
    .from(voteChainAnchors)
    .where(or(
      isNull(voteChainAnchors.otsStatus),
      and(eq(voteChainAnchors.otsStatus, 'failed'), lt(voteChainAnchors.otsAttempts, 10)),
    ))
    .orderBy(voteChainAnchors.id)
    .limit(opts.stampLimit ?? 20);
  for (const row of toStamp) {
    if (await stampAnchor(row, ots, now)) result.stamped++; else result.failed++;
  }

  const nowMs = now().getTime();
  const toUpgrade = await db
    .select()
    .from(voteChainAnchors)
    .where(and(
      eq(voteChainAnchors.otsStatus, 'pending'),
      // stamped_at + 30min + 20min * (attempts - 1) <= now
      sql`${voteChainAnchors.otsStampedAt} + make_interval(mins => 30 + 20 * greatest(${voteChainAnchors.otsAttempts} - 1, 0)) <= ${new Date(nowMs)}`,
    ))
    .orderBy(voteChainAnchors.id)
    .limit(opts.upgradeLimit ?? 20);
  for (const row of toUpgrade) {
    const outcome = await upgradeAnchor(row, ots, publisher, now);
    result[outcome === 'complete' ? 'completed' : outcome]++;
  }
  return result;
}

/**
 * Proposals whose chain moved since their last anchor: open votes whose head
 * changed, and decided proposals without a final anchor yet.
 */
export async function selectProposalsNeedingAnchor(limit = 10): Promise<number[]> {
  const rows = await db.execute<{ id: number }>(sql`
    WITH heads AS (
      SELECT p.id,
             p.status,
             COALESCE((SELECT v.row_hash FROM proposal_votes v
                        WHERE v.proposal_id = p.id
                        ORDER BY v.id DESC LIMIT 1), ${GENESIS_PREV_HASH}) AS head_hash
        FROM proposals p
       WHERE p.status IN ('voting', 'decided')
    ),
    last_anchor AS (
      SELECT DISTINCT ON (a.proposal_id) a.proposal_id, a.head_hash, a.phase
        FROM vote_chain_anchors a
       ORDER BY a.proposal_id, a.id DESC
    )
    SELECT h.id
      FROM heads h
      LEFT JOIN last_anchor a ON a.proposal_id = h.id
     WHERE a.proposal_id IS NULL
        OR a.head_hash <> h.head_hash
        OR (h.status = 'decided' AND a.phase <> 'final')
     ORDER BY (h.status = 'voting') DESC, h.id
     LIMIT ${limit}
  `);
  return rows.rows.map((r) => Number(r.id));
}

export interface SweepResult { anchored: number; skipped: number; failed: number }

export async function runAnchorSweep(opts: AnchorOptions & { limit?: number } = {}): Promise<SweepResult> {
  const publisher = opts.publisher ?? getPublisher();
  const result: SweepResult = { anchored: 0, skipped: 0, failed: 0 };
  if (!publisher) return result;
  const ids = await selectProposalsNeedingAnchor(opts.limit ?? 10);
  for (const id of ids) {
    try {
      const row = await anchorProposal(id, { ...opts, publisher });
      if (row) result.anchored++; else result.skipped++;
    } catch (err) {
      result.failed++;
      console.error(`[chain-anchor] proposal ${id} failed:`, err instanceof Error ? err.message : err);
    }
  }
  return result;
}
