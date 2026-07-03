/**
 * CEREMONY III — the sortition draw.
 *
 * The selection of the citizen jury, rendered with gravity. The chosen
 * members surface one by one in bronze — the moment of the draw.
 *
 * HONEST FRAMING: the server selects by a cryptographically-secure,
 * rejection-sampled Fisher–Yates shuffle (crypto.getRandomValues), with
 * the seed recorded for audit. It is unbiased random selection — NOT a
 * deterministic seed→member function the public can recompute. The copy
 * here reflects exactly that; it does not claim recompute-to-verify.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '@/hooks/use-translation';
import { GreekKeyRule } from './GreekKeyRule';

interface Member {
  memberId: number;
  name: string | null;
  username: string;
  responded: boolean;
}

interface Props {
  seed: string | null;
  size: number;
  members: Member[];
  /** Draw is settled (selectedAt present) → reveal on view; else quiet. */
  settled: boolean;
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

export function SortitionDraw({ seed, size, members, settled }: Props) {
  const { t } = useTranslation();
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(reduced || !settled ? members.length : 0);

  const seedGroups = useMemo(() => {
    if (!seed) return null;
    const clean = seed.replace(/[^a-f0-9]/gi, '');
    return (clean.match(/.{1,8}/g) ?? [clean]).slice(0, 4).join(' ');
  }, [seed]);

  useEffect(() => {
    if (!settled || reduced) { setRevealed(members.length); return; }
    const el = ref.current;
    const start = () => {
      let i = 0;
      const tick = () => {
        i += 1;
        setRevealed(i);
        if (i < members.length) window.setTimeout(tick, 550);
      };
      window.setTimeout(tick, 400);
    };
    if (!('IntersectionObserver' in window)) { start(); return; }
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach((e) => { if (e.isIntersecting) { start(); obs.disconnect(); } });
    }, { threshold: 0.3 });
    if (el) io.observe(el);
    return () => io.disconnect();
  }, [settled, reduced, members.length]);

  return (
    <div
      ref={ref}
      data-testid="sortition-draw"
      style={{ background: 'var(--surface)', border: '1px solid var(--line-strong)' }}
    >
      <GreekKeyRule />
      <div style={{ padding: 'var(--sp-6)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
          <span style={{ fontSize: '.75rem', letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 600, color: 'var(--bronze)' }}>
            {t('sortition.drawTitle') || 'Η κλήρωση'}
          </span>
          <p style={{ margin: 0, fontSize: '.875rem', color: 'var(--ink-soft)', maxWidth: '60ch' }}>
            {t('sortition.drawRule') ||
              'Κρυπτογραφικά ασφαλής, αμερόληπτη τυχαία επιλογή. Ο σπόρος καταγράφεται για έλεγχο.'}
          </p>
        </div>

        {seedGroups && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
            <span style={{ fontSize: '.7rem', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
              {t('sortition.drawSeed') || 'Καταγεγραμμένος σπόρος'}
            </span>
            <code style={{ fontFamily: 'var(--font-data)', fontSize: '.8rem', color: 'var(--bronze-deep)', background: 'var(--bronze-wash)', border: '1px solid var(--line)', padding: 'var(--sp-2) var(--sp-3)', wordBreak: 'break-all' }}>
              {seedGroups}
            </code>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
          <span style={{ fontSize: '.7rem', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
            {t('sortition.drawChosen', { n: members.length, size }) || `Εκλέχθηκαν ${members.length} / ${size}`}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {members.map((m, i) => {
              const shown = i < revealed;
              return (
                <div
                  key={m.memberId}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
                    padding: 'var(--sp-2) var(--sp-3)',
                    borderBottom: '1px solid var(--line)',
                    boxShadow: shown ? 'inset 3px 0 0 var(--bronze)' : 'inset 3px 0 0 transparent',
                    background: shown ? 'var(--bronze-wash)' : 'transparent',
                    opacity: shown ? 1 : 0.35,
                    transition: reduced ? undefined : 'opacity 300ms ease-out, background 300ms ease-out, box-shadow 300ms ease-out',
                  }}
                >
                  <span style={{ fontFamily: 'var(--font-data)', fontSize: '.75rem', color: 'var(--ink-faint)', width: '2.5rem', flexShrink: 0 }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: '.875rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {m.name || m.username}
                  </span>
                  {shown && (
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '.7rem', letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 600, color: 'var(--bronze-deep)', flexShrink: 0 }}>
                      {t('sortition.drawSelected') || 'Εκλέγεται'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <GreekKeyRule />
    </div>
  );
}
