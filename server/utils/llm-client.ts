/**
 * Minimal OpenAI-compatible chat completions client.
 *
 * Targets the private inference endpoint configured in env
 * (`LLM_API_URL`, `LLM_API_KEY`, `LLM_MODEL`). The original GDPR audit
 * (docs/compliance/02_DATA_MINIMIZATION_AUDIT.md §4.2) banned external
 * disclosure of proposal text to OpenRouter; the controller has since
 * re-run the audit for a private/EU endpoint, so we re-enable the gate
 * for callers that ask for it. Each call site is responsible for its
 * own opt-in — `chatCompletion` is a low-level building block, not a
 * blanket re-enable.
 *
 * Failure semantics: any error (no env, network, parse, empty content)
 * throws an `LlmUnavailableError` so callers can choose to fall back
 * to a deterministic local path instead of surfacing the failure to
 * the user.
 */

export class LlmUnavailableError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'LlmUnavailableError';
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  /**
   * If `false`, disable chain-of-thought reasoning on models that
   * support it. Reasoning models (Qwen 3, DeepSeek-R1 family) will
   * otherwise burn the entire token budget on internal thinking
   * before emitting any content, which is useless for our use-case.
   */
  enableThinking?: boolean;
  /**
   * Enforce structured JSON output via OpenAI-compatible
   * `response_format: {type:'json_object'}` (verified supported by the
   * configured xsilico endpoint). The caller still validates the parsed
   * object against its schema — this only guarantees syntax, not shape.
   */
  jsonMode?: boolean;
}

export interface LlmConfig {
  url: string;
  apiKey: string;
  model: string;
}

export function readLlmConfig(): LlmConfig | null {
  const url = process.env.LLM_API_URL;
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;
  if (!url || !apiKey || !model) return null;
  return { url: url.replace(/\/$/, ''), apiKey, model };
}

export function isLlmConfigured(): boolean {
  return readLlmConfig() !== null;
}

/**
 * Send a chat completion request and return the assistant text. Throws
 * `LlmUnavailableError` if anything goes wrong — callers should catch
 * and fall back. We intentionally keep this loose: any 200 response
 * whose `choices[0].message.content` is a non-empty string counts as
 * success; everything else throws.
 */
async function completeWith(cfg: LlmConfig, opts: ChatCompletionOptions): Promise<string> {
  const url = `${cfg.url}/chat/completions`;
  const timeoutMs = opts.timeoutMs ?? 45_000;

  // Reasoning models bill hidden thinking tokens against the SAME max_tokens
  // budget as the visible answer, so one number has to cover both. Measured on
  // the configured endpoint: a 15-amendment merge spent 3838 of 4000 tokens
  // thinking, and what came back as `content` was a mid-word fragment of the
  // model's internal plan rather than an answer. Budget the two separately.
  const answerBudget = Math.max(opts.maxTokens ?? 4000, 4000);
  const reasoningBudget = opts.enableThinking === false ? 4000 : 8000;

  const attempt = async (capReasoning: boolean): Promise<string> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: cfg.model,
          messages: opts.messages,
          max_tokens: answerBudget + reasoningBudget,
          temperature: opts.temperature ?? 0.7,
          // `reasoning: {enabled: false}` is rejected outright for models where
          // reasoning is mandatory, but a token cap is accepted — that is how
          // enableThinking:false is honoured. The cap is advisory (the model may
          // overshoot it), which is why the headroom above is separate from it.
          // Dropped on retry if a model refuses the field entirely.
          ...(capReasoning ? { reasoning: { max_tokens: reasoningBudget } } : {}),
          ...(opts.jsonMode ? { response_format: { type: 'json_object' } } : {}),
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const httpErr = new LlmUnavailableError(`LLM HTTP ${res.status}: ${text.slice(0, 200)}`);
        (httpErr as any).httpStatus = res.status;
        throw httpErr;
      }
      const json = (await res.json()) as {
        choices?: Array<{ finish_reason?: string; message?: { content?: string | null } }>;
      };
      const choice = json.choices?.[0];
      // A truncated completion is worse than none: the gateway hands back a
      // mid-word slice of the model's internal plan, which callers would
      // otherwise persist as finished text. Force the deterministic fallback.
      if (choice?.finish_reason === 'length') {
        throw new LlmUnavailableError(
          `LLM output truncated at max_tokens (${answerBudget + reasoningBudget}) — discarding partial text`,
        );
      }
      const content = choice?.message?.content;
      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        throw new LlmUnavailableError('LLM returned empty content');
      }
      return content;
    } catch (err: any) {
      if (err instanceof LlmUnavailableError) throw err;
      if (err?.name === 'AbortError') {
        throw new LlmUnavailableError(`LLM call timed out after ${timeoutMs}ms`, err);
      }
      throw new LlmUnavailableError(`LLM call failed: ${err?.message ?? String(err)}`, err);
    } finally {
      clearTimeout(timer);
    }
  };

  const capReasoning = opts.enableThinking === false;
  try {
    return await attempt(capReasoning);
  } catch (err: any) {
    if (capReasoning && err?.httpStatus === 400) {
      console.warn('[llm-client] endpoint rejected the reasoning cap; retrying without it');
      return attempt(false);
    }
    throw err;
  }
}

