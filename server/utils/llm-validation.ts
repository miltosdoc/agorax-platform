/**
 * Proposal validation — local LLM gate.
 *
 * The gate answers two independent questions about a submitted proposal, and
 * only the first one can stop it:
 *
 *  1. **Abuse** — does the text violate Terms §6 ("Απαγορευμένες πράξεις")?
 *     Incitement to violence or hatred, incitement to illegal acts, third-party
 *     personal data, or spam/empty text. This is the only editorial power the
 *     platform granted itself, because it is the only one its members agreed
 *     to when they accepted the terms.
 *
 *  2. **Quality** — is the text comprehensible, does it name a civic matter?
 *     Advisory only. The score is shown to the author and the community; it
 *     never blocks, except at a floor that catches text nobody could read.
 *
 * Routing:
 *   - abuse, or score < 20 → 'return'       (send back to the author)
 *   - score 20-90          → 'sortition'    (open deliberation)
 *   - score > 90           → 'auto_approve' (same destination; a quality flag)
 *
 * What the gate deliberately does NOT judge: whether a proposal is feasible,
 * complete, specific, or well-argued. Those are the community's verdict, not
 * the model's — and a proposal that opens a question for deliberation to
 * answer is the normal case here, not a defective one. An earlier rubric
 * scored exactly those dimensions and returned 53% of all submissions; one
 * author was bounced seven times in a day for "phrasing it as a question".
 *
 * If the LLM is unavailable, falls back to the safe default: score 50,
 * category 'sortition' — every proposal routes to human deliberation.
 *
 * GDPR §4.2 compliance: proposal text never leaves the instance.
 * The LLM endpoint must be self-hosted / private.
 */

import { chatCompletion, isLlmConfigured, LlmUnavailableError } from './llm-client';

/** Terms §6 categories the gate is allowed to block on. */
export type AbuseKind = 'violence' | 'hate' | 'illegal' | 'personal_data' | 'spam';

export interface LLMValidationResult {
  score: number;
  feedback: string;
  category: 'return' | 'sortition' | 'auto_approve';
  /** Non-null only when the text breaches Terms §6. The sole blocking reason. */
  abuse: { kind: AbuseKind; reason: string } | null;
  details: {
    clarity: number;
    structure: number;
    civic: number;
  };
}

