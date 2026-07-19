import type { ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IconGripVertical, IconEye, IconEyeOff } from '@tabler/icons-react';

interface WidgetShellProps {
  id: string;
  title: string;
  editMode: boolean;
  visible: boolean;
  onToggleVisible: () => void;
  wide?: boolean;
  children: ReactNode;
}

export function WidgetShell({ id, title, editMode, visible, onToggleVisible, wide, children }: WidgetShellProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

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
        {editMode && (
          <span {...attributes} {...listeners} style={{ cursor: 'grab', color: 'var(--t3)', display: 'flex' }}>
            <IconGripVertical size={16} />
          </span>
        )}
        <div className="st" style={{ flex: 1 }}>
          {title}
        </div>
        {editMode && (
          <button className="btn btn-ghost btn-sm" onClick={onToggleVisible} title={visible ? 'Hide' : 'Show'}>
            {visible ? <IconEye size={14} /> : <IconEyeOff size={14} />}
          </button>
        )}
      </div>
      <div style={{ padding: 20, opacity: editMode && !visible ? 0.4 : 1 }}>{children}</div>
    </div>
  );
}
