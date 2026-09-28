/**
 * The ballot box, live in the browser. Eight anonymous ballots are sealed
 * with exactly the server's recipe (server/utils/vote-chain.ts):
 *
 *   SHA-256( prevHash | proposalId | "anonymous" | token | choice | "1" | castAt to the minute )
 *
 * and the visitor can try to cheat. Changing a ballot breaks its seal;
 * re-sealing everything after it hides the break inside the box, but the
 * head published earlier (GitHub every ten minutes, then Bitcoin) is no
 * longer in the chain, which is the check /verify runs. A vote of the
 * visitor's own is appended and answered with a receipt that, like the
 * real one, does not say what was chosen.
 *
 * It plays that story by itself like a short film (tamper, cover up, get
 * caught, then cast a vote and get the receipt) until the visitor clicks.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { seeded } from './scroll';
import { AutoplayToggle, useAutoplay, type AutoplayCopy, type Step } from './autoplay';

type Choice = 'yes' | 'no' | 'abstain';

interface Ballot {
  token: string;
  choice: Choice;
  castAt: string;
  mine?: boolean;
}

interface Stored {
  prev: string;
  row: string;
}

export interface ChainCopy {
  eyebrow: string;
  title: string;
  titleEm: string;
  lede: string;
  layers: { t: string; d: string }[];
  box: string;
  choice: Record<Choice, string>;
  prev: string;
  seal: string;
  tamper: string;
  tamperHint: string;
  cover: string;
  reset: string;
  castTitle: string;
  receiptTitle: string;
  receiptNote: string;
  published: string;
  now: string;
  bitcoin: string;
  bitcoinValue: string;
  verdictOk: string;
  verdictBroken: string;
  verdictMoved: string;
  explainOk: string;
  explainBroken: string;
  explainMoved: string;
  verifyLink: string;
  example: string;
  /** The secrecy half of the promise, under the three layers. */
  secret: string;
  /** The technical footnote: the hash and where the recipe lives. */
  fine: string;
}

const PROPOSAL_ID = 128;
const GENESIS = '0'.repeat(64);
const CHOICES: Choice[] = ['yes', 'no', 'abstain'];

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

const seal = (prev: string, b: Ballot) =>
  sha256([prev, String(PROPOSAL_ID), 'anonymous', b.token, b.choice, '1', b.castAt].join('|'));

/** Minute precision, the way anonymous ballots are timestamped. */
const minuteIso = (d: Date) => {
  const c = new Date(d.getTime());
  c.setUTCSeconds(0, 0);
  return c.toISOString();
};

function token(rand: () => number): string {
  const bytes = new Uint8Array(40);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(rand() * 256);
  return btoa(String.fromCharCode(...bytes));
}

function initialBallots(): Ballot[] {
  const rand = seeded(9474);
  const now = Date.now();
  const picks: Choice[] = ['yes', 'yes', 'no', 'yes', 'abstain', 'yes', 'no', 'yes'];
  return picks.map((choice, i) => ({ token: token(rand), choice, castAt: minuteIso(new Date(now - (70 - i * 8) * 60_000)) }));
}

async function sealAll(ballots: Ballot[], from = 0, stored: Stored[] = []): Promise<Stored[]> {
  const out = stored.slice(0, from);
  let prev = from === 0 ? GENESIS : out[from - 1].row;
  for (let i = from; i < ballots.length; i++) {
    const row = await seal(prev, ballots[i]);
    out.push({ prev, row });
    prev = row;
  }
  return out;
}

const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;

