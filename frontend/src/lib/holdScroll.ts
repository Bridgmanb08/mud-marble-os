// Keeps the page exactly where it is for a short window after an action
// that re-renders a lot of the page (clicking a phase dot, picking a phase
// date). Something in that re-render -- a native date picker closing, focus
// moving, content above the viewport changing height -- can jump the window
// down a few hundred pixels; this snaps it back every frame until the
// window ends. If the person scrolls themselves (wheel, touch, keys) during
// the window it stands down immediately so it never fights them.
let cancel: (() => void) | null = null;

export function holdScroll(ms = 1500): void {
  cancel?.();
  const y = window.scrollY;
  const x = window.scrollX;
  const end = performance.now() + ms;
  let raf = 0;

  const stop = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('wheel', stop);
    window.removeEventListener('touchmove', stop);
    window.removeEventListener('keydown', stop);
    if (cancel === stop) cancel = null;
  };
  const tick = () => {
    if (Math.abs(window.scrollY - y) > 1 || Math.abs(window.scrollX - x) > 1) window.scrollTo(x, y);
    if (performance.now() < end) raf = requestAnimationFrame(tick);
    else stop();
  };

  cancel = stop;
  window.addEventListener('wheel', stop, { passive: true });
  window.addEventListener('touchmove', stop, { passive: true });
  window.addEventListener('keydown', stop);
  raf = requestAnimationFrame(tick);
}
