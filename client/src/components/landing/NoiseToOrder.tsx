/**
 * Chapter one, the problem, in three beats scrubbed by scroll: one vote in
 * forty-eight months; the noise that fills the months between; and the order
 * AgoraX gives it: a discussion, a vote, a decision. The same 48 marks play
 * all three parts, so the eye follows one crowd from calendar to comment
 * storm to order.
 */
import { useEffect, useRef } from 'react';
import { clamp, ease, lerp, reducedMotion, sectionProgress, seeded, span, useScrollFrame } from './scroll';

export interface NoiseCopy {
  eyebrow: string;
  beats: { title: string; titleEm: string; body: string }[];
  counters: [string, string, string];
  shouts: string[];
  groups: [string, string, string];
}

const N = 48;

interface Mark {
  ax: number; ay: number;
  bx: number; by: number; bw: number; bh: number;
  cx: number; cy: number;
  ph: number;
  angry: boolean;
  shout: string | null;
  gold: boolean;
}

function buildMarks(shouts: string[]): Mark[] {
  const rand = seeded(2026);
  const marks: Mark[] = [];
  // C: three clusters of sixteen: a discussion thread, the columns of a
  // result, and the tick of a decision.
  const targets: [number, number, boolean][] = [];
  const thread: [number, number][] = [[0, 6], [1, 4], [1, 3], [0, 3]];
  thread.forEach(([indent, count], row) => {
    for (let k = 0; k < count; k++) targets.push([56 + indent * 18 + k * 18, 176 + row * 20, false]);
  });
  [7, 5, 4].forEach((height, col) => {
    for (let k = 0; k < height; k++) targets.push([276 + col * 24, 236 - k * 13, col === 0]);
  });
  for (let k = 0; k < 16; k++) {
    // five dots down the short stroke, eleven up the long one
    const [x, y] = k < 5 ? [456 + k * 6.5, 194 + k * 7.5] : [482 + (k - 5) * 5.2, 228 - (k - 5) * 6.6];
    targets.push([x, y, true]);
  }
  let shoutAt = 0;
  for (let i = 0; i < N; i++) {
    const w = 34 + rand() * 64;
    const hasShout = i % 3 === 0 && shouts.length > 0;
    marks.push({
      ax: 72 + (i % 12) * 38,
      ay: 120 + Math.floor(i / 12) * 38,
      bx: 20 + rand() * (560 - w),
      by: 40 + rand() * 250,
      bw: hasShout ? Math.max(w, 76) : w,
      bh: 22 + rand() * 12,
      cx: targets[i][0],
      cy: targets[i][1],
      ph: rand() * 6.283,
      angry: rand() < 0.3,
      shout: hasShout ? shouts[shoutAt++ % shouts.length] : null,
      gold: targets[i][2],
    });
  }
  return marks;
}