/**
 * A second model for when the first does not answer
 * (LLM_FALLBACK_URL — defaults to LLM_API_URL —, LLM_FALLBACK_KEY,
 * LLM_FALLBACK_MODEL). On 2026-11-14 Gemma 4 hung for every caller while
 * the provider's other models answered in under a second; without a second
 * model every AI feature failed with it.
 */
export function readFallbackConfig(): LlmConfig | null {
  const url = process.env.LLM_FALLBACK_URL || process.env.LLM_API_URL;
  const apiKey = process.env.LLM_FALLBACK_KEY || process.env.LLM_API_KEY;
  const model = process.env.LLM_FALLBACK_MODEL;
  if (!url || !apiKey || !model) return null;
  return { url: url.replace(/\/$/, ''), apiKey, model };
}

// With a fallback at hand, a short call does not wait out its whole budget
// on a model that is not answering; and once the first model has been found
// down, calls go straight to the fallback for a few minutes instead of each
// waiting to find out again. Long calls (whole-statute rewrites) keep their
// budget on the first model unless it is already known to be down.
const PRIMARY_PATIENCE_MS = 45_000;
const PRIMARY_DOWN_MS = 5 * 60_000;
let primaryDownUntil = 0;

/**
 * Send a chat completion request and return the assistant text. Throws
 * `LlmUnavailableError` if anything goes wrong — callers should catch
 * and fall back. We intentionally keep this loose: any 200 response
 * whose `choices[0].message.content` is a non-empty string counts as
 * success; everything else throws. When the configured model fails and a
 * fallback model is configured, the same request goes to the fallback.
 */
export async function chatCompletion(opts: ChatCompletionOptions): Promise<string> {
  const cfg = readLlmConfig();
  if (!cfg) {
    throw new LlmUnavailableError('LLM env not configured (LLM_API_URL, LLM_API_KEY, LLM_MODEL)');
  }
  const fallback = readFallbackConfig();
  if (!fallback) return completeWith(cfg, opts);
  if (Date.now() < primaryDownUntil) return completeWith(fallback, opts);
  const budget = opts.timeoutMs ?? 45_000;
  try {
    return await completeWith(cfg, { ...opts, timeoutMs: budget <= 120_000 ? Math.min(budget, PRIMARY_PATIENCE_MS) : budget });
  } catch (err: any) {
    if (!(err instanceof LlmUnavailableError)) throw err;
    const status = (err as { httpStatus?: number }).httpStatus;
    // Not answering at all, or a server error: the model is down, not this request.
    if (/timed out|call failed/.test(err.message) || (status !== undefined && (status >= 500 || status === 429))) {
      primaryDownUntil = Date.now() + PRIMARY_DOWN_MS;
    }
    console.warn(`[llm-client] ${cfg.model} failed (${err.message.slice(0, 120)}); answering with ${fallback.model}`);
    return completeWith(fallback, opts);
  }
}

