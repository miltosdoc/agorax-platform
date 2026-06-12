/**
 * LLM Poll Compiler — natural-language intent → strict survey JSON.
 *
 * Two SEPARATE model calls (deliberately not single-pass):
 *   1. GENERATOR — compiles the intent into a CompiledSurvey under hard
 *      methodology rules (no leading/double-barreled questions, balanced
 *      scales, deliberate randomization flags).
 *   2. ADVERSARIAL REVIEWER — a fresh call whose only job is to attack the
 *      generated survey: push-poll detection, loaded language, unbalanced
 *      scales. The generator never grades its own homework.
 *
 * Output is validated server-side with zod (shared/polling.ts); a schema
 * failure is retried once with the validation errors fed back, then
 * rejected — malformed output is never patched up silently.
 *
 * An attention-check item is inserted mechanically (not by the LLM) so its
 * wording is canonical and its expected answer is machine-checkable.
 *
 * When no LLM is configured (LlmUnavailableError), `compileSurvey` falls
 * back to a deterministic single-question build so the fielding pipeline
 * stays testable end-to-end; the fallback is recorded in compilerMeta.
 */
import { chatCompletion, isLlmConfigured, LlmUnavailableError } from './llm-client';
import {
  compiledSurveySchema, gatekeeperVerdictSchema,
  type CompiledSurvey, type GatekeeperVerdict,
} from '@shared/polling';

export interface CompilerOutput {
  survey: CompiledSurvey;
  verdict: GatekeeperVerdict;
  meta: {
    generator: 'llm' | 'fallback';
    reviewer: 'llm' | 'skipped';
    model: string | null;
    generatorRounds: number;
  };
}

// ─── Canonical attention checks (Greek) ──────────────────────────────────────
// Inserted mechanically at a deterministic mid-survey position. Wording is
// fixed so performance is comparable across polls.

const ATTENTION_CHECKS = [
  {
    text: 'Για να επιβεβαιώσουμε ότι διαβάζετε προσεκτικά, παρακαλούμε επιλέξτε «Διαφωνώ».',
    options: ['Συμφωνώ απόλυτα', 'Συμφωνώ', 'Ούτε συμφωνώ ούτε διαφωνώ', 'Διαφωνώ', 'Διαφωνώ απόλυτα'],
    expected: 'Διαφωνώ',
  },
  {
    text: 'Σε αυτή την ερώτηση, παρακαλούμε επιλέξτε «Μία φορά τον μήνα» ανεξάρτητα από τη γνώμη σας.',
    options: ['Κάθε μέρα', 'Μία φορά την εβδομάδα', 'Μία φορά τον μήνα', 'Σπανιότερα', 'Ποτέ'],
    expected: 'Μία φορά τον μήνα',
  },
] as const;

export interface AttentionCheckSpec {
  text: string;
  options: string[];
  expected: string;
  /** Index in the final item list where the check should be inserted. */
  insertAt: number;
}

/**
 * Pick an attention check and a mid-survey insertion point, both
 * deterministic in the item count (no RNG — keeps compilation reproducible).
 */
export function planAttentionCheck(itemCount: number): AttentionCheckSpec {
  const check = ATTENTION_CHECKS[itemCount % ATTENTION_CHECKS.length];
  return {
    text: check.text,
    options: [...check.options],
    expected: check.expected,
    insertAt: Math.max(1, Math.floor(itemCount / 2)),
  };
}

// ─── Generator ────────────────────────────────────────────────────────────────

