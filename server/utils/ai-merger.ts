/**
 * Amendment merger — local LLM merge with deterministic fallback.
 *
 * Calls the configured local inference endpoint to intelligently merge
 * accepted (and community-flagged) amendments into the original proposal
 * text. The AI produces a single coherent solution that incorporates all
 * included amendments — not a concatenation of tagged blocks.
 *
 * If the LLM is unavailable, falls back to deterministic concatenation
 * (type-tagged blocks appended to the original solution).
 *
 * GDPR §4.2 compliance: proposal text never leaves the instance.
 * The LLM endpoint must be self-hosted / private.
 *
 * The merged text is written to `proposal.finalText`. The original
 * `question` / `solution` are never mutated — the UI can show a diff.
 */

import { db } from '../db';
import { proposalAmendments, proposals, communities } from '../../shared/schema';
import { DEFAULT_AMENDMENT_INCLUSION_THRESHOLD } from '../../shared/community-settings';
import { TEXT_MAX_CHARS, proposalKindOf, type ProposalKind } from '../../shared/proposal-kinds';
import {
  NEW_ARTICLE_REF, appendArticles, articleSectionsFor, nextArticleNumber, opensWithHeading, replaceSections,
  sectionText, type TextSection,
} from '../../shared/statute-articles';
import { eq } from 'drizzle-orm';
import { chatCompletion, isLlmConfigured, LlmUnavailableError } from './llm-client';

interface AiMergeOptions {
  /**
   * Popularity ratio (upvotes / (upvotes+downvotes)) above which a
   * non-accepted amendment is still pulled into the merge. 0..1.
   * Defaults to 1.0 — i.e. accepted-only — when not provided.
   */
  inclusionThreshold?: number;
}

export interface AiMergeResult {
  proposalId: number;
  originalQuestion: string;
  originalSolution: string;
  mergedSolution: string;
  includedAmendmentIds: number[];
  excludedAmendmentIds: number[];
  source: 'llm' | 'fallback';
  llmModel?: string;
}

function decisionOf(a: { authorDecision: string | null; status: string | null }):
  'accepted' | 'rejected' | 'pending' {
  if (a.authorDecision === 'accepted' || a.authorDecision === 'rejected') return a.authorDecision;
  if (a.status === 'accepted' || a.status === 'rejected') return a.status as any;
  return 'pending';
}

function popularityRatio(a: { rejectionUpvotes: number | null; rejectionDownvotes: number | null }): number {
  const up = a.rejectionUpvotes ?? 0;
  const down = a.rejectionDownvotes ?? 0;
  const total = up + down;
  return total > 0 ? up / total : 0;
}

/** How an amendment's type reads in a prompt or a fallback block. */
function typeLabel(type: string): string {
  return type === 'improvement' ? 'Βελτίωση' :
    type === 'addition' ? 'Προσθήκη' :
    type === 'removal' ? 'Αφαίρεση' :
    type === 'counter_proposal' ? 'Αντιπρόταση' : 'Τροπολογία';
}

function localConcat(question: string, solution: string, accepted: Array<{ id: number; type: string; text: string }>): string {
  if (accepted.length === 0) return solution;
  return [
    solution,
    ...accepted.map(a => `\n\n[${typeLabel(a.type)}] ${a.text}`),
  ].join('');
}

// Prompt-side input caps. These sit above the largest text a proposal may
// hold: the point is to bound a runaway input, not to trim real ones. A merged
// text is the original plus its amendments, so it gets room for both. Prompt
// tokens are billed separately from `max_tokens`, so a generous cap costs
// nothing.
const MAX_LIST_CHARS = 24_000;
const MAX_TEXT_CHARS = TEXT_MAX_CHARS + MAX_LIST_CHARS;

/**
 * Token budget and timeout for a call whose answer is a whole text. Greek
 * measures ~2.6 characters per token on the configured model; one token per
 * character leaves ample headroom, and the cap costs nothing unless used. A
 * flat 8k fits a decision but would clip a long statute, and a clipped
 * answer is thrown away. Long answers also take minutes rather than seconds.
 */
function rewriteBudget(chars: number): { maxTokens: number; timeoutMs: number } {
  return {
    maxTokens: Math.min(64_000, Math.max(8000, chars)),
    timeoutMs: Math.max(90_000, chars * 5),
  };
}

/**
 * Render a numbered amendment list for a prompt, dropping WHOLE amendments if
 * the list would exceed `maxChars` — never cutting mid-sentence. The previous
 * `slice(0, 4000)` cut proposal 30's 5633-char list mid-word, silently losing
 * three author-accepted amendments from the vote-ready text. Dropping is now
 * both boundary-aligned and logged.
 */
