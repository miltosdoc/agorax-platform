/**
 * CEREMONY II — live results, election-night quality.
 *
 * The only dark surface in the system. A hemicycle of counted ballots
 * (one seat per vote), display-size serif percentages that count up once,
 * and a quorum bar marked in red. Motion follows the 700ms ceremony curve;
 * nothing pulses or bounces. Respects prefers-reduced-motion.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '@/hooks/use-translation';

interface Props {
  yes: number;
  no: number;
  abstain: number;
  total: number;
  participationPct: number;   // 0..1
  quorumPct: number;          // 0..1  (0 = no quorum required)
  meetsQuorum: boolean;
  live?: boolean;             // still in the voting phase
  title?: string;
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** Seats laid out in concentric arcs, ordered left→right across the hemicycle. */
function useSeats(total: number) {
  return useMemo(() => {
    if (total <= 0) return [];
    const rows: number = total > 90 ? 6 : total > 40 ? 5 : total > 12 ? 4 : 2;
    const inner = 84, outer = 196;
    const denom = rows === 1 ? 1 : rows - 1;
    const widths: number[] = [];
    let sum = 0;
    for (let r = 0; r < rows; r++) { const w = inner + (outer - inner) * (r / denom); widths.push(w); sum += w; }
    let acc = 0;
    const counts = widths.map((w, i) => {
      const n = i === rows - 1 ? total - acc : Math.round((w / sum) * total);
      acc += n; return Math.max(0, n);
    });
    const seats: { x: number; y: number; angle: number }[] = [];
    for (let r = 0; r < rows; r++) {
      const radius = inner + (outer - inner) * (r / denom);
      const n = counts[r];
      for (let s = 0; s < n; s++) {
        const tpos = n === 1 ? 0.5 : s / (n - 1);
        const a = Math.PI - tpos * Math.PI;
        seats.push({ x: 200 + radius * Math.cos(a), y: 205 - radius * Math.sin(a), angle: tpos });
      }
    }
    seats.sort((a, b) => a.angle - b.angle);
    return seats;
  }, [total]);
}

