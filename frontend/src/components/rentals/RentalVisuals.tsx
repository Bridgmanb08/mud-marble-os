import { useEffect, useRef, useState, type ReactNode } from 'react';

// Shared animated-on-mount primitives for the rental dashboard widgets --
// a radial progress ring, a horizontal fill bar, and a small "ticker" chip --
// so every widget "loads in" the same way instead of each hand-rolling its
// own transition. All three honor prefers-reduced-motion by jumping straight
// to the final value instead of animating.

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

// Counts a headline number up from 0 to `target` on mount (and again if
// `target` changes on reload) using an ease-out curve -- makes a $ figure or
// % feel alive instead of just appearing.
export function useCountUp(target: number, durationMs = 800): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }
    startRef.current = null;
    let raf = 0;
    function tick(ts: number) {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const t = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return value;
}

interface RadialProgressProps {
  pct: number; // 0-100
  size?: number;
  thickness?: number;
  color: string;
  trackColor?: string;
  children?: ReactNode; // centered content (headline number + caption)
}

// An animated SVG donut ring -- the fill sweeps in on mount rather than
// appearing static, matching the "does an animation, looks cool" ask.
export function RadialProgress({ pct, size = 84, thickness = 9, color, trackColor = 'var(--border)', children }: RadialProgressProps) {
  const clamped = Math.max(0, Math.min(100, pct));
  const [animatedPct, setAnimatedPct] = useState(() => (prefersReducedMotion() ? clamped : 0));

  useEffect(() => {
    if (prefersReducedMotion()) {
      setAnimatedPct(clamped);
      return;
    }
    const raf = requestAnimationFrame(() => setAnimatedPct(clamped));
    return () => cancelAnimationFrame(raf);
  }, [clamped]);

  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - animatedPct / 100);

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={thickness} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(0.16,1,0.3,1)' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  );
}

interface AnimatedBarProps {
  pct: number; // 0-100
  color: string;
  trackColor?: string;
  height?: number;
  delayMs?: number;
}

// A horizontal fill bar whose width sweeps in from 0 on mount, with an
// optional stagger delay so a list of rows reveals as a little waterfall
// instead of popping in all at once.
export function AnimatedBar({ pct, color, trackColor = 'var(--border)', height = 7, delayMs = 0 }: AnimatedBarProps) {
  const clamped = Math.max(0, Math.min(100, pct));
  const [width, setWidth] = useState(() => (prefersReducedMotion() ? clamped : 0));

  useEffect(() => {
    if (prefersReducedMotion()) {
      setWidth(clamped);
      return;
    }
    const t = setTimeout(() => setWidth(clamped), delayMs);
    return () => clearTimeout(t);
  }, [clamped, delayMs]);

  return (
    <div style={{ height, borderRadius: height / 2, background: trackColor, overflow: 'hidden' }}>
      <div
        style={{
          height: '100%',
          width: `${width}%`,
          background: color,
          borderRadius: height / 2,
          transition: 'width 0.7s cubic-bezier(0.16,1,0.3,1)',
        }}
      />
    </div>
  );
}

interface StatusDotProps {
  color: string;
  title?: string;
  delayMs?: number;
  size?: number;
}

// A small square "ticker" chip that pops in with a slight bounce -- used as
// a per-unit indicator (paid/partial/none, occupied/vacant) so a whole
// portfolio reads as one scannable image instead of a list of numbers.
export function StatusDot({ color, title, delayMs = 0, size = 14 }: StatusDotProps) {
  const [shown, setShown] = useState(() => prefersReducedMotion());

  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(true);
      return;
    }
    const t = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);

  return (
    <div
      title={title}
      style={{
        width: size,
        height: size,
        borderRadius: 4,
        background: color,
        transform: shown ? 'scale(1)' : 'scale(0.3)',
        opacity: shown ? 1 : 0,
        transition: 'transform 0.35s cubic-bezier(0.34,1.56,0.64,1), opacity 0.25s',
      }}
    />
  );
}