function renderAmendmentList(
  items: Array<{ id: number; label?: string; text: string }>,
  maxChars: number,
  context: string,
): string {
  const kept: string[] = [];
  const dropped: number[] = [];
  let used = 0;
  for (const item of items) {
    const entry = item.label
      ? `${kept.length + 1}. [${item.label}] ${item.text}`
      : `${kept.length + 1}. ${item.text}`;
    const cost = entry.length + (kept.length > 0 ? 2 : 0);
    if (used + cost > maxChars) {
      dropped.push(item.id);
      continue;
    }
    kept.push(entry);
    used += cost;
  }
  if (dropped.length > 0) {
    console.warn(
      `[ai-merger] ${context}: amendment list exceeds ${maxChars} chars — ` +
      `${dropped.length} amendment(s) omitted from the prompt: ${dropped.join(', ')}`,
    );
  }
  return kept.length > 0 ? kept.join('\n\n') : '(καμία)';
}

const MERGE_PROMPT = `Είσαι ειδικός στη σύνταξη πολιτικών κειμένων.
Έχεις μια αρχική πρόταση και μια λίστα αποδεκτών τροπολογιών.
Ενσωμάτωσε ΟΛΕΣ τις τροπολογίες στην αρχική πρόταση, παράγοντας ένα ενιαίο, συνεκτικό κείμενο.

ΚΑΝΟΝΕΣ:
1. ΔΙΑΤΗΡΕΣΕ το νόημα και τον τόνο της αρχικής πρότασης.
2. ΕΝΣΩΜΑΤΩΣΕ κάθε τροπολογία φυσικά στο κείμενο — ΜΗΝ τις προσθέσεις ως ξεχωριστά μπλοκ.
3. Αν μια τροπολογία είναι "Αφαίρεση", ΑΦΑΙΡΕΣΕ το αντίστοιχο τμήμα από την αρχική πρόταση.
4. Αν μια τροπολογία είναι "Αντιπρόταση", ΑΝΤΙΚΑΤΑΣΤΗΣΕ το αντίστοιχο τμήμα.
5. Αν μια τροπολογία είναι "Βελτίωση" ή "Προσθήκη", ΕΝΣΩΜΑΤΩΣΕ το νέο περιεχόμενο φυσικά.
6. Το τελικό κείμενο πρέπει να διαβάζεται ως ενιαίο έγγραφο, όχι ως παζλ.
7. Απάντησε ΜΟΝΟ το τελικό κείμενο, χωρίς σχόλια ή μεταδεδομένα.

ΑΡΧΙΚΗ ΠΡΟΤΑΣΗ:
---
{solution}
---

ΤΡΟΠΟΛΟΓΙΕΣ:
{amendments}

ΤΕΛΙΚΟ ΚΕΙΜΕΝΟ:`;

async function llmMerge(
  question: string,
  solution: string,
  amendments: Array<{ id: number; type: string; text: string }>,
): Promise<{ text: string; success: boolean }> {
  if (!isLlmConfigured()) {
    return { text: '', success: false };
  }

  const amendmentsText = renderAmendmentList(
    amendments.map(a => ({ id: a.id, label: typeLabel(a.type), text: a.text })),
    MAX_LIST_CHARS,
    'merge',
  );

  const prompt = MERGE_PROMPT
    .replace('{solution}', solution.slice(0, MAX_TEXT_CHARS))
    .replace('{amendments}', amendmentsText);

  try {
    const response = await chatCompletion({
      messages: [
        { role: 'system', content: 'Είσαι ειδικός στη σύνταξη και επεξεργασία πολιτικών κειμένων. Ενσωματώνεις τροπολογίες σε προτάσεις με φυσικό και συνεκτικό τρόπο.' },
        { role: 'user', content: prompt },
      ],
      // The merged text is the original plus every amendment, so the answer
      // needs room for both.
      ...rewriteBudget(Math.min(solution.length, MAX_TEXT_CHARS) + amendmentsText.length),
      temperature: 0.3,
      enableThinking: false,
    });

    if (response.trim().length > 0) {
      return { text: response.trim(), success: true };
    }
  } catch (err) {
    if (err instanceof LlmUnavailableError) {
      console.warn(`[ai-merger] LLM unavailable: ${err.message}`);
    } else {
      console.warn(`[ai-merger] Unexpected error: ${err}`);
    }
  }

  return { text: '', success: false };
}

// ─── Article by article (statutes) ──────────────────────────────────────────
//
// A statute laid out in articles is merged one article at a time: each
// amended article is rewritten on its own and spliced back into the text, so
// an article nobody amended reaches the ballot exactly as written, and the AI
// never reproduces a hundred-page text to change one line.

interface MergeItem {
  id: number;
  type: string;
  text: string;
  articleRef?: string | null;
}

