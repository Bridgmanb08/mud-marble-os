import type { ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IconGripVertical, IconEye, IconEyeOff, IconTrash, IconChevronUp, IconChevronDown } from '@tabler/icons-react';
import { useIsMobile } from '../../hooks/useMediaQuery';

interface WidgetShellProps {
  id: string;
  title: string;
  editMode: boolean;
  visible: boolean;
  onToggleVisible: () => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  wide?: boolean;
  children: ReactNode;
}

export function WidgetShell({
  id,
  title,
  editMode,
  visible,
  onToggleVisible,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  wide,
  children,
}: WidgetShellProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  // Drag-to-reorder relies on a mouse-precision drag gesture (PointerSensor)
  // that's unreliable on a touchscreen inside a scrolling page -- same call
  // made for Kanban's tap-to-open status menu. On mobile the grip handle is
  // swapped for explicit up/down move buttons that call the exact same
  // reorder path (Dashboard.tsx's moveWidget -> persist), just triggered by
  // a tap instead of a drag gesture.
  const isMobile = useIsMobile();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : visible || editMode ? 1 : 0,
    display: !visible && !editMode ? 'none' : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, gridColumn: wide ? '1 / -1' : undefined }}
      className="card"
      data-widget={id}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
        {editMode &&
          (isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <button
                type="button"
                className="btn-reset"
                onClick={onMoveUp}
                disabled={!canMoveUp}
                title="Move up"
                style={{ display: 'flex', color: canMoveUp ? 'var(--t2)' : 'var(--t3)', opacity: canMoveUp ? 1 : 0.35 }}
              >
                <IconChevronUp size={16} />
              </button>
              <button
                type="button"
                className="btn-reset"
                onClick={onMoveDown}
                disabled={!canMoveDown}
                title="Move down"
                style={{ display: 'flex', color: canMoveDown ? 'var(--t2)' : 'var(--t3)', opacity: canMoveDown ? 1 : 0.35 }}
              >
                <IconChevronDown size={16} />
              </button>
            </div>
          ) : (
            <span {...attributes} {...listeners} style={{ cursor: 'grab', color: 'var(--t3)', display: 'flex' }}>
              <IconGripVertical size={16} />
            </span>
          ))}
        <div className="st" style={{ flex: 1 }}>
          {title}
        </div>
        {editMode && (
          <>
            <button className="btn btn-ghost btn-sm" onClick={onToggleVisible} title={visible ? 'Hide' : 'Show'}>
              {visible ? <IconEye size={14} /> : <IconEyeOff size={14} />}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                if (confirm(`Remove "${title}" from your dashboard? You can add it back later from "Add widget".`)) {
                  onRemove();
                }
              }}
              title="Remove"
            >
              <IconTrash size={14} />
            </button>
          </>
        )}
      </div>
      <div style={{ padding: 20, opacity: editMode && !visible ? 0.4 : 1 }}>{children}</div>
    </div>
  );
}
