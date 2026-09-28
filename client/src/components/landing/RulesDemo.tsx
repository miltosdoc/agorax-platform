/**
 * Self-government, working. In an autonomous community every rule is a
 * standing vote that never closes: the value with the most votes wins and
 * a tie keeps the current value (server/storage/communities.ts,
 * recomputeAutonomousSetting). The visitor joins eight members voting on
 * the join policy, and the community's constitution, rebuilt from its
 * settings on every read (server/utils/constitution.ts), rewrites its
 * article on membership, with a fresh content fingerprint, when the rule
 * turns.
 *
 * It plays by itself like a short film (a vote that turns the rule, a tie
 * that keeps it, a withdrawn vote) until the visitor clicks.
 */
import { useEffect, useMemo, useState } from 'react';
import { AutoplayToggle, useAutoplay, type AutoplayCopy, type Step } from './autoplay';

type Policy = 'open' | 'approval' | 'invite_only';
const POLICIES: Policy[] = ['open', 'approval', 'invite_only'];

export interface RulesCopy {
  eyebrow: string;
  title: string;
  titleEm: string;
  lede: string;
  points: string[];
  community: string;
  autonomous: string;
  setting: string;
  current: string;
  options: Record<Policy, string>;
  you: string;
  vote: string;
  yourVote: string;
  withdraw: string;
  nudge: string;
  tie: string;
  lead: (option: string) => string;
  flipped: (option: string) => string;
  constTitle: string;
  art1Title: string;
  art1: string;
  art2Title: string;
  articles: Record<Policy, string>;
  fingerprint: string;
}

const OTHERS: [string, Policy][] = [
  ['ΑΚ', 'open'], ['ΜΠ', 'open'], ['ΝΑ', 'open'],
  ['ΓΔ', 'approval'], ['ΣΛ', 'approval'], ['ΕΚ', 'approval'],
  ['ΘΡ', 'invite_only'], ['ΙΒ', 'invite_only'],
];

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Plurality among cast votes; a tie keeps the current value. */
function recompute(current: Policy, votes: Policy[]): Policy {
  const tally = POLICIES.map((p) => votes.filter((v) => v === p).length);
  const top = Math.max(...tally);
  const leaders = POLICIES.filter((_, i) => tally[i] === top);
  return leaders.length === 1 ? leaders[0] : current;
}