const ARTICLE_MERGE_PROMPT = `Είσαι ειδικός στη νομοτεχνική σύνταξη καταστατικών.
Έχεις ΕΝΑ τμήμα ενός καταστατικού (ένα άρθρο ή την εισαγωγή του) και τις αποδεκτές τροπολογίες που αφορούν αυτό το τμήμα.
Ενσωμάτωσε ΟΛΕΣ τις τροπολογίες στο τμήμα.

ΚΑΝΟΝΕΣ:
1. Άλλαξε ΜΟΝΟ ό,τι ζητούν οι τροπολογίες. Κάθε άλλη πρόταση, λέξη και σημείο στίξης μένει ΑΚΡΙΒΩΣ όπως είναι.
2. Κράτησε την επικεφαλίδα του άρθρου (αριθμό και τίτλο) και την αρίθμηση των παραγράφων. Άλλαξε τον τίτλο μόνο αν το ζητά ρητά τροπολογία.
3. Αν μια τροπολογία είναι "Αφαίρεση", αφαίρεσε το αντίστοιχο σημείο. Αν καταργεί ολόκληρο το άρθρο, απάντησε μόνο την επικεφαλίδα και από κάτω «(Καταργείται)».
4. Αν μια τροπολογία είναι "Αντιπρόταση", αντικατάστησε το αντίστοιχο σημείο.
5. Απάντησε ΜΟΝΟ το πλήρες νέο κείμενο του τμήματος, με την επικεφαλίδα του, χωρίς σχόλια.

ΤΙΤΛΟΣ ΤΗΣ ΠΡΟΤΑΣΗΣ: {question}

ΤΜΗΜΑ:
---
{section}
---

ΤΡΟΠΟΛΟΓΙΕΣ ΣΤΟ ΤΜΗΜΑ:
{amendments}

ΝΕΟ ΚΕΙΜΕΝΟ ΤΟΥ ΤΜΗΜΑΤΟΣ:`;

const NEW_ARTICLES_PROMPT = `Είσαι ειδικός στη νομοτεχνική σύνταξη καταστατικών.
Οι παρακάτω αποδεκτές τροπολογίες προσθέτουν νέα άρθρα σε ένα καταστατικό. Γράψε τα νέα άρθρα, στο ύφος και τη μορφή των υπαρχόντων.

ΚΑΝΟΝΕΣ:
1. Αρίθμησε τα νέα άρθρα διαδοχικά ξεκινώντας από «Άρθρο {next}», με επικεφαλίδα όπως των υπαρχόντων άρθρων.
2. Μην προσθέσεις τίποτα που δεν ζητούν οι τροπολογίες. Τροπολογίες για το ίδιο θέμα πάνε στο ίδιο άρθρο.
3. Απάντησε ΜΟΝΟ τα νέα άρθρα, χωρίς σχόλια.

ΤΙΤΛΟΣ ΤΗΣ ΠΡΟΤΑΣΗΣ: {question}

ΟΙ ΕΠΙΚΕΦΑΛΙΔΕΣ ΤΩΝ ΥΠΑΡΧΟΝΤΩΝ ΑΡΘΡΩΝ:
{headings}

ΕΝΑ ΥΠΑΡΧΟΝ ΑΡΘΡΟ, ΓΙΑ ΤΗ ΜΟΡΦΗ:
---
{sample}
---

ΤΡΟΠΟΛΟΓΙΕΣ:
{amendments}

ΝΕΑ ΑΡΘΡΑ:`;

const ARTICLE_RESTYLE_PROMPT = `Είσαι ειδικός στη νομοτεχνική σύνταξη καταστατικών.
Παρακάτω είναι ένα ΑΡΘΡΟ του τελικού κειμένου ενός καταστατικού και μια ΑΝΤΙΠΡΟΤΑΣΗ για αυτό το άρθρο, που θα τεθεί σε ψηφοφορία ως εναλλακτική.
Γράψε το άρθρο όπως θα διαβάζεται αν υιοθετηθεί η αντιπρόταση.

ΚΑΝΟΝΕΣ:
1. ΔΙΑΤΗΡΕΣΕ ΑΠΑΡΕΓΚΛΙΤΑ την ουσία της αντιπρότασης — μην την αμβλύνεις και μην την πλησιάσεις στο τελικό κείμενο.
2. Κράτησε την επικεφαλίδα και τη μορφή του άρθρου. Ό,τι δεν αγγίζει η αντιπρόταση μένει αυτούσιο.
3. ΕΝΣΩΜΑΤΩΣΕ ΟΛΕΣ τις τροπολογίες της αντιπρότασης παρακάτω.
4. Απάντησε ΜΟΝΟ το πλήρες κείμενο του άρθρου, χωρίς σχόλια.

ΑΡΘΡΟ ΤΟΥ ΤΕΛΙΚΟΥ ΚΕΙΜΕΝΟΥ:
---
{section}
---

ΑΝΤΙΠΡΟΤΑΣΗ:
---
{counter}
---

ΤΡΟΠΟΛΟΓΙΕΣ ΤΗΣ ΑΝΤΙΠΡΟΤΑΣΗΣ:
{childAmendments}

ΤΟ ΑΡΘΡΟ ΜΕ ΤΗΝ ΑΝΤΙΠΡΟΤΑΣΗ:`;

