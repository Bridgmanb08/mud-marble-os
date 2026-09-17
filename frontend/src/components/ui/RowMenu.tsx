import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconDots } from '@tabler/icons-react';

// A "..." kebab menu whose dropdown renders into a portal at the very end
// of <body>, positioned with `position: fixed` off the trigger button's own
// on-screen coordinates -- NOT nested inside the row/table it's triggered
// from. A dropdown positioned `absolute` relative to a row inside a
// scrollable table (`.tbl-scroll`, overflow-x: auto) gets silently clipped
// by that ancestor's overflow the moment the row is near the bottom of the
// visible/scrolled area (this is exactly what happened on an invoice row
// near the bottom of the Invoices tab) -- a portal escapes that clipping
// entirely, regardless of which scrollable container the row happens to
// live inside. Shared by every kebab menu in the app (Invoices, Estimates,
// ...) instead of each one repeating its own absolutely-positioned
// dropdown and inheriting the same clipping bug.
export function RowMenu({
  children,
  minWidth = 190,
  onClose,
}: {
  // Render-prop so callers can build whatever menu items they need and
  // still get a `close()` to call after acting on one.
  children: (close: () => void) => ReactNode;
  minWidth?: number;
  // Fires whenever the menu closes for ANY reason, not just a child
  // calling `close()` -- an outside click or a scroll-away closes it too,
  // and a caller with its own sub-state (e.g. an inline "edit" mode inside
  // the menu) needs to know so it can reset that state, the same way the
  // menu itself resets.
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function closeMenu() {
    setOpen(false);
    onClose?.();
  }

  function openMenu() {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setCoords({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || btnRef.current?.contains(target)) return;
      closeMenu();
    }
    // Closes rather than re-tracks position on scroll -- a floating menu
    // that's drifted away from the button it belongs to (or gone stale
    // relative to a row that's scrolled off) is worse than one that just
    // closes. `capture: true` so this fires for a scroll on ANY scrollable
    // ancestor (e.g. `.tbl-scroll`), not only the window itself.
    function handleScroll() {
      closeMenu();
    }
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div style={{ display: 'inline-block' }} onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => (open ? closeMenu() : openMenu())}
        title="More actions"
        aria-label="More actions"
      >
        <IconDots size={16} />
      </button>
      {open &&
        coords &&
        createPortal(
          <div
            ref={menuRef}
            className="card"
            style={{ position: 'fixed', top: coords.top, right: coords.right, padding: 6, minWidth, zIndex: 1000 }}
            onClick={(e) => e.stopPropagation()}
          >
            {children(closeMenu)}
          </div>,
          document.body
        )}
    </div>
  );
}