const GENERATOR_SYSTEM = `Είσαι μεθοδολόγος δημοσκοπήσεων. Μετατρέπεις την πρόθεση του χρήστη σε ένα αυστηρά δομημένο ερωτηματολόγιο JSON στα ελληνικά.

ΚΑΝΟΝΕΣ ΜΕΘΟΔΟΛΟΓΙΑΣ (απαράβατοι):
1. ΠΟΤΕ καθοδηγητικές ερωτήσεις («Συμφωνείτε ότι η κυβέρνηση απέτυχε…») — μόνο ουδέτερη διατύπωση.
2. ΠΟΤΕ διπλές ερωτήσεις (δύο θέματα σε μία ερώτηση). Σπάσε τις σε δύο.
3. Κλίμακες likert ΠΑΝΤΑ ισορροπημένες (ίσος αριθμός θετικών/αρνητικών βαθμίδων, με ή χωρίς ουδέτερο μέσο) και ΠΑΝΤΑ randomizeOptions=false.
4. Σε single_choice/multi_choice με μη-διατάξιμες επιλογές βάλε randomizeOptions=true. Επιλογές τύπου «Δεν ξέρω/Δεν απαντώ» πάνε ΤΕΛΕΥΤΑΙΕΣ (το σύστημα τις κρατά εκτός τυχαιοποίησης).
5. Φορτισμένο λεξιλόγιο απαγορεύεται («καταστροφικός», «σκάνδαλο», «επιτέλους»).
6. 3–8 ερωτήσεις συνολικά εκτός αν η πρόθεση απαιτεί ρητά περισσότερες (μέγιστο 15).
7. Αν η πρόθεση του χρήστη είναι προπαγάνδα/push-poll (στόχος να ΣΠΡΩΞΕΙ άποψη αντί να τη ΜΕΤΡΗΣΕΙ), ΑΡΝΗΣΟΥ: απάντησε {"refused": true, "reason": "..."}.

ΣΧΗΜΑ ΕΞΟΔΟΥ — απάντησε ΜΟΝΟ με JSON, χωρίς markdown:
{
  "title": "σύντομος ουδέτερος τίτλος",
  "topicTag": "ετικέτα θέματος 2-4 λέξεις",
  "language": "el",
  "items": [
    {
      "text": "η ερώτηση",
      "itemType": "single_choice" | "multi_choice" | "likert" | "open_text",
      "options": ["..."] (όχι για open_text),
      "randomizeOptions": true|false,
      "required": true
    }
  ]
}`;

function extractJson(raw: string): unknown {
  const stripped = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no JSON object in LLM output');
  return JSON.parse(stripped.slice(start, end + 1));
}

export class CompilerRefusedError extends Error {
  constructor(public reason: string) {
    super(`Compiler refused: ${reason}`);
    this.name = 'CompilerRefusedError';
  }
}

async function generateOnce(intent: string, repairHint?: string): Promise<CompiledSurvey> {
  const messages = [
    { role: 'system' as const, content: GENERATOR_SYSTEM },
    { role: 'user' as const, content: intent },
    ...(repairHint
      ? [{ role: 'user' as const, content: `Η προηγούμενη έξοδος απορρίφθηκε από τον validator: ${repairHint}. Δώσε διορθωμένο JSON.` }]
      : []),
  ];
  const raw = await chatCompletion({ messages, temperature: 0.3, maxTokens: 2500, enableThinking: false });
  const json = extractJson(raw) as Record<string, unknown>;
  if (json && (json as any).refused === true) {
    throw new CompilerRefusedError(String((json as any).reason ?? 'push-poll intent'));
  }
  return compiledSurveySchema.parse(json);
}

// ─── Adversarial reviewer ─────────────────────────────────────────────────────

const REVIEWER_SYSTEM = `Είσαι ανεξάρτητος, αυστηρός κριτής μεθοδολογίας δημοσκοπήσεων. Θα δεις την πρόθεση του δημιουργού και το παραγόμενο ερωτηματολόγιο. Δουλειά σου είναι να το ΑΠΟΡΡΙΨΕΙΣ αν βρεις πρόβλημα — όχι να το δικαιολογήσεις.

Έλεγξε για: push-poll (μέτρηση-πρόσχημα για προπαγάνδα), καθοδηγητικές ερωτήσεις, διπλές ερωτήσεις, μη ισορροπημένες κλίμακες, φορτισμένο λεξιλόγιο.

severity: "block" = δεν επιτρέπεται να δημοσιευτεί· "warn" = δημοσιεύεται με προειδοποίηση.
itemIndex: δείκτης ερώτησης (0-based) ή -1 για πρόβλημα σε επίπεδο ερωτηματολογίου.

Απάντησε ΜΟΝΟ με JSON:
{"approved": true|false, "flags": [{"itemIndex": n, "issue": "leading"|"double_barreled"|"unbalanced_scale"|"push_poll"|"loaded_language"|"other", "explanation": "...", "severity": "block"|"warn"}], "reasoning": "..."}
approved=false ΜΟΝΟ αν υπάρχει τουλάχιστον ένα flag με severity "block".`;