function CountUp({ target, reduced, play }: { target: number; reduced: boolean; play: boolean }) {
  const [val, setVal] = useState(reduced ? target : 0);
  useEffect(() => {
    if (!play) return;
    if (reduced) { setVal(target); return; }
    let raf = 0; let t0 = 0;
    const step = (ts: number) => {
      if (!t0) t0 = ts;
      const p = Math.min((ts - t0) / 1400, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(target * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, reduced, play]);
  return <>{val.toFixed(1)}</>;
}

export function BroadcastResults({ yes, no, abstain, total, participationPct, quorumPct, meetsQuorum, live, title }: Props) {
  const { t } = useTranslation();
  const reduced = usePrefersReducedMotion();
  const seats = useSeats(total);
  const ref = useRef<HTMLDivElement>(null);
  const [play, setPlay] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) { setPlay(true); return; }
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach((e) => { if (e.isIntersecting) { setPlay(true); obs.disconnect(); } });
    }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
  const rows = [
    { key: 'yes', label: t('proposal.support'), color: 'var(--bc-yper)', n: yes },
    { key: 'no', label: t('proposal.oppose'), color: 'var(--bc-kata)', n: no },
    { key: 'abstain', label: t('proposal.abstain'), color: 'var(--bc-apochi)', n: abstain },
  ];
  const seatColor = (i: number) =>
    i < yes ? 'var(--bc-yper)' : i < yes + abstain ? 'var(--bc-apochi)' : 'var(--bc-kata)';
  const partPct = Math.round(participationPct * 100);
  const quorPct = Math.round(quorumPct * 100);

  return (
    <div
      ref={ref}
      data-testid="broadcast-results"
      style={{ background: 'var(--bc-ground)', color: 'var(--bc-ink)', borderRadius: 'var(--radius)', overflow: 'hidden' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--sp-4)', padding: 'var(--sp-6) var(--sp-6) 0', flexWrap: 'wrap' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '1.25rem', color: 'var(--bc-ink)', margin: 0, maxWidth: '30ch' }}>
          {title || t('vote.panelTitle')}
        </h3>
        {live && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-2)', fontFamily: 'var(--font-data)', fontSize: '.75rem', letterSpacing: '.18em', color: 'var(--bc-ink-soft)', whiteSpace: 'nowrap' }}>
            <span style={{ width: 8, height: 8, background: 'var(--bc-live)', display: 'inline-block' }} />
            {(t('vote.live') || 'ΣΕ ΕΞΕΛΙΞΗ').toUpperCase()}
          </span>
        )}
      </div>

      <div className="bc-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--sp-6)', padding: 'var(--sp-6)', alignItems: 'end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
          <svg viewBox="0 0 400 215" role="img" style={{ width: '100%', height: 'auto', display: 'block' }}
               aria-label={t('proposal.totalVotes', { count: total })}>
            {seats.map((s, i) => (
              <circle key={i} cx={s.x.toFixed(1)} cy={s.y.toFixed(1)} r={total > 120 ? 4.2 : 5} fill={seatColor(i)}
                style={reduced ? undefined : { opacity: play ? 1 : 0, transition: `opacity 260ms ease-out ${Math.min(i * 5, 1200)}ms` }} />
            ))}
          </svg>
          <span style={{ textAlign: 'center', fontFamily: 'var(--font-data)', fontSize: '.75rem', letterSpacing: '.12em', color: 'var(--bc-ink-soft)' }}>
            {t('proposal.totalVotes', { count: total })}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
          {rows.map((r) => (
            <div key={r.key} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--sp-3)', borderBottom: '1px solid var(--bc-line)', paddingBottom: 'var(--sp-2)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', minWidth: 0 }}>
                <span style={{ width: '.85rem', height: '.85rem', background: r.color, flexShrink: 0 }} />
                <span style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontFamily: 'var(--font-data)', fontSize: '.7rem', letterSpacing: '.1em', color: 'var(--bc-ink-soft)' }}>{r.label}</span>
                  <span style={{ fontFamily: 'var(--font-data)', fontSize: '.7rem', color: 'var(--bc-ink-soft)', fontVariantNumeric: 'tabular-nums' }}>{r.n}</span>
                </span>
              </span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.9rem, 9vw, 2.6rem)', lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: r.color, whiteSpace: 'nowrap' }}>
                <CountUp target={pct(r.n)} reduced={reduced} play={play} /><span style={{ fontSize: '1rem' }}>%</span>
              </span>
            </div>
          ))}
          <div style={{ marginTop: 'var(--sp-1)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-data)', fontSize: '.75rem', letterSpacing: '.08em', color: 'var(--bc-ink-soft)' }}>
              <span>{(t('vote.participationShort') || 'ΣΥΜΜΕΤΟΧΗ')} {partPct}%</span>
              {quorPct > 0 && <span style={{ color: meetsQuorum ? 'var(--bc-yper)' : 'var(--bc-live)' }}>{(t('vote.quorumShort') || 'ΑΠΑΡΤΙΑ')} {quorPct}%</span>}
            </div>
            <div style={{ height: 6, background: 'var(--bc-panel)', position: 'relative' }}>
              <div style={{ height: '100%', background: 'var(--bc-ink)', width: play ? `${partPct}%` : 0, transition: reduced ? undefined : 'width var(--t-ceremony)' }} />
              {quorPct > 0 && <div style={{ position: 'absolute', top: -4, bottom: -4, width: 2, background: 'var(--bc-live)', left: `${quorPct}%` }} />}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (min-width: 720px) { [data-testid="broadcast-results"] .bc-grid { grid-template-columns: 5fr minmax(0, 4fr); } }
      `}</style>
    </div>
  );
}
