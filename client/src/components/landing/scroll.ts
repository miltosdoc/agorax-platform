/**
 * The scroll engine behind the landing tour.
 *
 * Each scene reads one number, its section's progress, and paints from it
 * by writing CSS variables or SVG attributes straight to the DOM. Nothing
 * goes through React state on a scroll frame, so a scene costs a style
 * write, not a re-render.
 *
 * Two rules keep scrolling smooth on slow machines. Geometry is measured
 * only when the layout changes (a resize, or the page growing as data and
 * fonts arrive), never inside a frame, so a frame never forces the browser
 * to lay the page out between one scene's writes and the next scene's
 * reads. And every scene paints from one shared animation frame per scroll
 * event instead of queuing its own.
 */
import { useEffect, useRef } from 'react';

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** Progress of `t` through the window [a, b], clamped. */
export const span = (t: number, a: number, b: number) => clamp((t - a) / (b - a));

export const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── layout cache ─────────────────────────────────────────── */

const boxes = new Map<Element, { top: number; height: number }>();
let header = 0;
let docHeight = 0;
let dirty = true;
let observing = false;

function observeLayout() {
  if (observing || typeof ResizeObserver === 'undefined') return;
  observing = true;
  const invalidate = () => {
    dirty = true;
  };
  const ro = new ResizeObserver(invalidate);
  ro.observe(document.body);
  const h = document.querySelector('header');
  if (h) ro.observe(h);
  window.addEventListener('resize', invalidate);
}

function measure() {
  observeLayout();
  const h = document.querySelector('header');
  header = h ? h.getBoundingClientRect().height : 0;
  docHeight = document.documentElement.scrollHeight;
  const y = window.scrollY;
  boxes.forEach((_, el) => {
    boxes.set(el, { top: el.getBoundingClientRect().top + y, height: (el as HTMLElement).offsetHeight });
  });
  dirty = false;
}

function box(el: Element) {
  if (!boxes.has(el)) {
    boxes.set(el, { top: 0, height: 0 });
    dirty = true;
  }
  if (dirty) measure();
  return boxes.get(el)!;
}

/** The sticky site header's height; pinned scenes sit just below it. */
export function headerHeight(): number {
  if (dirty) measure();
  return header;
}

/** The page's full scroll height, from the cache. */
export function pageHeight(): number {
  if (dirty) measure();
  return docHeight;
}

/** The element's top edge in page coordinates, from the cache. */
export function pageTop(el: Element): number {
  return box(el).top;
}

/**
 * 0 when the section's top reaches the header, 1 when its bottom leaves the
 * viewport. A section no taller than the viewport flips at mid-screen.
 */
export function sectionProgress(el: HTMLElement): number {
  const { top, height } = box(el);
  const hdr = header;
  const viewTop = top - window.scrollY;
  const travel = height - (window.innerHeight - hdr);
  return travel > 0 ? clamp((hdr - viewTop) / travel) : viewTop < window.innerHeight / 2 ? 1 : 0;
}

/** Scrolls so the section sits at progress `p`. */
export function scrollToProgress(el: HTMLElement, p: number) {
  const { top, height } = box(el);
  const travel = height - (window.innerHeight - header);
  window.scrollTo({ top: top - header + travel * p, behavior: reducedMotion() ? 'auto' : 'smooth' });
}

/* ── one frame for every scene ────────────────────────────── */

const painters = new Set<{ current: () => void }>();
let queued = false;

function frame() {
  queued = false;
  painters.forEach((p) => p.current());
}

function request() {
  if (!queued) {
    queued = true;
    requestAnimationFrame(frame);
  }
}

/**
 * Calls `paint` on the shared animation frame after every scroll or resize,
 * at most once per frame, and once on mount.
 */
export function useScrollFrame(paint: () => void) {
  const ref = useRef(paint);
  ref.current = paint;
  useEffect(() => {
    const entry = ref;
    if (painters.size === 0) {
      window.addEventListener('scroll', request, { passive: true });
      window.addEventListener('resize', request);
    }
    painters.add(entry);
    request();
    return () => {
      painters.delete(entry);
      if (painters.size === 0) {
        window.removeEventListener('scroll', request);
        window.removeEventListener('resize', request);
      }
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