const VALIDATION_PROMPT = `Είσαι ο έλεγχος καταχρηστικού περιεχομένου μιας πλατφόρμας άμεσης δημοκρατίας.

Έχεις ΔΥΟ ανεξάρτητες δουλειές. Μόνο η πρώτη μπορεί να σταματήσει μια πρόταση.

## 1. Έλεγχος κατάχρησης (Όροι Χρήσης §6)

Θέσε "abuse" σε μία από τις παρακάτω τιμές ΜΟΝΟ αν το κείμενο πράγματι την παραβιάζει:

- "violence" — υποκινεί ή απειλεί βία εναντίον προσώπων ή ομάδων.
- "hate" — επιτίθεται σε πρόσωπα ή ομάδες λόγω καταγωγής, εθνότητας, θρησκείας,
  φύλου, σεξουαλικού προσανατολισμού ή αναπηρίας.
- "illegal" — καλεί ή καθοδηγεί σε τέλεση αξιόποινης πράξης.
- "personal_data" — δημοσιεύει προσωπικά δεδομένα τρίτου (τηλέφωνο, διεύθυνση,
  ΑΦΜ, ΑΜΚΑ, e-mail ιδιώτη).
- "spam" — διαφήμιση, ασύνδετοι χαρακτήρες, ή υποβολή που ΣΥΝΟΛΙΚΑ δεν
  περιέχει τίποτα αναγνώσιμο. Κρίνε ερώτημα και κείμενο ΜΑΖΙ: άδειο πεδίο
  κειμένου ΔΕΝ είναι spam όταν το ερώτημα από μόνο του είναι κατανοητό
  πολιτικό ζήτημα. Είναι ανοιχτό ερώτημα προς την κοινότητα, όχι κενή υποβολή.

Αλλιώς θέσε "abuse": null.

### Δεν είναι κατάχρηση — μην τα μπλοκάρεις ΠΟΤΕ:
- Σκληρή, οργισμένη ή σαρκαστική κριτική σε πολιτικούς, κόμματα, τον δήμο,
  την κυβέρνηση, την αστυνομία ή οποιονδήποτε θεσμό. Είναι ο λόγος ύπαρξης
  της πλατφόρμας.
- Αμφιλεγόμενες, ριζοσπαστικές ή μειοψηφικές θέσεις, όποιες κι αν είναι.
- Βαριά γλώσσα ως έμφαση («ο δρόμος είναι χάλια»). Βρισιά μετράει μόνο όταν
  στοχεύει συγκεκριμένο πρόσωπο ως προσβολή ή παρενόχληση.
- Πρόταση που θέτει ανοιχτό ερώτημα χωρίς λύση — ακόμη κι αν το πεδίο
  κειμένου είναι εντελώς άδειο.

## 2. Συμβουλευτική ποιότητα

Βαθμολόγησε 1-10 ΜΟΝΟ αυτά:
- "clarity" — καταλαβαίνει ο αναγνώστης τι λέει το κείμενο;
- "structure" — υπάρχει αναγνωρίσιμο θέμα ή ερώτημα;
- "civic" — αφορά πραγματικό ζήτημα της κοινότητας;

ΜΗΝ βαθμολογήσεις αν η πρόταση είναι εφικτή, πλήρης, τεκμηριωμένη ή
συγκεκριμένη. Αυτά τα κρίνει η κοινότητα στη διαβούλευση, όχι εσύ.

Μια πρόταση που θέτει ένα ερώτημα και αφήνει τη λύση στη διαβούλευση είναι
ΚΑΝΟΝΙΚΗ και παίρνει υψηλή βαθμολογία αν είναι σαφής. Η έλλειψη λύσης δεν
είναι ελάττωμα. Αν το πεδίο κειμένου είναι άδειο, βαθμολόγησε το ερώτημα.

Πρόταση:
---
Ερώτημα: {question}
Κείμενο: {solution}
---

Απάντησε ΜΟΝΟ σε JSON:
{
  "abuse": null,
  "abuse_reason": "",
  "clarity": <1-10>,
  "structure": <1-10>,
  "civic": <1-10>,
  "feedback": "<2-3 προτάσεις στα Ελληνικά. Αν abuse είναι null, γράψε τι θα βοηθούσε τη διαβούλευση — ως πρόταση, όχι ως όρο.>",
  "score": <0-100, ο μέσος όρος των 3 × 10>
}`;

interface ParsedValidation {
  abuse: AbuseKind | null;
  abuseReason: string;
  clarity: number;
  structure: number;
  civic: number;
  feedback: string;
  score: number;
}

const ABUSE_KINDS: readonly AbuseKind[] = ['violence', 'hate', 'illegal', 'personal_data', 'spam'];

function safeParse(jsonStr: string): ParsedValidation | null {
  try {
    // Strip any markdown code fences or prose
    const cleaned = jsonStr.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (
      typeof parsed.clarity === 'number' &&
      typeof parsed.structure === 'number' &&
      typeof parsed.civic === 'number' &&
      typeof parsed.feedback === 'string' &&
      typeof parsed.score === 'number'
    ) {
      // Anything the model invents outside the five agreed kinds is not a
      // ground the members consented to, so it is not a ground to block on.
      const abuse = ABUSE_KINDS.includes(parsed.abuse) ? (parsed.abuse as AbuseKind) : null;
      return {
        abuse,
        abuseReason: typeof parsed.abuse_reason === 'string' ? parsed.abuse_reason : '',
        clarity: parsed.clarity,
        structure: parsed.structure,
        civic: parsed.civic,
        feedback: parsed.feedback,
        score: parsed.score,
      };
    }
  } catch { /* fall through to fallback */ }
  return null;
}

