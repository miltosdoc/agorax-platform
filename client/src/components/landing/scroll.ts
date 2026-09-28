/**
 * The scroll engine behind the landing tour.
 *
 * Each scene reads one number, its section's progress, and paints from it
 * by writing CSS variables or SVG attributes straight to the DOM. Nothing
 * goes through React state on a scroll frame, so a scene costs a style
 * write, not a re-render.
 */
import { useEffect, useRef } from 'react';

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** Progress of `t` through the window [a, b], clamped. */
export const span = (t: number, a: number, b: number) => clamp((t - a) / (b - a));

export const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The sticky site header's height; pinned scenes sit just below it. */
export function headerHeight(): number {
  const h = document.querySelector('header');
  return h ? h.getBoundingClientRect().height : 0;
}

/**
 * 0 when the section's top reaches the header, 1 when its bottom leaves the
 * viewport. A section no taller than the viewport flips at mid-screen.
 */
export function sectionProgress(el: HTMLElement): number {
  const r = el.getBoundingClientRect();
  const hdr = headerHeight();
  const travel = r.height - (window.innerHeight - hdr);
  return travel > 0 ? clamp((hdr - r.top) / travel) : r.top < window.innerHeight / 2 ? 1 : 0;
}

/** Scrolls so the section sits at progress `p`. */
export function scrollToProgress(el: HTMLElement, p: number) {
  const hdr = headerHeight();
  const top = el.getBoundingClientRect().top + window.scrollY - hdr;
  const travel = el.offsetHeight - (window.innerHeight - hdr);
  window.scrollTo({ top: top + travel * p, behavior: reducedMotion() ? 'auto' : 'smooth' });
}

/**
 * Calls `paint` on the next animation frame after every scroll or resize,
 * at most once per frame, and once on mount.
 */
export function useScrollFrame(paint: () => void) {
  const ref = useRef(paint);
  ref.current = paint;
  useEffect(() => {
    let queued = false;
    const frame = () => {
      queued = false;
      ref.current();
    };
    const request = () => {
      if (!queued) {
        queued = true;
        requestAnimationFrame(frame);
      }
    };
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request);
    request();
    return () => {
      window.removeEventListener('scroll', request);
      window.removeEventListener('resize', request);
    };
  }, []);
}

/** A small deterministic generator, so every visitor sees the same scatter. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
