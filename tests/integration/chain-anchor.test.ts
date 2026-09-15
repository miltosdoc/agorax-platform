/**
 * Vote-chain anchoring — record format and GitHub publisher.
 *
 * The DB-facing sweep is exercised in production by the job worker; here we
 * pin down the parts a third-party verifier depends on (canonical form,
 * hash, append-only publishing) with a fake GitHub API.
 */
import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  GitHubAnchorPublisher,
  anchorFilePath,
  canonicalizeAnchor,
  hashAnchor,
  readAnchorConfig,
  renderAnchorLine,
  type AnchorRecord,
} from '../../server/utils/chain-anchor';

const record: AnchorRecord = {
  v: 1,
  proposalId: 97,
  phase: 'open',
  headHash: 'ab'.repeat(32),
  total: 3,
  verifyOk: true,
  capturedAt: '2026-09-15T20:00:00.000Z',
  prevAnchorHash: '0'.repeat(64),
};

describe('anchor record format', () => {
  it('canonical form has a fixed key order regardless of input order', () => {
    const shuffled = {
      prevAnchorHash: record.prevAnchorHash,
      capturedAt: record.capturedAt,
      verifyOk: record.verifyOk,
      total: record.total,
      headHash: record.headHash,
      phase: record.phase,
      proposalId: record.proposalId,
      v: record.v,
    } as AnchorRecord;
    expect(canonicalizeAnchor(shuffled)).toBe(canonicalizeAnchor(record));
    expect(canonicalizeAnchor(record)).toBe(
      '{"v":1,"proposalId":97,"phase":"open","headHash":"' + 'ab'.repeat(32) +
      '","total":3,"verifyOk":true,"capturedAt":"2026-09-15T20:00:00.000Z","prevAnchorHash":"' + '0'.repeat(64) + '"}',
    );
  });

  it('anchorHash is sha256 of the canonical form and the line re-verifies', () => {
    const { line, anchorHash } = renderAnchorLine(record);
    expect(anchorHash).toBe(createHash('sha256').update(canonicalizeAnchor(record)).digest('hex'));
    const parsed = JSON.parse(line);
    expect(parsed.anchorHash).toBe(anchorHash);
    const { anchorHash: _drop, ...rest } = parsed;
    expect(hashAnchor(canonicalizeAnchor(rest as AnchorRecord))).toBe(anchorHash);
  });

  it('any field change changes the hash', () => {
    const a = renderAnchorLine(record).anchorHash;
    const b = renderAnchorLine({ ...record, total: 4 }).anchorHash;
    const c = renderAnchorLine({ ...record, verifyOk: false }).anchorHash;
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('config requires repo and token and validates the repo shape', () => {
    expect(readAnchorConfig({})).toBeNull();
    expect(readAnchorConfig({ ANCHOR_GITHUB_REPO: 'o/r' })).toBeNull();
    expect(readAnchorConfig({ ANCHOR_GITHUB_REPO: 'not a repo', ANCHOR_GITHUB_TOKEN: 't' })).toBeNull();
    expect(readAnchorConfig({ ANCHOR_GITHUB_REPO: 'o/r', ANCHOR_GITHUB_TOKEN: 't' })).toEqual({
      repo: 'o/r', token: 't', branch: 'anchors', apiBase: 'https://api.github.com',
    });
  });
});

// ─── Fake GitHub ────────────────────────────────────────────────────────────

function fakeGitHub(opts: { branchExists: boolean; files?: Record<string, string>; conflictOnce?: boolean }) {
  const files: Record<string, string> = { ...(opts.files ?? {}) };
  let branchExists = opts.branchExists;
  let conflictArmed = opts.conflictOnce ?? false;
  const calls: Array<{ method: string; path: string; body?: any }> = [];
  let counter = 0;
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const path = u.replace(/^https:\/\/api\.github\.com\/repos\/o\/r/, '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body });

    if (method === 'GET' && path.startsWith('/branches/')) return json(branchExists ? 200 : 404, {});
    if (method === 'POST' && path === '/git/blobs') return json(201, { sha: 'blob' + ++counter });
    if (method === 'POST' && path === '/git/trees') return json(201, { sha: 'tree' + ++counter });
    if (method === 'POST' && path === '/git/commits') return json(201, { sha: 'commit' + ++counter });
    if (method === 'POST' && path === '/git/refs') { branchExists = true; return json(201, {}); }
    if (method === 'GET' && path.startsWith('/contents/')) {
      const file = decodeURIComponent(path.slice('/contents/'.length).split('?')[0]);
      if (!(file in files)) return json(404, { message: 'Not Found' });
      return json(200, { sha: 'sha-' + file, content: Buffer.from(files[file]).toString('base64') });
    }
    if (method === 'PUT' && path.startsWith('/contents/')) {
      const file = path.slice('/contents/'.length);
      if (conflictArmed) { conflictArmed = false; return json(409, { message: 'conflict' }); }
      if (file in files && body.sha !== 'sha-' + file) return json(409, { message: 'sha mismatch' });
      files[file] = Buffer.from(body.content, 'base64').toString('utf8');
      return json(file in files ? 200 : 201, { commit: { sha: 'c' + ++counter, html_url: `https://github.com/o/r/commit/c${counter}` } });
    }
    return json(500, { message: `unexpected ${method} ${path}` });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, files, calls };
}

const cfg = { repo: 'o/r', branch: 'anchors', token: 'tok', apiBase: 'https://api.github.com' };

describe('GitHubAnchorPublisher', () => {
  it('creates an orphan branch on first use, then appends without sha', async () => {
    const gh = fakeGitHub({ branchExists: false });
    const pub = new GitHubAnchorPublisher(cfg, gh.fetchImpl);
    const res = await pub.publish(97, '{"a":1}', 'msg');
    expect(res.remote).toBe('github:o/r@anchors');
    expect(res.commit).toMatch(/^c\d+$/);
    expect(res.url).toContain('/commit/');
    const orphan = gh.calls.find(c => c.path === '/git/commits');
    expect(orphan?.body.parents).toEqual([]);
    expect(gh.calls.find(c => c.path === '/git/refs')?.body.ref).toBe('refs/heads/anchors');
    expect(gh.files[anchorFilePath(97)]).toBe('{"a":1}\n');
    const put = gh.calls.find(c => c.method === 'PUT');
    expect(put?.body.sha).toBeUndefined();
    expect(put?.body.branch).toBe('anchors');
  });

  it('appends to an existing file, passing its sha, and never rewrites earlier lines', async () => {
    const file = anchorFilePath(97);
    const gh = fakeGitHub({ branchExists: true, files: { [file]: '{"a":1}\n' } });
    const pub = new GitHubAnchorPublisher(cfg, gh.fetchImpl);
    await pub.publish(97, '{"a":2}', 'msg');
    expect(gh.files[file]).toBe('{"a":1}\n{"a":2}\n');
    expect(gh.calls.find(c => c.method === 'PUT')?.body.sha).toBe('sha-' + file);
    expect(gh.calls.some(c => c.path.startsWith('/git/'))).toBe(false);
  });

  it('retries once on a 409 conflict', async () => {
    const gh = fakeGitHub({ branchExists: true, conflictOnce: true });
    const pub = new GitHubAnchorPublisher(cfg, gh.fetchImpl);
    await pub.publish(5, 'x', 'msg');
    expect(gh.calls.filter(c => c.method === 'PUT')).toHaveLength(2);
    expect(gh.files[anchorFilePath(5)]).toBe('x\n');
  });

  it('surfaces non-retryable API failures', async () => {
    const gh = fakeGitHub({ branchExists: true });
    const failing = vi.fn(async () => new Response('nope', { status: 403 })) as unknown as typeof fetch;
    const pub = new GitHubAnchorPublisher(cfg, failing);
    await expect(pub.publish(1, 'x', 'm')).rejects.toThrow(/HTTP 403/);
    void gh;
  });

  it('sends the token and never leaks it into the payload', async () => {
    const gh = fakeGitHub({ branchExists: true });
    const pub = new GitHubAnchorPublisher(cfg, gh.fetchImpl);
    await pub.publish(1, 'x', 'm');
    const init = (gh.fetchImpl as any).mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    for (const c of gh.calls) expect(JSON.stringify(c.body ?? {})).not.toContain('tok');
  });
});
