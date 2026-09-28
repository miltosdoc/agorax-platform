/**
 * The user guide's player: eight steps played like a short video on a mock
 * app window. A pointer glides to the element each shot is about and taps
 * it, a caption says what to do, and a segmented bar shows where the film
 * is. It starts by itself the first time it scrolls into view; the visitor
 * can pause, step back and forth (buttons or arrow keys) or jump to a step.
 * Under reduced motion it never plays by itself and the pointer does not
 * glide.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react';
import { reducedMotion } from '@/components/landing/scroll';
import GuideScreen from './GuideScreens';
import type { GuideCopy } from './guide-copy';
import './guide.css';

export default function GuidePlayer({ copy }: { copy: GuideCopy }) {
  const steps = copy.steps;
  const [step, setStep] = useState(0);
  const [shot, setShot] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [finger, setFinger] = useState<{ x: number; y: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const started = useRef(false);

  const current = steps[step];
  const scene = current.shots[shot];

  const go = useCallback(
    (nextStep: number, nextShot = 0) => {
      setEnded(false);
      setStep(Math.max(0, Math.min(steps.length - 1, nextStep)));
      setShot(nextShot);
    },
    [steps.length],
  );

  const forward = useCallback(() => {
    if (shot < current.shots.length - 1) setShot(shot + 1);
    else if (step < steps.length - 1) go(step + 1);
    else {
      setPlaying(false);
      setEnded(true);
    }
  }, [shot, step, current.shots.length, steps.length, go]);

  const back = () => {
    if (shot > 0) setShot(shot - 1);
    else if (step > 0) go(step - 1, steps[step - 1].shots.length - 1);
  };

  // Play: hold each shot for its time, then move on.
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(forward, scene.ms);
    return () => clearTimeout(timer);
  }, [playing, scene.ms, forward]);

  // Start the first time the player is mostly on screen.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || reducedMotion()) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !started.current) {
          started.current = true;
          setPlaying(true);
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // On a phone the steps scroll sideways: keep the current one in view.
  useEffect(() => {
    const list = listRef.current;
    const item = list?.children[step] as HTMLElement | undefined;
    if (!list || !item || list.scrollWidth <= list.clientWidth) return;
    list.scrollTo({ left: item.offsetLeft - list.offsetLeft - 16, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [step]);

  // Point at the shot's element: glide there and light it.
  useLayoutEffect(() => {
    const screen = screenRef.current;
    if (!screen) return;
    screen.querySelectorAll('.guide-hot').forEach((el) => el.classList.remove('guide-hot'));
    const target = scene.target ? screen.querySelector<HTMLElement>(`[data-g="${scene.target}"]`) : null;
    if (!target) {
      setFinger(null);
      return;
    }
    target.classList.add('guide-hot');
    const place = () => {
      const a = screen.getBoundingClientRect();
      const b = target.getBoundingClientRect();
      setFinger({ x: b.left - a.left + b.width / 2, y: b.top - a.top + b.height / 2 });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [step, shot, scene.target]);

  const toggle = () => {
    if (ended) {
      go(0);
      setPlaying(true);
      return;
    }
    setPlaying((p) => !p);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      forward();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      back();
    } else if (e.key === ' ' && e.target === e.currentTarget) {
      e.preventDefault();
      toggle();
    }
  };

  const shots = current.shots.length;
  const url = `agoraxdemocracy.com${current.path}`;

  return (
    <div
      ref={rootRef}
      className="guide grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]"
      tabIndex={0}
      onKeyDown={onKey}
      aria-roledescription="walkthrough"
    >
      {/* ── the steps ── */}
      <ol ref={listRef} className="guide-steps flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0" aria-label={copy.title}>
        {steps.map((st, i) => (
          <li key={st.id} className="shrink-0 lg:shrink">
            <button
              type="button"
              onClick={() => {
                go(i);
                if (!reducedMotion()) setPlaying(true);
              }}
              aria-current={i === step ? 'step' : undefined}
              className={`flex w-full items-center gap-3 rounded-sm border px-3 py-2.5 text-left transition-colors ${
                i === step ? 'border-kyanos bg-kyanos-wash' : 'border-line bg-surface hover:border-line-strong'
              }`}
            >
              <span
                className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  i === step ? 'bg-kyanos text-accent-foreground' : i < step ? 'bg-ink text-paper' : 'bg-sunken text-ink-soft'
                }`}
              >
                {i + 1}
              </span>
              <span className={`whitespace-nowrap text-sm lg:whitespace-normal ${i === step ? 'font-semibold text-ink' : 'text-ink-soft'}`}>{st.title}</span>
            </button>
          </li>
        ))}
      </ol>

      {/* ── the window, the caption, the controls ── */}
      <div className="min-w-0">
        <div className="overflow-hidden rounded-sm border border-line-strong bg-surface shadow-[0_18px_40px_rgba(0,0,0,0.12)]">
          <div className="flex items-center gap-3 border-b border-line bg-sunken px-3 py-2">
            <span className="flex gap-1.5" aria-hidden="true">
              <i className="h-2.5 w-2.5 rounded-full bg-line-strong" />
              <i className="h-2.5 w-2.5 rounded-full bg-line-strong" />
              <i className="h-2.5 w-2.5 rounded-full bg-line-strong" />
            </span>
            <span className="min-w-0 flex-1 truncate rounded-sm bg-surface px-3 py-1 font-mono text-[11px] text-ink-faint">{url}</span>
          </div>
          <div ref={screenRef} className="guide-screen relative h-[400px] overflow-hidden bg-paper sm:h-[430px]" aria-hidden="true">
            <div key={`${current.id}-${shot}`} className="guide-shot h-full">
              <GuideScreen step={current.id} phase={shot} samples={copy.samples} />
            </div>
            {finger && (
              <span className="guide-finger" style={{ left: finger.x, top: finger.y }}>
                <span key={`${step}-${shot}`} className="guide-tap" />
              </span>
            )}
          </div>
        </div>

        <p className="mt-4 min-h-[3.5rem] text-lg leading-snug text-ink sm:text-xl" aria-live="polite">
          <span className="mr-2 text-sm font-semibold text-kyanos">{copy.stepOf(step + 1, steps.length)} ·</span>
          {scene.caption}
        </p>

        <div className="mt-3 flex items-center gap-3">
          <button type="button" onClick={back} className="guide-ctl" aria-label={copy.prev} disabled={step === 0 && shot === 0}>
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <button type="button" onClick={toggle} className="guide-ctl guide-play" aria-label={ended ? copy.replay : playing ? copy.pause : copy.play}>
            {ended ? <RotateCcw className="h-5 w-5" aria-hidden="true" /> : playing ? <Pause className="h-5 w-5" aria-hidden="true" /> : <Play className="h-5 w-5" aria-hidden="true" />}
          </button>
          <button type="button" onClick={forward} className="guide-ctl" aria-label={copy.next}>
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="flex flex-1 gap-1" aria-hidden="true">
            {steps.map((st, i) => (
              <span key={st.id} className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken">
                {i < step && <span className="block h-full w-full bg-kyanos" />}
                {i === step && (
                  <span
                    key={`${step}-${shot}`}
                    className="guide-fill block h-full bg-kyanos"
                    style={
                      {
                        '--from': `${(shot / shots) * 100}%`,
                        '--to': `${((shot + 1) / shots) * 100}%`,
                        animationDuration: `${scene.ms}ms`,
                        animationPlayState: playing ? 'running' : 'paused',
                      } as React.CSSProperties
                    }
                  />
                )}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
