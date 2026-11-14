/** A second model answers when the first does not (server/utils/llm-client.ts). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ok = (content: string) => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content } }] }), { status: 200 });

describe('chatCompletion fallback', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('LLM_API_URL', 'http://primary.test');
    vi.stubEnv('LLM_API_KEY', 'k1');
    vi.stubEnv('LLM_MODEL', 'primary-model');
    vi.stubEnv('LLM_FALLBACK_URL', 'http://fallback.test');
    vi.stubEnv('LLM_FALLBACK_KEY', 'k2');
    vi.stubEnv('LLM_FALLBACK_MODEL', 'fallback-model');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('answers with the fallback when the first model errors, then skips the first while it is down', async () => {
    const fetch = vi.fn(async (url: string) => (String(url).startsWith('http://primary') ? new Response('down', { status: 503 }) : ok('από την εφεδρεία')));
    vi.stubGlobal('fetch', fetch);
    const { chatCompletion } = await import('../../server/utils/llm-client');
    expect(await chatCompletion({ messages: [{ role: 'user', content: 'x' }] })).toBe('από την εφεδρεία');
    expect(await chatCompletion({ messages: [{ role: 'user', content: 'y' }] })).toBe('από την εφεδρεία');
    expect(fetch.mock.calls.map((c) => String(c[0]).split('/')[2])).toEqual(['primary.test', 'fallback.test', 'fallback.test']);
    expect(JSON.parse(String((fetch.mock.calls[1][1] as RequestInit).body)).model).toBe('fallback-model');
  });

  it('uses only the first model when it answers', async () => {
    const fetch = vi.fn(async () => ok('κύριο'));
    vi.stubGlobal('fetch', fetch);
    const { chatCompletion } = await import('../../server/utils/llm-client');
    expect(await chatCompletion({ messages: [{ role: 'user', content: 'x' }] })).toBe('κύριο');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
