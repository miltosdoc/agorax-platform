/**
 * LLM Proposal Compiler — natural-language intent → structured proposal draft.
 *
 * Sibling of the poll compiler, deliberately simpler: a single GENERATOR
 * call produces { question, solution, category }. There is no adversarial
 * reviewer here because every proposal already passes through the AI
 * validation gate on submit (llm-validation.ts) — that is the reviewer.
 *
 * The output is a *starting point*: it fills the proposal form fields and
 * the author edits freely before submitting. Output is zod-validated; a
 * schema failure is retried once with the errors fed back, then rejected.
 */
import { z } from 'zod';
import { chatCompletion } from './llm-client';

export const PROPOSAL_CATEGORIES = [
  'education', 'healthcare', 'infrastructure', 'environment',
  'economy', 'governance', 'other',
] as const;

const compiledProposalSchema = z.object({
  question: z.string().min(10).max(300),
  solution: z.string().min(30).max(8000),
  category: z.enum(PROPOSAL_CATEGORIES),
});

export type CompiledProposal = z.infer<typeof compiledProposalSchema>;

const SYSTEM_PROMPT = `You are the proposal-drafting assistant of AgoraX, a Greek digital democracy platform.
The user describes, in their own words, a civic problem and/or an idea. Turn it into a well-formed proposal draft.

Rules:
- Write in the SAME language as the user's description (Greek stays Greek, English stays English).
- "question": the problem phrased as one clear, neutral question a community can deliberate on. No loaded or leading language. Max ~200 characters.
- "solution": a concrete, actionable proposal in 2–5 short paragraphs: what should be done, how, and what the expected effect is. Plain text, no markdown headers.
- "category": exactly one of: education, healthcare, infrastructure, environment, economy, governance, other.
- Stay strictly faithful to the user's intent — structure and clarify it, do not add your own policy positions.
- If the description is abusive, spam, or not a civic matter at all, still produce the most reasonable neutral framing you can; validation happens elsewhere.

Respond with ONLY a JSON object: {"question": "...", "solution": "...", "category": "..."}`;

export async function compileProposal(intent: string): Promise<CompiledProposal> {
  let lastErrors = '';
  for (let round = 1; round <= 2; round++) {
    const raw = await chatCompletion({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: round === 1
            ? intent
            : `${intent}\n\nYour previous output failed validation with these errors, fix them and return the corrected JSON only:\n${lastErrors}`,
        },
      ],
      temperature: 0.4,
      maxTokens: 4000,
      jsonMode: true,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      lastErrors = 'Output was not valid JSON.';
      continue;
    }
    const result = compiledProposalSchema.safeParse(parsed);
    if (result.success) return result.data;
    lastErrors = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  }
  throw new Error(`Proposal compilation failed schema validation: ${lastErrors}`);
}