/** One LLM call whose answer is a section of text, or null. */
async function rewriteSection(system: string, prompt: string, chars: number, context: string): Promise<string | null> {
  if (!isLlmConfigured()) return null;
  try {
    const response = await chatCompletion({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      ...rewriteBudget(chars),
      temperature: 0.2,
      enableThinking: false,
    });
    const text = response.trim();
    // A section many times longer than what went in is the model rewriting
    // far more than it was given — never splice that into a statute.
    if (!text || text.length > 4 * chars + 2000) return null;
    return text;
  } catch (err) {
    console.warn(`[ai-merger] ${context} failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

/** The model sometimes drops the heading it was told to keep; put it back. */
function keepHeading(section: TextSection, rewritten: string): string {
  if (!section.heading || opensWithHeading(rewritten)) return rewritten;
  return `${section.heading}\n${rewritten}`;
}

const SECTION_SYSTEM = 'Είσαι ειδικός στη νομοτεχνική σύνταξη καταστατικών. Αλλάζεις μόνο ό,τι σου ζητείται και αφήνεις κάθε άλλη λέξη ακριβώς όπως είναι.';

async function mergeSection(question: string, text: string, section: TextSection, items: MergeItem[]): Promise<{ text: string; llm: boolean }> {
  const original = sectionText(text, section);
  const list = renderAmendmentList(
    items.map(a => ({ id: a.id, label: typeLabel(a.type), text: a.text })),
    MAX_LIST_CHARS,
    `article ${section.ref}`,
  );
  const prompt = ARTICLE_MERGE_PROMPT
    .replace('{question}', question)
    .replace('{section}', original)
    .replace('{amendments}', list);
  const merged = await rewriteSection(SECTION_SYSTEM, prompt, original.length + list.length, `article ${section.ref} merge`);
  if (merged) return { text: keepHeading(section, merged), llm: true };
  // Deterministic fallback, kept inside the article it belongs to.
  return { text: localConcat(question, original, items), llm: false };
}

async function draftNewArticles(question: string, text: string, sections: TextSection[], items: MergeItem[]): Promise<{ text: string; llm: boolean }> {
  const next = nextArticleNumber(sections);
  const articles = sections.filter(s => s.heading);
  const list = renderAmendmentList(
    items.map(a => ({ id: a.id, label: typeLabel(a.type), text: a.text })),
    MAX_LIST_CHARS,
    'new articles',
  );
  const prompt = NEW_ARTICLES_PROMPT
    .replace('{next}', String(next))
    .replace('{question}', question)
    .replace('{headings}', articles.map(s => s.heading).join('\n'))
    .replace('{sample}', articles.length > 0 ? sectionText(text, articles[articles.length - 1]) : '')
    .replace('{amendments}', list);
  const drafted = await rewriteSection(SECTION_SYSTEM, prompt, list.length, 'new articles');
  if (drafted) return { text: drafted, llm: true };
  return {
    text: items.map((a, i) => `Άρθρο ${next + i}\n[${typeLabel(a.type)}] ${a.text}`).join('\n\n'),
    llm: false,
  };
}

/** Run `fn` over `items`, at most `limit` at a time, keeping their order. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Merge amendments into a proposal's text. A statute laid out in articles is
 * merged article by article (see above); any other text — and amendments
 * that name no article, filed before articles were asked for — go through
 * the whole-text merge. `llm` is false when any part fell back to the
 * deterministic concatenation.
 */
export async function mergeIntoText(
  kind: ProposalKind,
  question: string,
  solution: string,
  items: MergeItem[],
): Promise<{ text: string; llm: boolean }> {
  const wholeText = async (base: string, list: MergeItem[]) => {
    const r = await llmMerge(question, base, list);
    return r.success ? { text: r.text, llm: true } : { text: localConcat(question, base, list), llm: false };
  };
  const sections = articleSectionsFor(kind, solution);
  if (!sections) return wholeText(solution, items);

  const byRef = new Map<string, MergeItem[]>();
  const loose: MergeItem[] = [];
  for (const item of items) {
    const ref = item.articleRef;
    if (ref && (ref === NEW_ARTICLE_REF || sections.some(s => s.ref === ref))) {
      if (!byRef.has(ref)) byRef.set(ref, []);
      byRef.get(ref)!.push(item);
    } else {
      loose.push(item);
    }
  }

  let llm = true;
  const amended = sections.filter(s => byRef.has(s.ref));
  // A few at a time: parallel enough to be quick, gentle on the endpoint.
  const results = await mapLimit(amended, 3, s => mergeSection(question, solution, s, byRef.get(s.ref)!));
  const replacements = new Map<string, string>();
  amended.forEach((s, i) => {
    replacements.set(s.ref, results[i].text);
    llm &&= results[i].llm;
  });
  let text = replaceSections(solution, sections, replacements);

  const added = byRef.get(NEW_ARTICLE_REF);
  if (added) {
    const drafted = await draftNewArticles(question, solution, sections, added);
    text = appendArticles(text, drafted.text);
    llm &&= drafted.llm;
  }
  if (loose.length > 0) {
    const whole = await wholeText(text, loose);
    text = whole.text;
    llm &&= whole.llm;
  }
  return { text, llm };
}

/**
 * A counter-proposal on one article, as a complete alternative: the final
 * text with that article as the counter would have it. null when the counter
 * names no article of the final text (the whole-text restyle then applies).
 */
async function articleAlternative(
  kind: ProposalKind,
  finalText: string,
  counter: { text: string; articleRef?: string | null },
  childTexts: string[],
): Promise<string | null> {
  const ref = counter.articleRef;
  if (!ref) return null;
  const sections = articleSectionsFor(kind, finalText);
  if (!sections) return null;
  if (ref === NEW_ARTICLE_REF) {
    const items = [counter.text, ...childTexts].map((t, i) => ({ id: i + 1, type: 'addition', text: t }));
    const drafted = await draftNewArticles('', finalText, sections, items);
    return appendArticles(finalText, drafted.text);
  }
  const section = sections.find(s => s.ref === ref);
  if (!section) return null;
  const original = sectionText(finalText, section);
  const children = renderAmendmentList(
    childTexts.map((t, i) => ({ id: i + 1, text: t })),
    MAX_LIST_CHARS,
    `counter on article ${ref}`,
  );
  const prompt = ARTICLE_RESTYLE_PROMPT
    .replace('{section}', original)
    .replace('{counter}', counter.text.slice(0, MAX_TEXT_CHARS))
    .replace('{childAmendments}', children);
  const restyled = await rewriteSection(
    'Είσαι ειδικός στη νομοτεχνική σύνταξη καταστατικών. Γράφεις αντιπροτάσεις ώστε να συγκρίνονται δίκαια, χωρίς ποτέ να αλλοιώνεις την ουσία τους.',
    prompt,
    original.length + counter.text.length + children.length,
    `counter restyle on article ${ref}`,
  );
  const article = restyled ? keepHeading(section, restyled) : keepHeading(section, counter.text);
  return replaceSections(finalText, sections, new Map([[ref, article]]));
}

export async function aiMergeAmendments(
  proposalId: number,
  options: AiMergeOptions = {},
): Promise<AiMergeResult> {
  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, proposalId));
  if (!proposal) throw new Error(`Proposal ${proposalId} not found`);

  const amendments = await db
    .select()
    .from(proposalAmendments)
    .where(eq(proposalAmendments.proposalId, proposalId));

  // Pull threshold default from community config if not explicitly passed.
  let threshold = options.inclusionThreshold;
  if (threshold === undefined) {
    const [community] = await db
      .select({ t: communities.amendmentInclusionThreshold })
      .from(communities)
      .where(eq(communities.id, proposal.communityId));
    threshold = community?.t != null ? Number(community.t) : DEFAULT_AMENDMENT_INCLUSION_THRESHOLD;
  }

  const included: Array<MergeItem & { reason: string }> = [];
  const excluded: number[] = [];
  // Children of counter-proposals belong to their parent's restyle, not here.
  const mergeable = amendments.filter(a => (a as any).parentAmendmentId == null);
  for (const a of mergeable) {
    const decision = decisionOf(a);
    const ratio = popularityRatio(a);
    const item = { id: a.id, type: a.type, text: a.text, articleRef: a.articleRef };
    if (decision === 'accepted') {
      included.push({ ...item, reason: 'author-accepted' });
    } else if (decision !== 'rejected' && threshold < 1 && ratio >= threshold) {
      included.push({ ...item, reason: `popularity ${(ratio * 100).toFixed(0)}%` });
    } else if (decision === 'rejected' && ratio >= Math.max(threshold, 0.7)) {
      included.push({ ...item, reason: `community-override ${(ratio * 100).toFixed(0)}%` });
    } else {
      excluded.push(a.id);
    }
  }

  const base: AiMergeResult = {
    proposalId,
    originalQuestion: proposal.question,
    originalSolution: proposal.solution,
    mergedSolution: proposal.solution,
    includedAmendmentIds: included.map(a => a.id),
    excludedAmendmentIds: excluded,
    source: 'fallback',
  };

  if (included.length === 0) {
    return base; // nothing to merge — return original verbatim
  }

  // LLM merge (article by article for a statute), falling back to
  // deterministic concatenation wherever the LLM cannot help.
  const merged = await mergeIntoText(proposalKindOf(proposal.kind), proposal.question, proposal.solution, included);
  base.mergedSolution = merged.text;
  if (merged.llm) {
    base.source = 'llm';
    const cfg = (await import('./llm-client')).readLlmConfig();
    base.llmModel = cfg?.model;
  }

  return base;
}

/**
 * Compute the AI merge and persist it to `proposal.finalText`. Returns the
 * full result so callers can show a diff.
 */
export async function saveAiMergedFinalText(
  proposalId: number,
  options: AiMergeOptions = {},
): Promise<AiMergeResult> {
  const result = await aiMergeAmendments(proposalId, options);
  await db.update(proposals)
    .set({ finalText: result.mergedSolution, updatedAt: new Date() })
    .where(eq(proposals.id, proposalId));
  return result;
}

// ─── Final review (short deliberation track) ────────────────────────────────
//
// Unlike the legacy merge above, the final-review pipeline treats
// counter-proposals (αντιπροτάσεις) as COMPETING ALTERNATIVES, not inline
// replacements: they are excluded from the merged text, restyled by the AI
// to match the final proposal's form, and stand on the ballot next to it.

/** Which amendments qualify for what, under the community's thresholds. */
function partitionAmendments(
  amendments: Array<typeof proposalAmendments.$inferSelect>,
  threshold: number,
) {
  const qualifies = (a: typeof proposalAmendments.$inferSelect): boolean => {
    const decision = decisionOf(a);
    const ratio = popularityRatio(a);
    if (decision === 'accepted') return true;
    if (decision !== 'rejected' && threshold < 1 && ratio >= threshold) return true;
    // Community override: enough members disagreed with the author's
    // rejection that the amendment earns its place anyway.
    if (decision === 'rejected' && ratio >= Math.max(threshold, 0.7)) return true;
    return false;
  };
  const real = amendments.filter(a => a.type !== 'sortition_revision');
  // Children (amendments ON a counter-proposal) never touch the main text:
  // qualifying ones are folded into their parent counter when it is restyled
  // for the ballot. Same qualification rules, judged by the counter's author.
  const topLevel = real.filter(a => (a as any).parentAmendmentId == null);
  const children = real.filter(a => (a as any).parentAmendmentId != null);
  const counterChildren = new Map<number, Array<typeof proposalAmendments.$inferSelect>>();
  for (const child of children) {
    if (!qualifies(child)) continue;
    const parentId = (child as any).parentAmendmentId as number;
    if (!counterChildren.has(parentId)) counterChildren.set(parentId, []);
    counterChildren.get(parentId)!.push(child);
  }
  return {
    mergeIncluded: topLevel.filter(a => a.type !== 'counter_proposal' && qualifies(a)),
    counterAlternatives: topLevel.filter(a => a.type === 'counter_proposal' && qualifies(a)),
    counterChildren,
    excluded: real.filter(a => !qualifies(a)).map(a => a.id),
  };
}

const RESTYLE_PROMPT = `Είσαι ειδικός στη σύνταξη πολιτικών κειμένων.
Παρακάτω είναι το ΤΕΛΙΚΟ ΚΕΙΜΕΝΟ μιας πρότασης και μια ΑΝΤΙΠΡΟΤΑΣΗ που θα τεθεί σε ψηφοφορία ως εναλλακτική.
Ξαναγράψε την αντιπρόταση ώστε να έχει την ίδια δομή, μορφή και πληρότητα με το τελικό κείμενο, ως αυτόνομη ολοκληρωμένη πρόταση.

ΚΑΝΟΝΕΣ:
1. ΔΙΑΤΗΡΕΣΕ ΑΠΑΡΕΓΚΛΙΤΑ την ουσία, τις θέσεις και το κεντρικό μήνυμα της αντιπρότασης — ΔΕΝ επιτρέπεται να τα αμβλύνεις, να τα αλλοιώσεις ή να τα πλησιάσεις προς το τελικό κείμενο.
2. Άλλαξε ΜΟΝΟ ύφος, δομή και μορφοποίηση ώστε να συγκρίνεται δίκαια με το τελικό κείμενο.
3. Αν η αντιπρόταση καλύπτει μέρος μόνο του θέματος, συμπλήρωσε ΟΥΔΕΤΕΡΑ τα υπόλοιπα σημεία από το τελικό κείμενο, ώστε να είναι πλήρης εναλλακτική.
4. ΕΝΣΩΜΑΤΩΣΕ φυσικά στην εναλλακτική ΟΛΕΣ τις ΤΡΟΠΟΛΟΓΙΕΣ ΤΗΣ ΑΝΤΙΠΡΟΤΑΣΗΣ παρακάτω — έχουν γίνει δεκτές από τη διαβούλευση και είναι εξίσου απαραβίαστες με την ίδια την αντιπρόταση.
5. Απάντησε ΜΟΝΟ το κείμενο της εναλλακτικής, χωρίς σχόλια.

ΤΕΛΙΚΟ ΚΕΙΜΕΝΟ:
---
{finalText}
---

ΑΝΤΙΠΡΟΤΑΣΗ:
---
{counter}
---

ΤΡΟΠΟΛΟΓΙΕΣ ΤΗΣ ΑΝΤΙΠΡΟΤΑΣΗΣ:
{childAmendments}

ΕΝΑΛΛΑΚΤΙΚΗ ΠΡΟΤΑΣΗ:`;

async function restyleCounter(finalText: string, counterText: string, childAmendments: string[] = []): Promise<string | null> {
  if (!isLlmConfigured()) return null;
  const childText = renderAmendmentList(
    childAmendments.map((t, i) => ({ id: i + 1, text: t })),
    MAX_LIST_CHARS,
    'counter restyle',
  );
  try {
    const response = await chatCompletion({
      messages: [
        { role: 'system', content: 'Είσαι ειδικός στη σύνταξη πολιτικών κειμένων. Ξαναγράφεις αντιπροτάσεις ώστε να συγκρίνονται δίκαια, χωρίς ποτέ να αλλοιώνεις την ουσία τους.' },
        { role: 'user', content: RESTYLE_PROMPT.replace('{finalText}', finalText.slice(0, MAX_TEXT_CHARS)).replace('{counter}', counterText.slice(0, MAX_TEXT_CHARS)).replace('{childAmendments}', childText) },
      ],
      // The answer is the counter-proposal rewritten with its own amendments.
      ...rewriteBudget(Math.min(counterText.length, MAX_TEXT_CHARS) + childText.length),
      temperature: 0.3,
      enableThinking: false,
    });
    return response.trim().length > 0 ? response.trim() : null;
  } catch (err) {
    console.warn(`[ai-merger] counter restyle failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

export interface FinalReviewResult {
  proposalId: number;
  finalText: string;
  source: 'llm' | 'fallback';
  includedAmendmentIds: number[];
  counterAlternativeIds: number[];
  excludedAmendmentIds: number[];
}

/**
 * Entering final_review: merge accepted/promoted improvements into
 * proposal.finalText and restyle qualifying counter-proposals into
 * amendment.restyledText (falling back to their original text).
 */
export async function prepareFinalReview(proposalId: number): Promise<FinalReviewResult> {
  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, proposalId));
  if (!proposal) throw new Error(`Proposal ${proposalId} not found`);

  const [community] = await db
    .select({ t: communities.amendmentInclusionThreshold })
    .from(communities)
    .where(eq(communities.id, proposal.communityId));
  const threshold = community?.t != null ? Number(community.t) : DEFAULT_AMENDMENT_INCLUSION_THRESHOLD;

  const amendments = await db
    .select()
    .from(proposalAmendments)
    .where(eq(proposalAmendments.proposalId, proposalId));
  const { mergeIncluded, counterAlternatives, counterChildren, excluded } = partitionAmendments(amendments, threshold);

  // Merge improvements/additions/removals into the vote-ready text.
  let finalText = proposal.solution;
  let source: 'llm' | 'fallback' = 'fallback';
  const kind = proposalKindOf(proposal.kind);
  if (mergeIncluded.length > 0) {
    const merged = await mergeIntoText(
      kind,
      proposal.question,
      proposal.solution,
      mergeIncluded.map(a => ({ id: a.id, type: a.type, text: a.text, articleRef: a.articleRef })),
    );
    finalText = merged.text;
    if (merged.llm) source = 'llm';
  }
  // Re-apply the author's standing refine instruction on every recompute,
  // so live re-merges never silently discard it. The refine prompt treats
  // the incorporated amendments as inviolable.
  if ((proposal as any).authorRefineInstruction && isLlmConfigured()) {
    try {
      const refined = await runRefine(
        finalText,
        (proposal as any).authorRefineInstruction,
        mergeIncluded.map(a => a.text),
      );
      if (refined) finalText = refined;
    } catch (refineErr) {
      console.warn(`[ai-merger] standing refine failed: ${refineErr instanceof Error ? refineErr.message : refineErr}`);
    }
  }
  await db.update(proposals)
    .set({ finalText, updatedAt: new Date() })
    .where(eq(proposals.id, proposalId));

  // Restyle each qualifying counter-proposal into a standalone alternative,
  // folding in the amendments the deliberation accepted on that counter.
  // A counter on one article of a statute changes only that article.
  for (const counter of counterAlternatives) {
    const childTexts = (counterChildren.get(counter.id) ?? []).map(c => c.text);
    const restyled = await articleAlternative(kind, finalText, counter, childTexts)
      ?? await restyleCounter(finalText, counter.text, childTexts);
    await db.update(proposalAmendments)
      .set({ restyledText: restyled ?? counter.text })
      .where(eq(proposalAmendments.id, counter.id));
  }

  return {
    proposalId,
    finalText,
    source,
    includedAmendmentIds: mergeIncluded.map(a => a.id),
    counterAlternativeIds: counterAlternatives.map(a => a.id),
    excludedAmendmentIds: excluded,
  };
}

const REFINE_PROMPT = `Είσαι ειδικός στη σύνταξη πολιτικών κειμένων.
Ο συγγραφέας μιας πρότασης ζητά μια μικρή τροποποίηση στο ΤΕΛΙΚΟ ΚΕΙΜΕΝΟ πριν την ψηφοφορία.
Το τελικό κείμενο έχει προκύψει από ενσωμάτωση τροπολογιών της κοινότητας — αυτές είναι ΑΠΑΡΑΒΙΑΣΤΕΣ.

ΚΑΝΟΝΕΣ:
1. Εφάρμοσε την οδηγία του συγγραφέα ΜΟΝΟ εφόσον δεν αποδυναμώνει, δεν αλλοιώνει και δεν αφαιρεί την ουσία καμίας από τις ΕΝΣΩΜΑΤΩΜΕΝΕΣ ΤΡΟΠΟΛΟΓΙΕΣ παρακάτω.
2. Αν η οδηγία συγκρούεται με τροπολογία, αγνόησε το συγκρουόμενο μέρος της οδηγίας και εφάρμοσε μόνο ό,τι δεν συγκρούεται.
3. Κράτησε τις αλλαγές στο ελάχιστο αναγκαίο για την οδηγία.
4. Απάντησε ΜΟΝΟ το νέο τελικό κείμενο, χωρίς σχόλια.

ΕΝΣΩΜΑΤΩΜΕΝΕΣ ΤΡΟΠΟΛΟΓΙΕΣ (απαραβίαστες):
{amendments}

ΤΕΛΙΚΟ ΚΕΙΜΕΝΟ:
---
{finalText}
---

ΟΔΗΓΙΑ ΣΥΓΓΡΑΦΕΑ:
{instruction}

ΝΕΟ ΤΕΛΙΚΟ ΚΕΙΜΕΝΟ:`;

/** The raw guarded-refine LLM call. Returns null on empty output. */
async function runRefine(finalText: string, instruction: string, inviolable: string[]): Promise<string | null> {
  const amendmentsText = renderAmendmentList(
    inviolable.map((t, i) => ({ id: i + 1, text: t })),
    MAX_LIST_CHARS,
    'refine',
  );
  const response = await chatCompletion({
    messages: [
      { role: 'system', content: 'Είσαι ειδικός στη σύνταξη πολιτικών κειμένων. Εφαρμόζεις οδηγίες συγγραφέων χωρίς ποτέ να αποδυναμώνεις τις ενσωματωμένες τροπολογίες της κοινότητας.' },
      {
        role: 'user',
        content: REFINE_PROMPT
          .replace('{amendments}', amendmentsText)
          .replace('{finalText}', finalText.slice(0, MAX_TEXT_CHARS))
          .replace('{instruction}', instruction.slice(0, 500)),
      },
    ],
    ...rewriteBudget(Math.min(finalText.length, MAX_TEXT_CHARS)),
    temperature: 0.2,
    enableThinking: false,
  });
  const refined = response.trim();
  return refined.length > 0 ? refined : null;
}

/**
 * Author-requested refinement of the final text. The author can ONLY modify
 * the text through this constrained AI edit — the incorporated amendments'
 * substance is passed as inviolable context so the instruction cannot
 * dilute what the community added. The instruction is also persisted as the
 * standing instruction, re-applied on every live re-merge during
 * deliberation. Throws LlmUnavailableError when no LLM is configured.
 */
export async function refineFinalText(proposalId: number, instruction: string): Promise<string> {
  if (!isLlmConfigured()) {
    throw new LlmUnavailableError('LLM required for guarded final-text refinement');
  }
  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, proposalId));
  if (!proposal || !proposal.finalText) throw new Error('No final text to refine');

  const [community] = await db
    .select({ t: communities.amendmentInclusionThreshold })
    .from(communities)
    .where(eq(communities.id, proposal.communityId));
  const threshold = community?.t != null ? Number(community.t) : DEFAULT_AMENDMENT_INCLUSION_THRESHOLD;
  const amendments = await db
    .select()
    .from(proposalAmendments)
    .where(eq(proposalAmendments.proposalId, proposalId));
  const { mergeIncluded } = partitionAmendments(amendments, threshold);

  const refined = await runRefine(proposal.finalText, instruction, mergeIncluded.map(a => a.text));
  if (!refined) throw new Error('Refinement produced empty text');

  await db.update(proposals)
    .set({ finalText: refined, authorRefineInstruction: instruction.slice(0, 500), updatedAt: new Date() })
    .where(eq(proposals.id, proposalId));
  return refined;
}