export default function RulesDemo({ copy, auto }: { copy: RulesCopy; auto: AutoplayCopy }) {
  const [others, setOthers] = useState<[string, Policy][]>(OTHERS);
  const [mine, setMine] = useState<Policy | null>(null);
  const [current, setCurrent] = useState<Policy>('open');
  const [previous, setPrevious] = useState<Policy | null>(null);
  const [fp, setFp] = useState('');
  const [justFlipped, setJustFlipped] = useState(false);

  const votes = useMemo(() => [...others.map(([, p]) => p), ...(mine ? [mine] : [])], [others, mine]);
  const tally = POLICIES.map((p) => votes.filter((v) => v === p).length);
  const top = Math.max(...tally);
  const tied = POLICIES.filter((_, i) => tally[i] === top).length > 1;

  useEffect(() => {
    const next = recompute(current, votes);
    setJustFlipped(next !== current);
    if (next !== current) {
      setPrevious(current);
      setCurrent(next);
    }
    // `current` is read, not tracked: the rule only turns when votes move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [votes]);

  useEffect(() => {
    let alive = true;
    sha256(`${copy.art1}\n${copy.articles[current]}`).then((h) => alive && setFp(h));
    return () => {
      alive = false;
    };
  }, [current, copy]);

  // The film: your vote turns the rule, a tie keeps it, withdrawing leaves it.
  const [hint, setHint] = useState<Policy | 'withdraw' | null>(null);
  const restart = () => {
    setOthers(OTHERS);
    setMine(null);
    setCurrent('open');
    setPrevious(null);
    setJustFlipped(false);
    setHint(null);
  };
  const steps: Step[] = [
    { ms: 2400, run: restart },
    { ms: 800, run: () => setHint('approval') },
    { ms: 3600, run: () => { setHint(null); setMine('approval'); } },
    { ms: 800, run: () => setHint('invite_only') },
    { ms: 3400, run: () => { setHint(null); setMine('invite_only'); } },
    { ms: 800, run: () => setHint('withdraw') },
    { ms: 3200, run: () => { setHint(null); setMine(null); } },
  ];
  const film = useAutoplay<HTMLElement>(steps);

  const nudge = () => {
    setOthers((os) => {
      const k = Math.floor(Math.random() * os.length);
      const choices = POLICIES.filter((p) => p !== os[k][1]);
      const next = [...os];
      next[k] = [os[k][0], choices[Math.floor(Math.random() * choices.length)]];
      return next;
    });
  };

  const status = justFlipped
    ? copy.flipped(copy.options[current])
    : tied
      ? copy.tie
      : copy.lead(copy.options[current]);

  return (
    <section ref={film.ref} className="tour-selfgov tour-parchment" id="t-rules" aria-labelledby="t-rules-title">
      <div className="tour-wrap tour-demo-grid">
        <div className="tour-demo-copy tour-reveal">
          <p className="tour-eyebrow"><span />{copy.eyebrow}</p>
          <h2 id="t-rules-title">
            {copy.title} <em>{copy.titleEm}</em>
          </h2>
          <p className="tour-lede">{copy.lede}</p>
          <ul className="tour-points">
            {copy.points.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>

        <div className="tour-rules-stage tour-reveal">
          <div className="tour-auto-row">
            <AutoplayToggle playing={film.playing} onToggle={film.toggle} copy={auto} />
          </div>
          <div className="rules-card">
            <div className="rules-head">
              <span>{copy.community}</span>
              <small>{copy.autonomous}</small>
            </div>
            <div className="rules-setting">
              <b>{copy.setting}</b>
              <span className="cur">{copy.current}: <em>{copy.options[current]}</em></span>
            </div>
            <ul className="rules-opts">
              {POLICIES.map((p, i) => (
                <li key={p} className={`${p === current ? 'is-current' : ''}${mine === p ? ' is-mine' : ''}`}>
                  <div className="row">
                    <span className="lbl">{copy.options[p]}</span>
                    <span className="cnt">{tally[i]}</span>
                    <button
                      type="button"
                      className={`vote${hint === p ? ' press' : ''}`}
                      onClick={film.own(() => setMine(p))}
                      disabled={mine === p}
                      aria-pressed={mine === p}
                    >
                      {mine === p ? copy.yourVote : copy.vote}
                    </button>
                  </div>
                  <div className="bar"><i style={{ width: `${(tally[i] / Math.max(1, votes.length)) * 100}%` }} /></div>
                  <div className="who" aria-hidden="true">
                    {others.filter(([, v]) => v === p).map(([n]) => <span key={n}>{n}</span>)}
                    {mine === p && <span className="me">{copy.you}</span>}
                  </div>
                </li>
              ))}
            </ul>
            <p className="rules-status" aria-live="polite">{status}</p>
            <div className="rules-actions">
              {mine && (
                <button type="button" className={`tour-link${hint === 'withdraw' ? ' press' : ''}`} onClick={film.own(() => setMine(null))}>
                  {copy.withdraw}
                </button>
              )}
              <button type="button" className="tour-link" onClick={film.own(nudge)}>{copy.nudge}</button>
            </div>
          </div>

          <article className="const-card">
            <p className="const-title">{copy.constTitle}</p>
            <h4><span>1</span>{copy.art1Title}</h4>
            <p>{copy.art1}</p>
            <h4><span>2</span>{copy.art2Title}</h4>
            <p className="live" key={current}>
              {previous && previous !== current && <del>{copy.articles[previous]}</del>}{' '}
              <ins className={previous ? '' : 'plain'}>{copy.articles[current]}</ins>
            </p>
            <p className="fp">{copy.fingerprint} · <code>{fp ? `${fp.slice(0, 16)}…` : '…'}</code></p>
          </article>
        </div>
      </div>
    </section>
  );
}
