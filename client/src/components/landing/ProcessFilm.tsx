/**
 * Chapter two: one proposal's whole life as a pinned, scroll-scrubbed film
 * in five scenes: describe it and let the AI fill the form, co-draft it,
 * vote in secret, decide, verify. Each scene is plain markup whose motion
 * is driven by CSS variables written from the scroll position; the step
 * list doubles as a chapter menu.
 */
import { useRef } from 'react';
import { clamp, ease, reducedMotion, scrollToProgress, sectionProgress, span, useScrollFrame } from './scroll';

export interface FilmCopy {
  eyebrow: string;
  title: string;
  titleEm: string;
  steps: { t: string; d: string }[];
  kinds: [string, string, string, string];
  typed: string;
  aiFill: string;
  aiNote: string;
  fTitle: string;
  fTitleVal: string;
  fDuration: string;
  durations: [string, string, string];
  fOptions: string;
  options: [string, string, string];
  amText: [string, string, string, string, string];
  amBy: string;
  amAccept: string;
  amReject: string;
  ovrTitle: string;
  ovrNote: string;
  ballotTitle: string;
  blind: string;
  sign: string;
  unblind: string;
  cast: string;
  delay: string;
  receipt: string;
  receiptNote: string;
  receiptHash: string;
  resultTitle: string;
  ballot: [string, string, string];
  passed: string;
  constTitle: string;
  constItem: string;
  verifyTitle: string;
  q1: string;
  a1: string;
  q2: string;
  checks: [string, string, string];
  verdict: string;
}

