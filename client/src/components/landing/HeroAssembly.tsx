/**
 * The opening scene: a scattered crowd gathers into the hemicycle, the
 * AgoraX mark, as the visitor scrolls. There is one dot per member of the
 * platform, counted live, so the hemicycle is the real membership. The
 * section is pinned for half a screen of scroll so the gathering completes in
 * view; under reduced motion the crowd is already seated.
 */
import { useEffect, useRef } from 'react';
import { clamp, ease, reducedMotion, sectionProgress, seeded, span, useScrollFrame } from './scroll';

/** Outside this range the hemicycle stops being one dot per member. */
const MIN_SEATS = 40;
const MAX_SEATS = 600;

interface Seat {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  z: number;
  ph: number;
  lead: boolean;
}

export interface HeroCopy {
  eyebrow: string;
  /** Headline lines; the last one is set in gold. */
  title: string[];
  lede: string;
  tour: string;
  register: string;
  signIn: string;
  /** The rotated stamp only the Spray skin shows. */
  stamp: string;
  /** Under the seated hemicycle, once the member count is known. */
  caption: (members: string) => string;
  scroll: string;
}

export default function HeroAssembly({
  copy,
  onRegister,
  onSignIn,
  stats,
  members,
  skin,
}: {
  copy: HeroCopy;
  onRegister: () => void;
  onSignIn: () => void;
  stats?: { value: string; label: string }[];
  /** Platform members; one seat each. */
  members?: number;
  /** The tour's skin; the dots take their colours from it. */
  skin: string;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const captionRef = useRef<HTMLParagraphElement>(null);
  const state = useRef({ seats: [] as Seat[], w: 0, h: 0, bx: 0, by: 0, p: 0, mx: 0, my: 0, visible: true, members: 0, dot: '160,196,236', lead: '232,194,116', bema: '255,241,200' });
  const rebuild = useRef<() => void>(() => {});

  useEffect(() => {
    const cv = canvasRef.current!;
    const section = sectionRef.current!;
    const cx = cv.getContext('2d')!;
    const glow = document.createElement('canvas');
    const s = state.current;
    const RM = reducedMotion();

    const build = () => {
      // The skin sets the palette as r,g,b triplets on the section.
      const css = getComputedStyle(section);
      s.dot = css.getPropertyValue('--dot-rgb').trim() || s.dot;
      s.lead = css.getPropertyValue('--lead-rgb').trim() || s.lead;
      s.bema = css.getPropertyValue('--bema-rgb').trim() || s.bema;
      // The lead seats' glow, drawn once and stamped, since a canvas blur per
      // dot per frame is what slows a weak machine down.
      const gctx = glow.getContext('2d')!;
      glow.width = glow.height = 32;
      const gg = gctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      gg.addColorStop(0, `rgba(${s.lead},0.75)`);
      gg.addColorStop(1, `rgba(${s.lead},0)`);
      gctx.clearRect(0, 0, 32, 32);
      gctx.fillStyle = gg;
      gctx.fillRect(0, 0, 32, 32);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const box = cv.parentElement!.getBoundingClientRect();
      s.w = box.width;
      s.h = box.height;
      cv.width = s.w * dpr;
      cv.height = s.h * dpr;
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const narrow = s.w < 900;
      // The hemicycle sits right of the copy on a wide screen and under it
      // on a phone; its size follows the room it has.
      const R = narrow ? Math.min(s.w * 0.44, s.h * 0.3) : Math.min(s.w * 0.215, s.h * 0.44);
      s.bx = narrow ? s.w / 2 : s.w * 0.75;
      s.by = narrow ? s.h - 64 : s.h * 0.66 + R * 0.35;
      // One seat per member (a default crowd until the count arrives),
      // spread over the rows in proportion to each row's length.
      const n = Math.max(MIN_SEATS, Math.min(MAX_SEATS, s.members || 180));
      const rows = Math.max(4, Math.min(narrow ? 7 : 9, Math.round(Math.sqrt(n / 2.6))));
      const radii = Array.from({ length: rows }, (_, r) => R * (0.34 + (0.66 * r) / (rows - 1)));
      const sum = radii.reduce((a, b) => a + b, 0);
      const perRow = radii.map((r) => Math.max(3, Math.round((n * r) / sum)));
      perRow[rows - 1] += n - perRow.reduce((a, b) => a + b, 0);
      const rand = seeded(508);
      const seats: Seat[] = [];
      radii.forEach((radius, r) => {
        const count = perRow[r];
        for (let i = 0; i < count; i++) {
          const f = count === 1 ? 0.5 : i / (count - 1);
          const a = Math.PI - f * Math.PI;
          seats.push({
            x0: rand() * s.w,
            y0: rand() * s.h,
            x1: s.bx + radius * Math.cos(a),
            y1: s.by - radius * Math.sin(a),
            z: 0.35 + rand() * 0.65,
            ph: rand() * 6.283,
            lead: f < 0.26,
          });
        }
      });
      s.seats = seats;
    };

    const draw = (time: number) => {
      const p = RM ? 1 : ease(s.p);
      const t = time / 1000;
      const drift = RM ? 0 : 1 - p;
      cx.clearRect(0, 0, s.w, s.h);
      // the bema: where the speaker stood, lit once the seats are full
      const lit = clamp((p - 0.8) / 0.2);
      if (lit > 0) {
        const g = cx.createRadialGradient(s.bx, s.by, 0, s.bx, s.by, 90);
        g.addColorStop(0, `rgba(${s.lead},${0.35 * lit})`);
        g.addColorStop(1, `rgba(${s.lead},0)`);
        cx.fillStyle = g;
        cx.fillRect(s.bx - 90, s.by - 90, 180, 180);
      }
      for (const g of s.seats) {
        const x = g.x0 + (g.x1 - g.x0) * p + drift * (Math.sin(t * 0.35 + g.ph) * 16 * g.z + s.mx * 30 * g.z);
        const y = g.y0 + (g.y1 - g.y0) * p + drift * (Math.cos(t * 0.3 + g.ph) * 13 * g.z + s.my * 22 * g.z);
        const r = 1.4 + g.z * 1.5 + p * (g.lead ? 1.3 : 0.9);
        const a = 0.25 + 0.35 * g.z + 0.4 * p;
        if (g.lead && p > 0.5) {
          cx.globalAlpha = (p - 0.5) * 2 * a;
          cx.drawImage(glow, x - 16, y - 16);
          cx.globalAlpha = 1;
          cx.fillStyle = `rgba(${s.lead},${a})`;
        } else {
          cx.fillStyle = `rgba(${s.dot},${a * (0.7 + 0.3 * p)})`;
        }
        cx.beginPath();
        cx.arc(x, y, r, 0, 6.283);
        cx.fill();
      }
      if (lit > 0) {
        cx.fillStyle = `rgba(${s.bema},${lit})`;
        cx.beginPath();
        cx.arc(s.bx, s.by - 2, 4.5, 0, 6.283);
        cx.fill();
      }
      if (captionRef.current) captionRef.current.style.opacity = String(lit);
    };

    build();
    rebuild.current = () => {
      build();
      if (RM) draw(0);
    };
    let raf = 0;
    const loop = (time: number) => {
      if (s.visible) draw(time);
      raf = requestAnimationFrame(loop);
    };
    if (RM) draw(0);
    else raf = requestAnimationFrame(loop);

    const onResize = () => {
      build();
      if (RM) draw(0);
    };
    const onMove = (e: PointerEvent) => {
      // The pinned hero fills the viewport, so the viewport is its frame.
      s.mx = e.clientX / window.innerWidth - 0.5;
      s.my = e.clientY / window.innerHeight - 0.5;
    };
    const io = new IntersectionObserver(([e]) => (s.visible = e.isIntersecting), { threshold: 0 });
    io.observe(section);
    window.addEventListener('resize', onResize);
    section.addEventListener('pointermove', onMove);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener('resize', onResize);
      section.removeEventListener('pointermove', onMove);
    };
  }, []);

  // Repaint in the new palette when the skin changes.
  useEffect(() => {
    rebuild.current();
  }, [skin]);

  // Re-seat the crowd once the live member count arrives.
  useEffect(() => {
    if (members && members !== state.current.members) {
      state.current.members = members;
      rebuild.current();
    }
  }, [members]);

  useScrollFrame(() => {
    if (sectionRef.current) state.current.p = span(sectionProgress(sectionRef.current), 0, 0.85);
  });

  const seated = members && members >= MIN_SEATS && members <= MAX_SEATS ? copy.caption(members.toLocaleString(document.documentElement.lang === 'en' ? 'en-GB' : 'el-GR')) : '';

  return (
    <section ref={sectionRef} className="tour-hero tour-night" id="t-hero" aria-labelledby="t-hero-title">
      <div className="tour-pin tour-hero-pin">
        <canvas ref={canvasRef} className="tour-hero-canvas" aria-hidden="true" />
        <div className="tour-hero-copy">
          <p className="tour-eyebrow"><span />{copy.eyebrow}</p>
          <h1 id="t-hero-title">
            {copy.title.map((line, i) =>
              i === copy.title.length - 1 ? <em key={line}>{line}</em> : <span key={line}>{line}<br /></span>,
            )}
          </h1>
          <p className="tour-lede">{copy.lede}</p>
          <div className="tour-actions">
            <a className="tour-btn" href="#t-noise">
              {copy.tour} <span aria-hidden="true">↓</span>
            </a>
            <button type="button" className="tour-btn ghost" onClick={onRegister} data-testid="landing-get-started">
              {copy.register}
            </button>
            <button type="button" className="tour-link" onClick={onSignIn} data-testid="landing-sign-in">
              {copy.signIn}
            </button>
          </div>
          {stats && stats.length > 0 && (
            <dl className="tour-stats">
              {stats.map((st) => (
                <div key={st.label}>
                  <dt>{st.label}</dt>
                  <dd>{st.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        {seated && <p ref={captionRef} className="tour-hero-caption">{seated}</p>}
        <p className="tour-stamp" aria-hidden="true">{copy.stamp}</p>
        <div className="tour-scrollcue" aria-hidden="true"><span />{copy.scroll}</div>
      </div>
    </section>
  );
}