export default function SealedChainDemo({ copy, auto }: { copy: ChainCopy; auto: AutoplayCopy }) {
  const [ballots, setBallots] = useState<Ballot[]>(initialBallots);
  const [stored, setStored] = useState<Stored[]>([]);
  const [published, setPublished] = useState('');
  const [check, setCheck] = useState<boolean[]>([]);
  const [receipt, setReceipt] = useState('');
  const first = useRef(true);

  // Seal the opening box once and publish its head, as the anchor job would.
  useEffect(() => {
    if (!first.current) return;
    first.current = false;
    sealAll(ballots).then((s) => {
      setStored(s);
      setPublished(s[s.length - 1].row);
    });
  }, [ballots]);

  // Re-verify every seal against the ballots as they now stand.
  useEffect(() => {
    let alive = true;
    if (stored.length !== ballots.length) return;
    Promise.all(
      ballots.map(async (b, i) => {
        const linked = stored[i].prev === (i === 0 ? GENESIS : stored[i - 1].row);
        return linked && (await seal(stored[i].prev, b)) === stored[i].row;
      }),
    ).then((ok) => alive && setCheck(ok));
    return () => {
      alive = false;
    };
  }, [ballots, stored]);

  const firstBreak = check.findIndex((ok) => !ok);
  const chainOk = check.length === ballots.length && firstBreak === -1;
  const anchorOk = stored.some((s) => s.row === published);
  const verdict = !chainOk ? 'broken' : anchorOk ? 'ok' : 'moved';

  const flip = (i: number) => {
    setReceipt('');
    setBallots((bs) => bs.map((b, k) => (k === i ? { ...b, choice: CHOICES[(CHOICES.indexOf(b.choice) + 1) % 3] } : b)));
  };
  const tamperRandom = () => {
    const others = ballots.flatMap((b, i) => (b.mine ? [] : [i]));
    flip(others[Math.floor(Math.random() * others.length)]);
  };
  const cover = async () => {
    const from = Math.max(0, firstBreak);
    setStored(await sealAll(ballots, from, stored));
  };
  const reset = async () => {
    const fresh = initialBallots();
    const s = await sealAll(fresh);
    setBallots(fresh);
    setStored(s);
    setPublished(s[s.length - 1].row);
    setReceipt('');
  };
  const cast = async (choice: Choice) => {
    if (!chainOk || ballots.some((b) => b.mine)) return;
    const bytes = crypto.getRandomValues(new Uint8Array(40));
    const mine: Ballot = { token: btoa(String.fromCharCode(...bytes)), choice, castAt: minuteIso(new Date()), mine: true };
    const prev = stored[stored.length - 1].row;
    const row = await seal(prev, mine);
    setBallots((bs) => [...bs, mine]);
    setStored((s) => [...s, { prev, row }]);
    setReceipt(row);
  };

  // The film: an honest box, a quiet change, a cover-up, caught; then a vote.
  const [hint, setHint] = useState<string | null>(null);
  const steps: Step[] = [
    { ms: 2600, run: () => { setHint(null); void reset(); } },
    { ms: 800, run: () => setHint('blk-2') },
    { ms: 3800, run: () => { setHint(null); flip(2); } },
    { ms: 900, run: () => setHint('cover') },
    { ms: 4600, run: () => { setHint(null); void cover(); } },
    { ms: 1600, run: () => void reset() },
    { ms: 800, run: () => setHint('cast-yes') },
    { ms: 4800, run: () => { setHint(null); void cast('yes'); } },
  ];
  const film = useAutoplay<HTMLElement>(steps);
  const userFlip = film.own(flip);
  const userTamper = film.own(tamperRandom);
  const userCover = film.own(() => void cover());
  const userReset = film.own(() => void reset());
  const userCast = film.own((c: Choice) => void cast(c));

  const groups = receipt.match(/.{8}/g) ?? [];
  const head = stored.length ? stored[stored.length - 1].row : '';

  return (
    <section ref={film.ref} className="tour-chain tour-night" id="t-chain" aria-labelledby="t-chain-title">
      <div className="tour-wrap tour-demo-grid">
        <div className="tour-demo-copy tour-reveal">
          <p className="tour-eyebrow"><span />{copy.eyebrow}</p>
          <h2 id="t-chain-title">
            {copy.title} <em>{copy.titleEm}</em>
          </h2>
          <p className="tour-lede">{copy.lede}</p>
          <ol className="tour-layers">
            {copy.layers.map((l, i) => (
              <li
                key={l.t}
                className={
                  (i === 0 && verdict === 'broken') || (i > 0 && verdict === 'moved') ? 'hit' : verdict === 'ok' ? 'ok' : ''
                }
              >
                <b>{l.t}</b>
                <span>{l.d}</span>
              </li>
            ))}
          </ol>
          <p className="tour-secret">{copy.secret}</p>
        </div>

        {/* The reveal sits on a wrapper: React rewrites this box's class on
            every verdict, which would drop the observer's "in". */}
        <div className="tour-reveal">
          <div className="tour-auto-row">
            <AutoplayToggle playing={film.playing} onToggle={film.toggle} copy={auto} />
          </div>
          <div className={`tour-box v-${verdict}`}>
            <div className="box-head">
              <span>{copy.box}</span>
              <small>{copy.example}</small>
            </div>
            <ol className="box-chain" aria-label={copy.box}>
              {ballots.map((b, i) => {
                const s = stored[i];
                const ok = check[i] !== false;
                return (
                  <li key={b.token} className={`blk${ok ? '' : ' broken'}${b.mine ? ' mine' : ''}`}>
                    <div className="blk-top">
                      <span className="n">#{i + 1}</span>
                      <button
                        type="button"
                        className={`chip c-${b.choice}${hint === `blk-${i}` ? ' press' : ''}`}
                        onClick={() => userFlip(i)}
                        disabled={b.mine}
                        title={copy.tamperHint}
                        aria-label={`#${i + 1}: ${copy.choice[b.choice]}. ${copy.tamperHint}`}
                      >
                        {copy.choice[b.choice]}
                      </button>
                    </div>
                    <div className="blk-tok" title={b.token}>⌗ {b.token.slice(0, 10)}…</div>
                    <div className="blk-h"><small>{copy.prev}</small><code>{s ? short(s.prev) : '…'}</code></div>
                    <div className="blk-h"><small>{copy.seal}</small><code>{s ? short(s.row) : '…'}</code></div>
                  </li>
                );
              })}
            </ol>

            <div className="box-anchor">
              <div>
                <small>{copy.published}</small>
                <code>{published ? short(published) : '…'}</code>
              </div>
              <div>
                <small>{copy.now}</small>
                <code>{head ? short(head) : '…'}</code>
              </div>
              <div className="btc">
                <small>{copy.bitcoin}</small>
                <code>{copy.bitcoinValue}</code>
              </div>
            </div>

            <p className="box-verdict" aria-live="polite">
              <b>{verdict === 'ok' ? copy.verdictOk : verdict === 'broken' ? copy.verdictBroken : copy.verdictMoved}</b>
              <span>{verdict === 'ok' ? copy.explainOk : verdict === 'broken' ? copy.explainBroken : copy.explainMoved}</span>
            </p>

            <div className="box-actions">
              {verdict === 'ok' && (
                <button type="button" className="tour-btn ghost sm" onClick={userTamper}>{copy.tamper}</button>
              )}
              {verdict === 'broken' && (
                <button type="button" className={`tour-btn sm${hint === 'cover' ? ' press' : ''}`} onClick={userCover}>{copy.cover}</button>
              )}
              {verdict !== 'ok' && (
                <button type="button" className="tour-link" onClick={userReset}>{copy.reset}</button>
              )}
            </div>

            {verdict === 'ok' && !ballots.some((b) => b.mine) && (
              <div className="box-cast">
                <span>{copy.castTitle}</span>
                {CHOICES.map((c) => (
                  <button key={c} type="button" className={`chip c-${c}${hint === `cast-${c}` ? ' press' : ''}`} onClick={() => userCast(c)}>
                    {copy.choice[c]}
                  </button>
                ))}
              </div>
            )}
            {receipt && (
              <div className="box-receipt" aria-live="polite">
                <small>{copy.receiptTitle}</small>
                <code>
                  {groups.slice(0, 4).join(' ')}
                  <br />
                  {groups.slice(4).join(' ')}
                </code>
                <p>{copy.receiptNote}</p>
              </div>
            )}
            <Link href="/verify" className="box-link">{copy.verifyLink} ↗</Link>
            <p className="tour-fine">{copy.fine}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