function fallbackResult(): LLMValidationResult {
  return {
    score: 50,
    feedback:
      'Ο αυτόματος έλεγχος δεν ήταν προσωρινά διαθέσιμος — η πρόταση προωθείται κανονικά σε διαβούλευση χωρίς αυτόματη βαθμολόγηση. (Automatic review temporarily unavailable — proposal routed to deliberation without an AI score.)',
    category: 'sortition',
    abuse: null,
    details: { clarity: 5, structure: 5, civic: 5 },
  };
}

/** Wording shown to the author when the gate blocks on Terms §6. */
const ABUSE_MESSAGE: Record<AbuseKind, string> = {
  violence: 'Η πρόταση φαίνεται να υποκινεί ή να απειλεί βία, που απαγορεύεται από τους Όρους Χρήσης (§6).',
  hate: 'Η πρόταση φαίνεται να επιτίθεται σε πρόσωπα ή ομάδες λόγω προστατευόμενου χαρακτηριστικού, που απαγορεύεται από τους Όρους Χρήσης (§6).',
  illegal: 'Η πρόταση φαίνεται να καλεί σε παράνομη πράξη, που απαγορεύεται από τους Όρους Χρήσης (§6).',
  personal_data: 'Η πρόταση περιέχει προσωπικά δεδομένα τρίτου προσώπου. Αφαιρέστε τα και υποβάλετέ την ξανά.',
  spam: 'Το κείμενο δεν διαβάζεται ως πρόταση προς την κοινότητα (κενό, ασύνδετο ή διαφημιστικό).',
};

// Blocking grounds, in full:
//   - abuse  → the proposal breaches Terms §6, the only content rule members agreed to
//   - < 20   → floor for text nobody can read; not a quality opinion
// Everything else advances. >90 is a quality flag, not a shortcut: see
// targetStateFor(), which sends sortition and auto_approve to the same state.
function categorize(score: number, abuse: AbuseKind | null): LLMValidationResult['category'] {
  if (abuse) return 'return';
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
        {
          role: 'system',
          content:
            'Ελέγχεις αν ένα κείμενο παραβιάζει τους Όρους Χρήσης μιας δημοκρατικής πλατφόρμας. '
            + 'Δεν είσαι συντάκτης της ατζέντας: δεν κρίνεις αν μια πολιτική θέση είναι σωστή, '
            + 'ρεαλιστική, ώριμη ή επαρκώς τεκμηριωμένη. Στην αμφιβολία, αφήνεις την πρόταση να περάσει.',
        },
        { role: 'user', content: prompt },
      ],
      maxTokens: 1000,
      // Deterministic: the same text must get the same verdict twice. The old
      // 0.3 made scores swing 40 points across re-validations of one proposal.
      temperature: 0,
      timeoutMs: 30_000,
      enableThinking: false,
      jsonMode: true,
    });

    const parsed = safeParse(response);
    if (!parsed) {
      console.warn('[llm-validation] Failed to parse LLM response, using fallback');
      return fallbackResult();
    }

    const score = Math.min(100, Math.max(0, parsed.score));
    const abuse = parsed.abuse
      ? { kind: parsed.abuse, reason: parsed.abuseReason || ABUSE_MESSAGE[parsed.abuse] }
      : null;

    return {
      score,
      // A blocked proposal must say which rule it broke, not offer writing tips.
      feedback: abuse ? `${ABUSE_MESSAGE[abuse.kind]} ${abuse.reason}`.trim() : parsed.feedback,
      category: categorize(score, parsed.abuse),
      abuse,
      details: {
        clarity: Math.min(10, Math.max(1, parsed.clarity)),
        structure: Math.min(10, Math.max(1, parsed.structure)),
        civic: Math.min(10, Math.max(1, parsed.civic)),
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
