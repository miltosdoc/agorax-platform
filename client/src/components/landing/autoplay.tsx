/**
 * Demos that play themselves, like a short film, until the visitor takes over.
 *
 * A demo hands over its script as steps: run this, then wait so long. The
 * script loops while the demo is on screen and waits where it was while it
 * is off screen. Any click of the visitor's own stops it for good (they are
 * exploring now), and the toggle starts it again from the top. Reduced
 * motion never autoplays.
 */
import { useEffect, useRef, useState } from 'react';
import { reducedMotion } from './scroll';

export interface Step {
  /** How long to hold after this step before the next one. */
  ms: number;
  run: () => void;
}

export interface AutoplayCopy {
  playing: string;
  play: string;
}

export function useAutoplay<T extends Element>(steps: Step[]) {
  const ref = useRef<T>(null);
  const [playing, setPlaying] = useState(() => !reducedMotion());
  const script = useRef(steps);
  script.current = steps;

  useEffect(() => {
    const el = ref.current;
    if (!playing || !el) return;
    let visible = false;
    let i = 0;
    let timer = 0;
    const tick = () => {
      if (!visible) {
        timer = window.setTimeout(tick, 300);
        return;
      }
      const list = script.current;
      const step = list[i % list.length];
      i += 1;
      step.run();
      timer = window.setTimeout(tick, step.ms);
    };
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    timer = window.setTimeout(tick, 500);
    return () => {
      clearTimeout(timer);
      io.disconnect();
    };
  }, [playing]);

  return {
    ref,
    playing,
    stop: () => setPlaying(false),
    toggle: () => setPlaying((p) => !p),
    /** Wraps a visitor's own action so it also stops the playback. */
    own:
      <A extends unknown[]>(fn: (...args: A) => void) =>
      (...args: A) => {
        setPlaying(false);
        fn(...args);
      },
  };
}

export function AutoplayToggle({ playing, onToggle, copy }: { playing: boolean; onToggle: () => void; copy: AutoplayCopy }) {
  return (
    <button type="button" className={`tour-auto${playing ? ' on' : ''}`} onClick={onToggle} aria-pressed={playing}>
      <span className="ic" aria-hidden="true">{playing ? '❚❚' : '▶'}</span>
      {playing ? copy.playing : copy.play}
    </button>
  );
}