export default function NoiseToOrder({ copy }: { copy: NoiseCopy }) {
  const sectionRef = useRef<HTMLElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const progress = useRef(0);
  const marks = useRef<Mark[]>(buildMarks(copy.shouts));

  const paint = (time: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const RM = reducedMotion();
    const p = RM ? 1 : progress.current;
    const beat = p < 0.34 ? 0 : p < 0.67 ? 1 : 2;
    sectionRef.current?.querySelectorAll<HTMLElement>('.tour-beat').forEach((el, i) => el.classList.toggle('on', RM || i === beat));
    const ab = ease(span(p, 0.26, 0.42)); // calendar → storm
    const bc = ease(span(p, 0.62, 0.8)); // storm → order
    const shake = (1 - bc) * ab;
    const t = time / 1000;
    const groups = svg.querySelectorAll<SVGGElement>('g.mk');
    marks.current.forEach((m, i) => {
      const g = groups[i];
      if (!g) return;
      const jx = Math.sin(t * 2.1 + m.ph) * 3.5 * shake;
      const jy = Math.cos(t * 1.7 + m.ph) * 2.5 * shake;
      const wA = 22, wC = 8;
      const w = bc > 0 ? lerp(m.bw, wC, bc) : lerp(wA, m.bw, ab);
      const h = bc > 0 ? lerp(m.bh, wC, bc) : lerp(wA, m.bh, ab);
      const x = (bc > 0 ? lerp(m.bx, m.cx, bc) : lerp(m.ax, m.bx, ab)) + jx;
      const y = (bc > 0 ? lerp(m.by, m.cy, bc) : lerp(m.ay, m.by, ab)) + jy;
      const rect = g.firstElementChild as SVGRectElement;
      rect.setAttribute('x', String(x - w / 2));
      rect.setAttribute('y', String(y - h / 2));
      rect.setAttribute('width', String(w));
      rect.setAttribute('height', String(h));
      rect.setAttribute('rx', String(bc > 0 ? lerp(h / 2, 4, bc) : lerp(3, h / 2, ab)));
      g.classList.toggle('angry', m.angry && ab > 0.5 && bc < 0.5);
      g.classList.toggle('gold', (i === 17 && ab < 0.5) || (m.gold && bc > 0.5));
      g.classList.toggle('dot', bc > 0.5);
      const label = rect.nextElementSibling as SVGTextElement | null;
      if (label) {
        label.setAttribute('x', String(x));
        label.setAttribute('y', String(y + 3.5));
        label.style.opacity = String(ab * (1 - bc * 2.5));
      }
    });
    svg.style.setProperty('--ab', String(ab));
    svg.style.setProperty('--bc', String(bc));
    svg.style.setProperty('--cal', String(1 - ab));
    const counters = svg.querySelectorAll<SVGTextElement>('.counter');
    counters.forEach((c, k) => (c.style.opacity = String(k === 0 ? 1 - ab : k === 1 ? ab * (1 - bc) : bc)));
    const tally = svg.querySelector<SVGTextElement>('.tally');
    if (tally) tally.textContent = Math.round(12480 * clamp(span(p, 0.34, 0.62) * 1.1)).toLocaleString('el-GR');
  };

  useScrollFrame(() => {
    if (sectionRef.current) progress.current = sectionProgress(sectionRef.current);
    paint(performance.now());
  });

  // The storm keeps trembling while it is on screen.
  useEffect(() => {
    if (reducedMotion()) return;
    let raf = 0;
    let on = false;
    const loop = (time: number) => {
      if (on && progress.current > 0.3 && progress.current < 0.8) paint(time);
      raf = requestAnimationFrame(loop);
    };
    const io = new IntersectionObserver(([e]) => (on = e.isIntersecting), { threshold: 0 });
    if (sectionRef.current) io.observe(sectionRef.current);
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, []);

  return (
    <section ref={sectionRef} className="tour-noise tour-parchment" id="t-noise" aria-labelledby="t-noise-title">
      <div className="tour-pin tour-split">
        <div className="tour-noise-copy">
          <p className="tour-eyebrow"><span />{copy.eyebrow}</p>
          <h2 id="t-noise-title" className="sr-only">{copy.eyebrow}</h2>
          <div className="tour-beats">
            {copy.beats.map((b, i) => (
              <div className="tour-beat" key={i}>
                <h3>
                  {b.title} <em>{b.titleEm}</em>
                </h3>
                <p>{b.body}</p>
              </div>
            ))}
          </div>
        </div>
        <svg ref={svgRef} className="tour-noise-art" viewBox="0 0 600 340" aria-hidden="true">
          {/* the calendar frame, then the three institutions' outlines */}
          <g className="cal">
            <text x="72" y="92" className="axis">2023</text>
            <text x="490" y="92" className="axis" textAnchor="end">2027</text>
          </g>
          <g className="outlines">
            <rect x="40" y="158" width="148" height="92" rx="14" />
            <path d="M 258 244 H 346" />
            <circle cx="495" cy="202" r="58" />
            <text x="114" y="290" textAnchor="middle" className="grp">{copy.groups[0]}</text>
            <text x="300" y="290" textAnchor="middle" className="grp">{copy.groups[1]}</text>
            <text x="495" y="290" textAnchor="middle" className="grp">{copy.groups[2]}</text>
          </g>
          {marks.current.map((m, i) => (
            <g className="mk" key={i}>
              <rect />
              {m.shout && <text textAnchor="middle" className="shout">{m.shout}</text>}
            </g>
          ))}
          <text x="300" y="330" textAnchor="middle" className="counter">{copy.counters[0]}</text>
          <text x="300" y="330" textAnchor="middle" className="counter">
            <tspan className="tally">0</tspan> {copy.counters[1]}
          </text>
          <text x="300" y="330" textAnchor="middle" className="counter">{copy.counters[2]}</text>
        </svg>
      </div>
    </section>
  );
}
