import { useEffect, useState } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IconGripVertical, IconChevronUp, IconChevronDown } from '@tabler/icons-react';
import { fmt, fmtD } from '../../../lib/format';
import { DashboardTaskDrawer } from '../DashboardTaskDrawer';
import { api, ApiError } from '../../../api/client';
import { useToast } from '../../ui/Toast';
import { useIsMobile } from '../../../hooks/useMediaQuery';
import type { DashboardSummary } from '../../../types';

const HEALTH_DOT: Record<string, string> = { green: 'dot-g', yellow: 'dot-a', red: 'dot-r' };

export function KeyMetricsWidget({ data }: { data: DashboardSummary }) {
  return (
    <div className="metrics" style={{ marginBottom: 0 }}>
      <div className="metric" style={{ padding: 0, border: 'none' }}>
        <div className="m-label">Active builds</div>
        <div className="m-val">{data.active_project_count}</div>
        <div className="m-sub">on the tools now</div>
      </div>
      <div className="metric" style={{ padding: 0, border: 'none' }}>
        <div className="m-label">Total contract value</div>
        <div className="m-val">{fmt(data.total_contract_value)}</div>
      </div>
      <div className="metric" style={{ padding: 0, border: 'none' }}>
        <div className="m-label">Collected</div>
        <div className="m-val" style={{ color: 'var(--green)' }}>
          {fmt(data.total_collected)}
        </div>
        <div className="m-sub">{data.pct_collected}% of invoiced</div>
      </div>
      <div className="metric" style={{ padding: 0, border: 'none' }}>
        <div className="m-label">Outstanding</div>
        <div className="m-val" style={{ color: data.total_outstanding > 0 ? 'var(--atx)' : undefined }}>
          {fmt(data.total_outstanding)}
        </div>
      </div>
    </div>
  );
}

export function ActiveProjectHealthWidget({ data }: { data: DashboardSummary }) {
  if (!data.active_projects.length) return <div style={{ fontSize: 13, color: 'var(--t2)' }}>No active projects.</div>;
  return (
    <>
      {data.active_projects.map((p) => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
          <span className={`dot ${HEALTH_DOT[p.health_status || 'green']}`} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 500 }}>{p.name}</div>
            <div style={{ fontSize: 11, color: 'var(--t2)' }}>{p.client_name || 'No client'}</div>
          </div>
        </div>
      ))}
    </>
  );
}

type UpcomingTaskItem = DashboardSummary['upcoming_tasks'][number];

function SortableUpcomingRow({
  task,
  onMarkComplete,
  onOpen,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  task: UpcomingTaskItem;
  onMarkComplete: (id: string) => void;
  onOpen: (id: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  // Same drag-is-unreliable-on-touch call as the widget-reorder handle above
  // it -- a tap-to-move pair of buttons replaces the drag handle on mobile,
  // calling the exact same reorder-priority path as a drag would.
  const isMobile = useIsMobile();
  return (
    <div
      ref={setNodeRef}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '7px 0',
        borderBottom: '1px solid var(--border)',
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        background: 'var(--surface)',
        position: 'relative',
        zIndex: isDragging ? 1 : undefined,
      }}
    >
      {isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, flexShrink: 0 }}>
          <button
            type="button"
            className="btn-reset"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            title="Move up"
            style={{ display: 'flex', color: 'var(--t3)', opacity: canMoveUp ? 1 : 0.35 }}
          >
            <IconChevronUp size={12} />
          </button>
          <button
            type="button"
            className="btn-reset"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            title="Move down"
            style={{ display: 'flex', color: 'var(--t3)', opacity: canMoveDown ? 1 : 0.35 }}
          >
            <IconChevronDown size={12} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn-reset"
          {...attributes}
          {...listeners}
          style={{ display: 'flex', flexShrink: 0, color: 'var(--t3)', cursor: 'grab', touchAction: 'none' }}
          title="Drag to reorder"
        >
          <IconGripVertical size={14} />
        </button>
      )}
      <input
        type="checkbox"
        title="Mark complete"
        onChange={() => onMarkComplete(task.id)}
        style={{ cursor: 'pointer', flexShrink: 0 }}
      />
      <button
        type="button"
        className="btn-reset"
        onClick={() => onOpen(task.id)}
        style={{ display: 'flex', flex: 1, minWidth: 0, textAlign: 'left', gap: 10, cursor: 'pointer' }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 500 }}>{task.title}</div>
          <div style={{ fontSize: 11, color: 'var(--t2)' }}>
            {task.project_name || ''}
            {task.assigned_to ? ` · ${task.assigned_to}` : ''}
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--t3)' }}>{fmtD(task.scheduled_end)}</div>
      </button>
    </div>
  );
}