export default function ProcessFilm({ copy }: { copy: FilmCopy }) {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const typedRef = useRef<HTMLSpanElement>(null);

  useScrollFrame(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    if (!section || !stage) return;
    const RM = reducedMotion();
    const n = copy.steps.length;
    const raw = RM ? n - 0.001 : sectionProgress(section) * n;
    const i = Math.min(n - 1, Math.floor(raw));
    const t = RM ? 1 : clamp(raw - i);
    section.querySelectorAll<HTMLLIElement>('.film-steps li').forEach((li, k) => {
      li.classList.toggle('on', k === i);
      li.style.setProperty('--sp', String(k < i ? 1 : k === i ? t : 0));
    });
    stage.querySelectorAll<HTMLElement>('.scene').forEach((s, k) => s.classList.toggle('on', RM || k === i));
    const set = (k: string, v: number) => stage.style.setProperty(k, v.toFixed(3));
    // How far each scene has played: 0 before it, its own t while on, 1 after.
    const at = (k: number) => (RM ? 1 : i === k ? t : i > k ? 1 : 0);

    const u = at(0);
    if (typedRef.current) typedRef.current.textContent = copy.typed.slice(0, Math.round(copy.typed.length * clamp(u * 2.2)));
    set('--ai', ease(span(u, 0.48, 0.6)));
    set('--fill', ease(span(u, 0.58, 0.88)));

    const a = at(1);
    set('--am', ease(span(a, 0.05, 0.28)));
    set('--del', ease(span(a, 0.26, 0.42)));
    set('--ins', ease(span(a, 0.38, 0.54)));
    set('--acc', ease(span(a, 0.48, 0.6)));
    set('--ovr', ease(span(a, 0.64, 0.8)));
    set('--sup', ease(span(a, 0.72, 0.9)));

    const v = at(2);
    set('--env', ease(span(v, 0.05, 0.24)));
    set('--stamp', ease(span(v, 0.24, 0.38)));
    set('--open', ease(span(v, 0.4, 0.55)));
    set('--drop', ease(span(v, 0.56, 0.72)));
    set('--rcpt', ease(span(v, 0.72, 0.88)));

    const d = at(3);
    set('--bars', ease(span(d, 0.05, 0.42)));
    set('--pass', ease(span(d, 0.4, 0.52)));
    set('--const', ease(span(d, 0.58, 0.82)));

    const w = at(4);
    set('--a1', ease(span(w, 0.08, 0.28)));
    set('--c1', ease(span(w, 0.36, 0.48)));
    set('--c2', ease(span(w, 0.48, 0.6)));
    set('--c3', ease(span(w, 0.6, 0.72)));
    set('--ok', ease(span(w, 0.74, 0.86)));
  });

  const jump = (k: number) => {
    if (sectionRef.current) scrollToProgress(sectionRef.current, (k + 0.82) / copy.steps.length);
  };

  const hash = copy.receiptHash.match(/.{8}/g) ?? [];
  const shares = [0.58, 0.31, 0.11];

  return (
    <section ref={sectionRef} className="tour-film tour-night" id="t-film" aria-labelledby="t-film-title">
      <div className="tour-pin tour-split film-split">
        <div className="film-copy">
          <p className="tour-eyebrow"><span />{copy.eyebrow}</p>
          <h2 id="t-film-title">
            {copy.title} <em>{copy.titleEm}</em>
          </h2>
          <ol className="film-steps">
            {copy.steps.map((s, k) => (
              <li key={s.t}>
                <button type="button" onClick={() => jump(k)}>
                  <span className="n">{String(k + 1).padStart(2, '0')}</span>
                  <span className="t">{s.t}</span>
                </button>
                <p>{s.d}</p>
                <i aria-hidden="true" />
              </li>
            ))}
          </ol>
        </div>

        <div ref={stageRef} className="film-stage" aria-hidden="true">
          {/* 0 · describe: a plain sentence becomes a whole proposal */}
          <div className="scene s-describe">
            <div className="ui-card">
              <div className="kinds">
                {copy.kinds.map((k, n) => (
                  <span key={k} className={n === 0 ? 'on' : ''}>{k}</span>
                ))}
              </div>
              <p className="typed"><span ref={typedRef} /><i className="caret" /></p>
              <span className="ai-btn">✦ {copy.aiFill}</span>
              <div className="filled">
                <p className="ai-note">{copy.aiNote}</p>
                <label>{copy.fTitle}</label>
                <p className="val">{copy.fTitleVal}</p>
                <label>{copy.fDuration}</label>
                <div className="chips">
                  {copy.durations.map((d, n) => (
                    <span key={d} className={n === 1 ? 'on' : ''}>{d}</span>
                  ))}
                </div>
                <label>{copy.fOptions}</label>
                <div className="opts">
                  <span className="o-yes">{copy.options[0]}</span>
                  <span className="o-no">{copy.options[1]}</span>
                  <span className="o-abs">{copy.options[2]}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 1 · co-draft: an amendment merges; a rejected one returns by support */}
          <div className="scene s-codraft">
            <div className="ui-card doc">
              <p>
                {copy.amText[0]} <del>{copy.amText[1]}</del> <ins>{copy.amText[2]}</ins> {copy.amText[3]} <ins className="late">{copy.amText[4]}</ins>
              </p>
            </div>
            <div className="ui-card amend">
              <p className="by">{copy.amBy}</p>
              <div className="acts">
                <span className="acc">✓ {copy.amAccept}</span>
                <span className="rej">{copy.amReject}</span>
              </div>
            </div>
            <div className="ui-card override">
              <p className="lbl">{copy.ovrTitle}</p>
              <div className="support">
                <i />
                <b className="mark" />
                <span>74%</span>
              </div>
              <p className="note">{copy.ovrNote}</p>
            </div>
          </div>

          {/* 2 · secret vote: sealed, signed blind, opened, cast */}
          <div className="scene s-vote">
            <p className="scene-cap">{copy.ballotTitle}</p>
            <div className="ballot-run">
              <div className="ballot"><span>{copy.options[0]}</span></div>
              <div className="envelope"><span className="flap" /></div>
              <div className="stamp">✓</div>
              <div className="urn"><span /></div>
            </div>
            <ol className="vote-steps">
              <li style={{ opacity: 'calc(0.6 + 0.4 * var(--env))' } as React.CSSProperties}><b>1</b>{copy.blind}</li>
              <li style={{ opacity: 'calc(0.6 + 0.4 * var(--stamp))' } as React.CSSProperties}><b>2</b>{copy.sign}</li>
              <li style={{ opacity: 'calc(0.6 + 0.4 * var(--open))' } as React.CSSProperties}><b>3</b>{copy.unblind}</li>
              <li style={{ opacity: 'calc(0.6 + 0.4 * var(--drop))' } as React.CSSProperties}><b>4</b><span>{copy.cast}<small>{copy.delay}</small></span></li>
            </ol>
            <div className="ui-card receipt">
              <p className="lbl">{copy.receipt}</p>
              <code>{hash.slice(0, 4).join(' ')}<br />{hash.slice(4).join(' ')}</code>
              <p className="note">{copy.receiptNote}</p>
            </div>
          </div>

          {/* 3 · decide: the ballot, and the decision entering the constitution */}
          <div className="scene s-decide">
            <div className="ui-card result">
              <p className="lbl">{copy.resultTitle}</p>
              {copy.ballot.map((b, n) => (
                <div className={`bar b-${n}`} key={b}>
                  <span>{b}</span>
                  <i style={{ ['--w' as string]: shares[n] }} />
                  <b>{Math.round(shares[n] * 100)}%</b>
                </div>
              ))}
              <span className="passed">{copy.passed}</span>
            </div>
            <div className="ui-card const">
              <p className="lbl">{copy.constTitle}</p>
              <p className="item">{copy.constItem}</p>
            </div>
          </div>

          {/* 4 · verify: the two questions /verify answers */}
          <div className="scene s-verify">
            <div className="ui-card verify">
              <p className="lbl">{copy.verifyTitle}</p>
              <p className="q">{copy.q1}</p>
              <p className="a a1">✓ {copy.a1}</p>
              <p className="q">{copy.q2}</p>
              <ul className="checks">
                {copy.checks.map((c, n) => (
                  <li key={c} style={{ opacity: `var(--c${n + 1})` } as React.CSSProperties}>
                    <span>✓</span>
                    {c}
                  </li>
                ))}
              </ul>
              <p className="verdict">{copy.verdict}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
