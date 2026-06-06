/**
 * Proposal validation — local LLM gate.
 *
 * Calls the configured local inference endpoint (LLM_API_URL) to evaluate
 * proposal quality. The model scores five dimensions and returns a structured
 * result that routes the proposal to the next canonical state:
 *
 *   - score < 20  → 'return'       (send back to author for revision)
 *   - score 20-90 → 'sortition'    (open deliberation + sortition body)
 *   - score > 90  → 'auto_approve' (skip deliberation, go straight to voting)
 *
 * If the LLM is unavailable, falls back to the safe default: score 50,
 * category 'sortition' — every proposal routes to human review.
 *
 * GDPR §4.2 compliance: proposal text never leaves the instance.
 * The LLM endpoint must be self-hosted / private.
 */

import { chatCompletion, isLlmConfigured, LlmUnavailableError } from './llm-client';

export interface LLMValidationResult {
  score: number;
  feedback: string;
  category: 'return' | 'sortition' | 'auto_approve';
  details: {
    structure: number;
    specificity: number;
    feasibility: number;
    completeness: number;
    clarity: number;
  };
}

const VALIDATION_PROMPT = `Είσαι αξιολογητής προτάσεων για πλατφόρμα διαλογικής δημοκρατίας.
Αξιολόγησε την παρακάτω πρόταση σε 5 διαστάσεις (1-10 η καθεμία):

1. **Δομή** — Η πρόταση έχει ξεκάθαρο πρόβλημα και λύση;
2. **Ειδικότητα** — Είναι συγκεκριμένη ή αόριστη;
3. **Εφικτότητα** — Μπορεί να υλοποιηθεί ρεαλιστικά;
4. **Πληρότητα** — Καλύπτει τα βασικά (τι, γιατί, πώς, ποιος);
5. **Διαύγεια** — Είναι κατανοητή σε μη ειδικό;

Πρόταση:
---
Πρόβλημα: {question}
Λύση: {solution}
---

Απάντησε ΜΟΝΟ σε JSON format:
{{
  "structure": <1-10>,
  "specificity": <1-10>,
  "feasibility": <1-10>,
  "completeness": <1-10>,
  "clarity": <1-10>,
  "feedback": "<συνοπτική αξιολόγηση στα Ελληνικά, 2-3 προτάσεις>",
  "score": <0-100>
}}

Το score είναι ο μέσος όρος των 5 διαστάσεων × 10.
Αν η πρόταση είναι ασαφής, προπαγάνδα, ή δεν περιέχει λύση, δώσε χαμηλό score.`;

function safeParse(jsonStr: string): LLMValidationResult['details'] & { feedback: string; score: number } | null {
  try {
    // Strip any markdown code fences or prose
    const cleaned = jsonStr.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (
      typeof parsed.structure === 'number' &&
      typeof parsed.specificity === 'number' &&
      typeof parsed.feasibility === 'number' &&
      typeof parsed.completeness === 'number' &&
      typeof parsed.clarity === 'number' &&
      typeof parsed.feedback === 'string' &&
      typeof parsed.score === 'number'
    ) {
      return parsed;
    }
  } catch { /* fall through to fallback */ }
  return null;
}

function fallbackResult(): LLMValidationResult {
  return {
    score: 50,
    feedback:
      'Αυτόματος έλεγχος ποιότητας ανενεργός — η πρόταση προωθείται σε κληρωτό σώμα για ανθρώπινη αξιολόγηση. (Quality gate disabled — proposal routed to sortition body for human review.)',
    category: 'sortition',
    details: {
      structure: 5,
      specificity: 5,
      feasibility: 5,
      completeness: 5,
      clarity: 5,
    },
  };
}

function categorize(score: number): LLMValidationResult['category'] {
  if (score < 20) return 'return';
  if (score > 90) return 'auto_approve';
  return 'sortition';
}

export async function validateProposal(
  question: string,
  solution: string,
): Promise<LLMValidationResult> {
  if (!isLlmConfigured()) {
    return fallbackResult();
  }

  try {
    const prompt = VALIDATION_PROMPT
      .replace('{question}', question.slice(0, 2000))
      .replace('{solution}', solution.slice(0, 4000));

    const response = await chatCompletion({
      messages: [
        { role: 'system', content: 'Είσαι αντικειμενικός αξιολογητής πολιτικών προτάσεων. Αξιολογείς μόνο την ποιότητα της διατύπωσης και της δομής, όχι την πολιτική συμφωνία.' },
        { role: 'user', content: prompt },
      ],
      maxTokens: 1000,
      temperature: 0.3,
      timeoutMs: 30_000,
      enableThinking: false,
    });

    const parsed = safeParse(response);
    if (!parsed) {
      console.warn('[llm-validation] Failed to parse LLM response, using fallback');
      return fallbackResult();
    }

    const score = Math.min(100, Math.max(0, parsed.score));
    return {
      score,
      feedback: parsed.feedback,
      category: categorize(score),
      details: {
        structure: Math.min(10, Math.max(1, parsed.structure)),
        specificity: Math.min(10, Math.max(1, parsed.specificity)),
        feasibility: Math.min(10, Math.max(1, parsed.feasibility)),
        completeness: Math.min(10, Math.max(1, parsed.completeness)),
        clarity: Math.min(10, Math.max(1, parsed.clarity)),
      },
    };
  } catch (err) {
    if (err instanceof LlmUnavailableError) {
      console.warn(`[llm-validation] LLM unavailable: ${err.message}`);
    } else {
      console.warn(`[llm-validation] Unexpected error: ${err}`);
    }
    return fallbackResult();
  }
}