export function UpcomingTasksWidget({ data }: { data: DashboardSummary }) {
  const toast = useToast();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [items, setItems] = useState<UpcomingTaskItem[]>(data.upcoming_tasks);

  useEffect(() => {
    setItems(data.upcoming_tasks);
  }, [data.upcoming_tasks]);

  const visible = items.filter((t) => !dismissed.has(t.id));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function markComplete(id: string) {
    try {
      await api.patch(`/tasks/${id}`, { status: 'complete' });
      setDismissed((prev) => new Set(prev).add(id));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to update task', true);
    }
  }

  // Shared by both the drag handle (desktop) and the up/down buttons
  // (mobile) -- reorders `visible` to `reordered` and persists via the same
  // reorder-priority call either path takes.
  async function applyReorder(reordered: UpcomingTaskItem[]) {
    const previous = items;
    const dismissedItems = items.filter((t) => dismissed.has(t.id));
    setItems([...reordered, ...dismissedItems]);

    try {
      await api.patch('/tasks/reorder-priority', {
        items: reordered.map((t, i) => ({ id: t.id, manual_position: i })),
      });
    } catch (err) {
      setItems(previous);
      toast(err instanceof ApiError ? err.message : 'Failed to save the new order', true);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = visible.findIndex((t) => t.id === active.id);
    const newIndex = visible.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    await applyReorder(arrayMove(visible, oldIndex, newIndex));
  }

  async function moveTask(id: string, direction: -1 | 1) {
    const index = visible.findIndex((t) => t.id === id);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= visible.length) return;
    await applyReorder(arrayMove(visible, index, target));
  }

  if (!visible.length) return <div style={{ fontSize: 13, color: 'var(--t2)' }}>No upcoming tasks.</div>;
  return (
    <>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={visible.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {visible.map((t, i) => (
            <SortableUpcomingRow
              key={t.id}
              task={t}
              onMarkComplete={markComplete}
              onOpen={setOpenTaskId}
              onMoveUp={() => moveTask(t.id, -1)}
              onMoveDown={() => moveTask(t.id, 1)}
              canMoveUp={i > 0}
              canMoveDown={i < visible.length - 1}
            />
          ))}
        </SortableContext>
      </DndContext>
      {openTaskId && <DashboardTaskDrawer taskId={openTaskId} onClose={() => setOpenTaskId(null)} />}
    </>
  );
}

export function RecentActivityWidget({ data }: { data: DashboardSummary }) {
  if (!data.recent_activity.length) return <div style={{ fontSize: 13, color: 'var(--t2)' }}>No recent activity.</div>;
  return (
    <>
      {data.recent_activity.map((n) => (
        <div key={n.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12 }}>
            <strong>{n.author || 'Someone'}</strong> logged a {(n.note_type || 'note').replace('_', ' ')} on{' '}
            <em>{n.project_name || 'a project'}</em>
          </div>
          <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 2 }}>{n.content.slice(0, 120)}</div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{fmtD(n.created_at)}</div>
        </div>
      ))}
    </>
  );
}
