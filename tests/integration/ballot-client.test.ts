import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * These tests mock `node-fetch`. They used to assert the real message
 * 'Ballot validation service unavailable', which only holds when nothing is
 * listening on port 8000 — so they passed in CI and failed on any machine
 * running the ballot service, where the service answered for real. What they
 * are named for is multipart construction, so that is what they now check,
 * with transport pinned instead of assumed.
 *
 * `ballot-client` imports fetch from 'node-fetch', so stubbing globalThis.fetch
 * does nothing here — the module has to be mocked.
 */

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));
vi.mock('node-fetch', () => ({ default: mockFetch }));

const { validateBallot, verifyIdentity } = await import('../../server/utils/ballot-client');

/** Answer the next request without touching the network. */
function respondWith(response: { ok: boolean; status: number; body: unknown }) {
  mockFetch.mockResolvedValue({
    ok: response.ok,
    status: response.status,
    json: async () => response.body,
  });
}

afterEach(() => {
  mockFetch.mockReset();
});

describe('ballot client form-data integration', () => {
  it('builds multipart form data for ballot validation without throwing', async () => {
    respondWith({ ok: true, status: 200, body: { success: true, message: 'ok' } });

    const result = await validateBallot(Buffer.from('%PDF-1.4 fake'), 'poll-1', 'token-1');

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/ballot\/validate$/);
    expect(init.method).toBe('POST');
    // form-data sets the boundary in the header; without it the service cannot
    // parse the body at all, which is the failure this test exists to catch.
    expect(init.headers['content-type']).toMatch(/^multipart\/form-data; boundary=/);
  });

  it('builds multipart form data for identity verification without throwing', async () => {
    respondWith({ ok: true, status: 200, body: { success: true, message: 'ok' } });

    const result = await verifyIdentity(Buffer.from('%PDF-1.4 fake'));

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/ballot\/validate-identity$/);
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toMatch(/^multipart\/form-data; boundary=/);
  });

  it('reports the service unavailable when the transport fails', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const ballot = await validateBallot(Buffer.from('%PDF-1.4 fake'), 'poll-1', 'token-1');
    const identity = await verifyIdentity(Buffer.from('%PDF-1.4 fake'));

    expect(ballot.success).toBe(false);
    expect(ballot.message).toBe('Ballot validation service unavailable');
    expect(identity.success).toBe(false);
    expect(identity.message).toBe('Ballot validation service unavailable');
  });

  it('surfaces the service rejection reason when the ballot is refused', async () => {
    respondWith({
      ok: false,
      status: 400,
      body: { detail: 'Could not read malformed PDF file', rejection_reason: 'malformed_pdf' },
    });

    const result = await validateBallot(Buffer.from('%PDF-1.4 fake'), 'poll-1', 'token-1');

    expect(result.success).toBe(false);
    expect(result.message).toBe('Could not read malformed PDF file');
    expect(result.rejection_reason).toBe('malformed_pdf');
  });
});
