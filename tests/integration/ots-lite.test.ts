/**
 * Browser-side OpenTimestamps reader — checked offline against two real
 * proofs: one pending (calendar promises only) and one completed in Bitcoin
 * block 967193, whose merkle root is known from the reference client.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { bytesToHex, checkBitcoinAttestation, parseOts, sha256Hex } from '../../client/src/lib/ots-lite';
import { auditBallotBox } from '../../client/src/lib/ballot-box-audit';

const load = (name: string) => new Uint8Array(Buffer.from(readFileSync(`tests/fixtures/${name}`, 'utf8').trim(), 'base64'));

const COMPLETE_DIGEST = '98ef670a975c5a728b8851d695e5be0dc60800f32c1d6902419976760c4464b9';
const COMPLETE_MERKLE = 'ececf3e183a0cfcd57ac28612737a9aad2062f93ec80cf581c6b45dc1335cb8c';

describe('parseOts', () => {
  it('reads a pending proof: digest, calendar promises, no block', async () => {
    const proof = await parseOts(load('ots-pending.b64'));
    expect(proof.digestAlgo).toBe('sha256');
    expect(bytesToHex(proof.digest)).toBe('6f75bc00'.repeat(8));
    expect(proof.attestations.length).toBeGreaterThan(0);
    expect(proof.attestations.every(a => a.kind === 'pending')).toBe(true);
  });

  it('replays a completed proof down to the Bitcoin merkle root', async () => {
    const proof = await parseOts(load('ots-complete.b64'));
    expect(bytesToHex(proof.digest)).toBe(COMPLETE_DIGEST);
    const btc = proof.attestations.filter(a => a.kind === 'bitcoin');
    expect(btc.length).toBeGreaterThan(0);
    for (const a of btc) {
      if (a.kind !== 'bitcoin') continue;
      expect(a.height).toBe(967193);
      // Attestation message is the merkle root in internal byte order.
      expect(bytesToHex(a.message.slice().reverse())).toBe(COMPLETE_MERKLE);
    }
  });

  it('rejects bytes that are not a proof', async () => {
    await expect(parseOts(new Uint8Array([1, 2, 3]))).rejects.toThrow(/not an OpenTimestamps proof|unexpected end/);
  });
});

describe('checkBitcoinAttestation', () => {
  it('confirms when the explorer merkle root matches, flags when it does not', async () => {
    const proof = await parseOts(load('ots-complete.b64'));
    const att = proof.attestations.find(a => a.kind === 'bitcoin');
    if (!att || att.kind !== 'bitcoin') throw new Error('fixture has no bitcoin attestation');

    const explorer = (merkle: string) => vi.fn(async (url: string) => {
      if (url.endsWith('/block-height/967193')) return new Response('00000000000000000000aa', { status: 200 });
      if (url.includes('/block/')) return new Response(JSON.stringify({ merkle_root: merkle, timestamp: 1789512565 }), { status: 200 });
      return new Response('no', { status: 404 });
    }) as unknown as typeof fetch;

    const good = await checkBitcoinAttestation(att, { fetchImpl: explorer(COMPLETE_MERKLE) });
    expect(good.ok).toBe(true);
    expect(good.blockTime).toBe(1789512565);
    expect(good.expectedMerkleRoot).toBe(COMPLETE_MERKLE);

    const bad = await checkBitcoinAttestation(att, { fetchImpl: explorer('ff'.repeat(32)) });
    expect(bad.ok).toBe(false);
    expect(bad.actualMerkleRoot).toBe('ff'.repeat(32));
  });
});

describe('auditBallotBox', () => {
  it('cross-checks server, GitHub and Bitcoin, and spots a rewritten chain', async () => {
    const line = {
      v: 1, proposalId: 97, phase: 'final', headHash: 'ab'.repeat(32), total: 3, verifyOk: true,
      capturedAt: '2026-09-15T22:04:32.390Z', prevAnchorHash: '0'.repeat(64),
    };
    const canonical = JSON.stringify(line);
    const anchorHash = await sha256Hex(canonical);
    const published = canonical.slice(0, -1) + `,"anchorHash":"${anchorHash}"}` + '\n';

    const makeFetch = (liveHead: string) => vi.fn(async (url: string) => {
      if (url.includes('/election/verify')) return new Response(JSON.stringify({ ok: true, payload: { headHash: liveHead, total: 3 } }), { status: 200 });
      if (url.includes('/election/anchors')) return new Response(JSON.stringify({ remote: 'github:o/r@anchors', anchors: [] }), { status: 200 });
      if (url.includes('/receipt-inclusion')) {
        const found = url.includes(`rowHash=${liveHead}`);
        return new Response(JSON.stringify({ found }), { status: 200 });
      }
      if (url.includes('raw.githubusercontent.com/o/r/anchors/anchors/proposal-97.jsonl')) return new Response(published, { status: 200 });
      if (url.includes('/anchors/ots/')) return new Response('', { status: 404 }); // still pending
      return new Response('?', { status: 404 });
    }) as unknown as typeof fetch;

    const honest = await auditBallotBox(97, { fetchImpl: makeFetch('ab'.repeat(32)) });
    expect(honest.github.anchors).toHaveLength(1);
    expect(honest.github.sequenceOk).toBe(true);
    expect(honest.github.inclusionMissing).toBe(0);
    expect(honest.github.finalMatches).toBe(true);
    expect(honest.bitcoin[0]?.status).toBe('pending');
    expect(honest.verdict).toBe('ok');

    const rewritten = await auditBallotBox(97, { fetchImpl: makeFetch('cd'.repeat(32)) });
    expect(rewritten.github.inclusionMissing).toBe(1);
    expect(rewritten.github.finalMatches).toBe(false);
    expect(rewritten.verdict).toBe('problem');
  });
});
