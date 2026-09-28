/**
 * The four kinds of vote, each as a ballot the visitor can cast. The count
 * then follows that kind's own rule (shared/proposal-kinds.ts): a decision
 * passes when Yes is more than half of Yes and No, a statute needs at least
 * two thirds (so one vote can tip it), an election goes to the candidate with
 * the most votes, and a community poll decides nothing and only shows the
 * answers. Abstentions never count toward a majority.
 *
 * It plays by itself like a short film: each kind in turn, a vote pressed,
 * the count under its rule. The statute run votes No, so the two-thirds
 * rule visibly fails by one vote. A click of the visitor's own stops it.
 */
import { useState } from 'react';
import { AutoplayToggle, useAutoplay, type AutoplayCopy, type Step } from './autoplay';

export type Kind = 'decision' | 'statute' | 'election' | 'poll';

interface KindCopy {
  tab: string;
  question: string;
  options: string[];
  /** Votes already in the box, one per option. */
  counts: number[];
  rule: string;
  /** Options members added during the nominations or suggestions phase. */
  added?: number[];
  addedNote?: string;
}

export interface KindsCopy {
  eyebrow: string;
  title: string;
  titleEm: string;
  lede: string;
  kinds: Record<Kind, KindCopy>;
  pick: string;
  again: string;
  added: string;
  passes: (pct: number) => string;
  fails: (pct: number) => string;
  failsNeeds: string;
  elected: (name: string) => string;
  pollNote: string;
  abstainNote: string;
  footer: string;
}

const KINDS: Kind[] = ['decision', 'statute', 'election', 'poll'];
/** The option the film presses for each kind. */
const FILM_CHOICE: Record<Kind, number> = { decision: 0, statute: 1, election: 1, poll: 1 };
const HOLD = { open: 1300, press: 800, result: 3600 };

/** Yes/No ballots: option 0 is Yes, 1 is No, 2 is Abstain. */
function passes(kind: Kind, counts: number[]): boolean {
  const [yes, no] = counts;
  if (kind === 'decision') return yes * 2 > yes + no;
  return yes * 3 >= (yes + no) * 2;
}

export default function VoteKindsDemo({ copy, auto }: { copy: KindsCopy; auto: AutoplayCopy }) {
  const [kind, setKind] = useState<Kind>('decision');
  const [mine, setMine] = useState<Record<Kind, number | null>>({ decision: null, statute: null, election: null, poll: null });
  const [hint, setHint] = useState<number | null>(null);
  const [take, setTake] = useState(0);

  const steps: Step[] = KINDS.flatMap((kk) => [
    {
      ms: HOLD.open,
      run: () => {
        setKind(kk);
        setMine((m) => ({ ...m, [kk]: null }));
        setHint(null);
        setTake((n) => n + 1);
      },
    },
    { ms: HOLD.press, run: () => setHint(FILM_CHOICE[kk]) },
    {
      ms: HOLD.result,
      run: () => {
        setHint(null);
        setMine((m) => ({ ...m, [kk]: FILM_CHOICE[kk] }));
      },
    },
  ]);
  const film = useAutoplay<HTMLElement>(steps);
  const pickKind = film.own((kk: Kind) => {
    setHint(null);
    setKind(kk);
  });
  const vote = film.own((i: number) => {
    setHint(null);
    setMine((m) => ({ ...m, [kind]: i }));
  });
  const again = film.own(() => setMine((m) => ({ ...m, [kind]: null })));
  const k = copy.kinds[kind];
  const choice = mine[kind];
  const counts = k.counts.map((c, i) => c + (choice === i ? 1 : 0));
  const total = counts.reduce((a, b) => a + b, 0);
  const yesNo = kind === 'decision' || kind === 'statute';
  const leader = counts.indexOf(Math.max(...counts));

  let outcome = '';
  let good = true;
  if (choice !== null) {
    if (yesNo) {
      good = passes(kind, counts);
      const share = Math.round((counts[0] / (counts[0] + counts[1])) * 1000) / 10;
      outcome = good ? copy.passes(share) : copy.fails(share);
      if (!good && kind === 'statute') outcome += ` ${copy.failsNeeds}`;
    } else if (kind === 'election') {
      outcome = copy.elected(k.options[leader]);
    } else {
      outcome = copy.pollNote;
    }
  }

  return (
    <section ref={film.ref} className="tour-kinds tour-night" id="t-kinds" aria-labelledby="t-kinds-title">
      <div className="tour-wrap tour-demo-grid">
        <div className="tour-demo-copy tour-reveal">
          <p className="tour-eyebrow"><span />{copy.eyebrow}</p>
          <h2 id="t-kinds-title">
            {copy.title} <em>{copy.titleEm}</em>
          </h2>
          <p className="tour-lede">{copy.lede}</p>
          <div className="kinds-tabs" role="tablist" aria-label={copy.eyebrow}>
            {KINDS.map((kk) => (
              <button
                key={kk}
                type="button"
                role="tab"
                aria-selected={kind === kk}
                className={kind === kk ? 'on' : ''}
                onClick={() => pickKind(kk)}
              >
                <b>{copy.kinds[kk].tab}</b>
                <span>{copy.kinds[kk].rule}</span>
                {film.playing && kind === kk && (
                  <i key={take} className="take" style={{ animationDuration: `${HOLD.open + HOLD.press + HOLD.result}ms` }} aria-hidden="true" />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="tour-reveal">
          <div className="tour-auto-row">
            <AutoplayToggle playing={film.playing} onToggle={film.toggle} copy={auto} />
          </div>
          <div className="kinds-ballot ui-card" role="tabpanel" aria-live="polite">
            <p className="lbl">{k.tab}</p>
            <h3>{k.question}</h3>
            {k.addedNote && <p className="kinds-added">{k.addedNote}</p>}
            <ul>
              {k.options.map((o, i) => {
                const pct = total ? (counts[i] / total) * 100 : 0;
                return (
                  <li key={o}>
                    <button
                      type="button"
                      className={`opt${choice === i ? ' mine' : ''}${hint === i ? ' press' : ''}${yesNo ? ` yn-${i}` : ''}${choice !== null && !yesNo && i === leader ? ' lead' : ''}`}
                      onClick={() => vote(i)}
                      disabled={choice !== null}
                    >
                      <i style={{ width: choice === null ? 0 : `${pct}%` }} aria-hidden="true" />
                      <span className="o">
                        {o}
                        {k.added?.includes(i) && <small>{copy.added}</small>}
                      </span>
                      {choice !== null && (
                        <span className="n">
                          {counts[i]} · {Math.round(pct)}%
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            {choice === null ? (
              <p className="kinds-hint">{copy.pick}</p>
            ) : (
              <div className={`kinds-outcome${kind === 'poll' || kind === 'election' ? ' neutral' : good ? ' ok' : ' no'}`}>
                <b>{outcome}</b>
                {yesNo && <span>{copy.abstainNote}</span>}
                <button type="button" className="again" onClick={again}>
                  {copy.again}
                </button>
              </div>
            )}
          </div>
          <p className="tour-fine kinds-foot">{copy.footer}</p>
        </div>
      </div>
    </section>
  );
}