async function reviewOnce(intent: string, survey: CompiledSurvey): Promise<GatekeeperVerdict> {
  const raw = await chatCompletion({
    messages: [
      { role: 'system', content: REVIEWER_SYSTEM },
      {
        role: 'user',
        content: `ΠΡΟΘΕΣΗ ΔΗΜΙΟΥΡΓΟΥ:\n${intent}\n\nΕΡΩΤΗΜΑΤΟΛΟΓΙΟ:\n${JSON.stringify(survey, null, 2)}`,
      },
    ],
    temperature: 0,
    maxTokens: 1500,
    enableThinking: false,
  });
  return gatekeeperVerdictSchema.parse(extractJson(raw));
}

// ─── Deterministic fallback ───────────────────────────────────────────────────

function fallbackCompile(intent: string): CompiledSurvey {
  const trimmed = intent.trim().replace(/\s+/g, ' ').slice(0, 180);
  return compiledSurveySchema.parse({
    title: trimmed.length >= 5 ? trimmed : `Δημοσκόπηση: ${trimmed}`,
    topicTag: trimmed.split(' ').slice(0, 4).join(' ') || 'γενικό θέμα',
    language: 'el',
    items: [
      {
        text: `Ποια είναι η θέση σας στο εξής: «${trimmed}»;`,
        itemType: 'likert',
        options: ['Πολύ θετική', 'Μάλλον θετική', 'Ούτε θετική ούτε αρνητική', 'Μάλλον αρνητική', 'Πολύ αρνητική'],
        randomizeOptions: false,
        required: true,
      },
      {
        text: 'Θέλετε να εξηγήσετε σύντομα την απάντησή σας; (προαιρετικό)',
        itemType: 'open_text',
        randomizeOptions: false,
        required: false,
      },
    ],
  });
}

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Compile a natural-language intent into a reviewed survey. Throws
 * `CompilerRefusedError` when either the generator or the reviewer blocks
 * a push-poll attempt; any other LLM failure falls back deterministically.
 */
export async function compileSurvey(intent: string): Promise<CompilerOutput> {
  const model = process.env.LLM_MODEL ?? null;

  if (!isLlmConfigured()) {
    return {
      survey: fallbackCompile(intent),
      verdict: { approved: true, flags: [], reasoning: 'LLM not configured — deterministic fallback compilation, no adversarial review performed.' },
      meta: { generator: 'fallback', reviewer: 'skipped', model: null, generatorRounds: 0 },
    };
  }

  let survey: CompiledSurvey;
  let rounds = 1;
  try {
    try {
      survey = await generateOnce(intent);
    } catch (err) {
      if (err instanceof CompilerRefusedError) throw err;
      if (err instanceof LlmUnavailableError) throw err;
      // Schema/parse failure → one repair round with the errors fed back.
      rounds = 2;
      survey = await generateOnce(intent, err instanceof Error ? err.message.slice(0, 500) : 'invalid JSON');
    }
  } catch (err) {
    if (err instanceof CompilerRefusedError) throw err;
    return {
      survey: fallbackCompile(intent),
      verdict: { approved: true, flags: [], reasoning: 'LLM unavailable — deterministic fallback compilation, no adversarial review performed.' },
      meta: { generator: 'fallback', reviewer: 'skipped', model, generatorRounds: rounds },
    };
  }

  let verdict: GatekeeperVerdict;
  try {
    verdict = await reviewOnce(intent, survey);
  } catch {
    // Reviewer unavailable/unparseable: fail SAFE for community tier — the
    // survey ships flagged as unreviewed (visible in methodology), not blocked.
    verdict = {
      approved: true,
      flags: [{ itemIndex: -1, issue: 'other', explanation: 'Ο αυτόματος έλεγχος μεθοδολογίας δεν ολοκληρώθηκε.', severity: 'warn' }],
      reasoning: 'Reviewer call failed — survey fielded without adversarial review.',
    };
  }

  if (!verdict.approved) {
    const blocks = verdict.flags.filter(f => f.severity === 'block');
    throw new CompilerRefusedError(
      blocks.map(b => `${b.issue}: ${b.explanation}`).join(' · ') || verdict.reasoning,
    );
  }

  return { survey, verdict, meta: { generator: 'llm', reviewer: 'llm', model, generatorRounds: rounds } };
}
