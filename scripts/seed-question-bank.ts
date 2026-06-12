/**
 * Seed the question bank + piggyback module pool (v1).
 *
 * Idempotent: bank rows key on (code, version) and are never edited —
 * a wording change is a NEW version (see question_bank semantics).
 *
 * Run: npx tsx scripts/seed-question-bank.ts
 */
import 'dotenv/config';
import { and, eq } from 'drizzle-orm';
import { db } from '../server/db';
import { questionBank, moduleItems } from '../shared/schema';
import { BENCHMARK_POPULATION_VALUES } from '../server/stats/population-margins';

const DK = 'Δεν ξέρω / Δεν απαντώ';

const BANK: Array<{
  code: string;
  text: string;
  itemType: string;
  options: string[];
  category: 'tracker' | 'benchmark';
  benchmarkKey?: string;
}> = [
  // ── Trackers — canonical wording, character-identical across waves ──
  {
    code: 'govt_direction',
    text: 'Σε γενικές γραμμές, θα λέγατε ότι τα πράγματα στην Ελλάδα κινούνται σε σωστή ή σε λάθος κατεύθυνση;',
    itemType: 'likert',
    options: ['Σωστή κατεύθυνση', 'Μάλλον σωστή κατεύθυνση', 'Ούτε σωστή ούτε λάθος', 'Μάλλον λάθος κατεύθυνση', 'Λάθος κατεύθυνση', DK],
    category: 'tracker',
  },
  {
    code: 'econ_household',
    text: 'Πώς αξιολογείτε τη σημερινή οικονομική κατάσταση του νοικοκυριού σας;',
    itemType: 'likert',
    options: ['Πολύ καλή', 'Μάλλον καλή', 'Μέτρια', 'Μάλλον κακή', 'Πολύ κακή', DK],
    category: 'tracker',
  },
  {
    code: 'democracy_satisfaction',
    text: 'Πόσο ικανοποιημένος/η είστε από τον τρόπο που λειτουργεί η δημοκρατία στην Ελλάδα;',
    itemType: 'likert',
    options: ['Πολύ ικανοποιημένος/η', 'Αρκετά ικανοποιημένος/η', 'Λίγο ικανοποιημένος/η', 'Καθόλου ικανοποιημένος/η', DK],
    category: 'tracker',
  },
  {
    code: 'trust_parliament',
    text: 'Πόση εμπιστοσύνη έχετε στο Κοινοβούλιο;',
    itemType: 'likert',
    options: ['Πολλή', 'Αρκετή', 'Λίγη', 'Καθόλου', DK],
    category: 'tracker',
  },
  // ── Calibration benchmarks — known ELSTAT population values ──
  {
    code: 'bench_smoker',
    text: 'Καπνίζετε, έστω και περιστασιακά;',
    itemType: 'single_choice',
    options: ['Ναι', 'Όχι', DK],
    category: 'benchmark',
    benchmarkKey: 'smoker',
  },
  {
    code: 'bench_household_car',
    text: 'Διαθέτει το νοικοκυριό σας Ι.Χ. αυτοκίνητο;',
    itemType: 'single_choice',
    options: ['Ναι', 'Όχι', DK],
    category: 'benchmark',
    benchmarkKey: 'household_car',
  },
];

const POOL_VERSION = 1;

async function main() {
  const bankIds: number[] = [];
  for (const item of BANK) {
    const [existing] = await db.select().from(questionBank)
      .where(and(eq(questionBank.code, item.code), eq(questionBank.version, 1)))
      .limit(1);
    if (existing) {
      bankIds.push(existing.id);
      console.log(`= ${item.code} v1 already present (#${existing.id})`);
      continue;
    }
    const [row] = await db.insert(questionBank).values({
      code: item.code,
      version: 1,
      text: item.text,
      itemType: item.itemType,
      options: item.options,
      randomizeOptions: false, // trackers/benchmarks are ordinal — fixed order
      category: item.category,
      benchmarkKey: item.benchmarkKey ?? null,
      populationValue: item.benchmarkKey ? BENCHMARK_POPULATION_VALUES[item.benchmarkKey] ?? null : null,
    }).returning();
    bankIds.push(row.id);
    console.log(`+ ${item.code} v1 → #${row.id}`);
  }

  // Module pool v1: all six items, fixed internal order = bank order above.
  for (let i = 0; i < bankIds.length; i++) {
    const [existing] = await db.select().from(moduleItems)
      .where(and(
        eq(moduleItems.questionBankId, bankIds[i]),
        eq(moduleItems.poolVersion, POOL_VERSION),
      ))
      .limit(1);
    if (existing) {
      console.log(`= module pool v${POOL_VERSION} pos ${i} already present`);
      continue;
    }
    await db.insert(moduleItems).values({
      questionBankId: bankIds[i],
      poolVersion: POOL_VERSION,
      position: i,
    });
    console.log(`+ module pool v${POOL_VERSION} pos ${i} → bank #${bankIds[i]}`);
  }

  console.log('Question bank + module pool seeded.');
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