/**
 * Freeze the option ballot when final_review hands over to voting.
 * Options: the merged final text, each restyled counter-proposal, and the
 * status quo. With no qualifying counter-proposals the ballot stays null —
 * the classic yes/no/abstain vote — so nothing degrades for simple cases.
 */
export async function buildBallotOptions(proposalId: number): Promise<Array<{ id: string; label: string }> | null> {
  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, proposalId));
  if (!proposal) throw new Error(`Proposal ${proposalId} not found`);

  const [community] = await db
    .select({ t: communities.amendmentInclusionThreshold })
    .from(communities)
    .where(eq(communities.id, proposal.communityId));
  const threshold = community?.t != null ? Number(community.t) : DEFAULT_AMENDMENT_INCLUSION_THRESHOLD;
  const amendments = await db
    .select()
    .from(proposalAmendments)
    .where(eq(proposalAmendments.proposalId, proposalId));
  // Only counters that were restyled when final_review opened stand on the
  // ballot — qualification is frozen at merge time so late rejection-votes
  // can't add an option nobody saw during the review.
  const { counterAlternatives: qualified } = partitionAmendments(amendments, threshold);
  const counterAlternatives = qualified.filter(a => a.restyledText != null);

  if (counterAlternatives.length === 0) {
    return null; // classic yes/no/abstain ballot
  }

  const options = [
    { id: 'final', label: 'Η τελική πρόταση' },
    ...counterAlternatives.map((a, i) => ({
      id: `counter_${a.id}`,
      label: counterAlternatives.length === 1 ? 'Η αντιπρόταση' : `Αντιπρόταση ${i + 1}`,
    })),
    { id: 'status_quo', label: 'Καμία αλλαγή' },
  ];
  await db.update(proposals)
    .set({ ballotOptions: options, updatedAt: new Date() })
    .where(eq(proposals.id, proposalId));
  return options;
}
