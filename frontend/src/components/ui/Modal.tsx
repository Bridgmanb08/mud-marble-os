import { useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { IconArrowsDiagonal2 } from '@tabler/icons-react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  xl?: boolean;
  // Adds a drag handle in the bottom-right corner for dense/table-heavy
  // modals (a long line-item review list, a worksheet) where the default
  // width/height genuinely cramps the content. Dragging grows the box on
  // BOTH sides at once (2x the drag delta) rather than just the corner
  // being pulled, so it stays centered in the viewport the whole time,
  // matching how the overlay already centers it via flex -- no separate
  // position tracking needed, just width/height.
  resizable?: boolean;
}

const MIN_WIDTH = 360;
const MIN_HEIGHT = 240;
const VIEWPORT_MARGIN = 64; // leaves breathing room so a max-drag resize never touches the screen edge

export function Modal({ title, onClose, children, wide, xl, resizable }: ModalProps) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  function handleResizeStart(e: PointerEvent<HTMLDivElement>) {
    const box = boxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    dragStart.current = { x: e.clientX, y: e.clientY, width: rect.width, height: rect.height };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleResizeMove(e: PointerEvent<HTMLDivElement>) {
    const start = dragStart.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const maxWidth = window.innerWidth - VIEWPORT_MARGIN;
    const maxHeight = window.innerHeight - VIEWPORT_MARGIN;
    setSize({
      width: Math.min(maxWidth, Math.max(MIN_WIDTH, start.width + dx * 2)),
      height: Math.min(maxHeight, Math.max(MIN_HEIGHT, start.height + dy * 2)),
    });
  }

  function handleResizeEnd(e: PointerEvent<HTMLDivElement>) {
    dragStart.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  return (
    <div
      className="mo"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={boxRef}
        className={`mb${xl ? ' xl' : wide ? ' wide' : ''}${resizable ? ' mb-resizable' : ''}`}
        style={size ? { width: size.width, height: size.height, maxHeight: size.height } : undefined}
      >
        <div className="mt">{title}</div>
        {children}
        {resizable && (
          <div
            className="mb-resize-handle"
            title="Drag to resize"
            onPointerDown={handleResizeStart}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeEnd}
          >
            <IconArrowsDiagonal2 size={13} />
          </div>
        )}
      </div>
    </div>
  );
}
