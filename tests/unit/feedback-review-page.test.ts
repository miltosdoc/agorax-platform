/**
 * Η σελίδα ανατροφοδότησης παράγεται πλέον από cron, μία φορά την ημέρα, χωρίς
 * να την κοιτάζει κανείς. Όλη η σελίδα χτίζεται από ένα inline script: ένα
 * σφάλμα εκτέλεσης δεν ρίχνει τίποτα — αφήνει λευκή σελίδα, και θα την άφηνε
 * λευκή κάθε μέρα μέχρι να το προσέξει κάποιος.
 *
 * Εδώ το script τρέχει πάνω σε ένα ελάχιστο DOM και ελέγχεται ότι τα φίλτρα,
 * η ταξινόμηση και η χρονική περίοδος βγάζουν αποτέλεσμα.
 *
 * Ο φάκελος feedback/ είναι εκτός git (πραγματικά λόγια χρηστών, μένουν στον
 * διακομιστή), οπότε όπου δεν υπάρχει αναφορά το τεστ παρακάμπτεται.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REVIEW = path.resolve(__dirname, '../../feedback/review.html');
const generated = fs.existsSync(REVIEW);

interface StubNode {
  innerHTML: string;
  textContent: string;
  value: string;
  min: string;
  max: string;
  dataset: Record<string, string>;
  addEventListener(): void;
  setAttribute(): void;
  closest(): null;
}

/** Τρέχει το inline script και επιστρέφει τους κόμβους που άγγιξε. */
function runPage(probe = ''): Record<string, StubNode> {
  const html = fs.readFileSync(REVIEW, 'utf8');
  const open = html.lastIndexOf('<script>');
  const close = html.lastIndexOf(`</${'script'}>`);
  expect(open).toBeGreaterThan(-1);
  expect(close).toBeGreaterThan(open);

  const nodes: Record<string, StubNode> = {};
  const make = (): StubNode => ({
    innerHTML: '', textContent: '', value: '', min: '', max: '',
    dataset: {}, addEventListener() {}, setAttribute() {}, closest: () => null,
  });
  const document = {
    getElementById: (id: string) => (nodes[id] ??= make()),
    querySelectorAll: () => [] as unknown[],
  };
  // eslint-disable-next-line no-new-func
  new Function('document', html.slice(open + 8, close) + probe)(document);
  return nodes;
}

describe.skipIf(!generated)('feedback review page', () => {
  it('renders topics, controls and the weekly activity strip', () => {
    const n = runPage();
    expect(n.list.innerHTML).toContain('class="card"');
    expect(n.stats.innerHTML).toContain('class="stat"');
    expect(n.weeks.innerHTML).toContain('class="wk');
    expect(n.sort.innerHTML).toContain('<option');
    expect(n.theme.innerHTML).toContain('<option');
    expect(n.reporter.innerHTML).toContain('<option');
    expect(n.presets.innerHTML).toContain('class="pill"');
    expect(n.count.textContent).not.toBe('κανένα αποτέλεσμα');
    expect(n.periodNote.textContent).toContain('Όλη η περίοδος');
    expect(n.generated.textContent).toContain('Τελευταία παραγωγή');
  });

  it('filters by date at entry level and never widens the result', () => {
    // Η τελευταία καταχώρηση συνολικά μπορεί να είναι αδιαλογάριαστη, οπότε η
    // μέρα-δείγμα βγαίνει από τα ίδια τα θέματα, όχι από το D.meta.last.
    const n = runPage(`
      const day = D.topics.flatMap(t => t.entries.map(e => e.date)).sort().pop();
      fFrom = day; fTo = day; sync(); render();
      document.getElementById('probe').textContent = JSON.stringify({
        day,
        note: document.getElementById('periodNote').textContent,
        shown: visibleTopics().reduce((s, t) => s + t.es.length, 0),
        offDay: visibleTopics().flatMap(t => t.es).filter(e => e.date !== day).length,
        all: D.topics.reduce((s, t) => s + t.entries.length, 0),
      });
    `);
    const r = JSON.parse(n.probe.textContent);
    expect(r.note).toContain('Περίοδος');
    expect(r.shown).toBeGreaterThan(0);
    expect(r.shown).toBeLessThan(r.all);
    // Το φίλτρο κόβει καταχωρήσεις, όχι μόνο θέματα: ούτε μία εκτός ημέρας.
    expect(r.offDay).toBe(0);
  });

  it('returns nothing for a period with no submissions', () => {
    const n = runPage(`fFrom = '1999-01-01'; fTo = '1999-01-02'; render();`);
    expect(n.count.textContent).toBe('κανένα αποτέλεσμα');
    expect(n.list.innerHTML).toContain('Κανένα θέμα δεν ταιριάζει');
  });

  it('orders by date in both directions', () => {
    const n = runPage(`
      const dates = s => { fSort = s; return visibleTopics().sort(sortFn()).map(t => t.last); };
      document.getElementById('probe').textContent = JSON.stringify({
        recent: dates('recent'), oldest: dates('oldest').slice(),
        first: (fSort = 'oldest', visibleTopics().sort(sortFn()).map(t => t.first)),
      });
    `);
    const r = JSON.parse(n.probe.textContent);
    expect(r.recent).toEqual([...r.recent].sort().reverse());
    expect(r.first).toEqual([...r.first].sort());
  });

  it('surfaces untriaged submissions, which only REVIEW.md used to show', () => {
    const n = runPage(`
      document.getElementById('probe').textContent = JSON.stringify({
        n: D.untriaged.length, meta: D.meta.untriaged,
        shown: document.getElementById('list').innerHTML.includes('Αδιαλογάριαστα'),
      });
    `);
    const r = JSON.parse(n.probe.textContent);
    expect(r.n).toBe(r.meta);
    if (r.n > 0) expect(r.shown).toBe(true);
  });

  it('never puts a reporter email on the page', () => {
    const html = fs.readFileSync(REVIEW, 'utf8');
    // Το REVIEW.md ταυτοποιεί όποιον δεν έχει λογαριασμό από το email του· η
    // σελίδα σερβίρεται και δεν επιτρέπεται να το κάνει.
    expect(html).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]{2,}/);
  });
});
