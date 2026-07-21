import { useEffect, useRef, useState } from 'react';
import {
  DndContext,
  closestCorners,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IconMessageCircle, IconChecklist, IconLock, IconChevronDown, IconChevronRight, IconPlus } from '@tabler/icons-react';
import { api, ApiError } from '../../api/client';
import { useToast } from '../ui/Toast';
import { fmtD } from '../../lib/format';
import type { Task, TaskSubtask } from '../../types';

const COLUMNS = [
  { id: 'upcoming', label: 'To Do' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'delayed', label: 'Delayed / Blocked' },
  { id: 'complete', label: 'Done' },
];

const PRIORITY_COLOR: Record<string, string> = {
  low: 'var(--green)',
  normal: 'var(--border-md)',
  high: 'var(--amber)',
  urgent: 'var(--red)',
};

function SubtaskChecklist({ taskId, onChanged }: { taskId: string; onChanged: () => void }) {
  const toast = useToast();
  const [subtasks, setSubtasks] = useState<TaskSubtask[] | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<TaskSubtask[]>(`/tasks/${taskId}/subtasks`)
      .then((rows) => {
        if (!cancelled) setSubtasks(rows);
      })
      .catch(() => {
        if (!cancelled) setSubtasks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  async function toggle(s: TaskSubtask) {
    setSubtasks((prev) => (prev ? prev.map((x) => (x.id === s.id ? { ...x, is_complete: !x.is_complete } : x)) : prev));
    try {
      await api.patch(`/tasks/${taskId}/subtasks/${s.id}`, { is_complete: !s.is_complete });
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to update subtask', true);
      setSubtasks((prev) => (prev ? prev.map((x) => (x.id === s.id ? { ...x, is_complete: s.is_complete } : x)) : prev));
    }
  }

  async function add() {
    if (!newTitle.trim() || busy) return;
    setBusy(true);
    try {
      const created = await api.post<TaskSubtask>(`/tasks/${taskId}/subtasks`, { title: newTitle.trim() });
      setSubtasks((prev) => [...(prev || []), created]);
      setNewTitle('');
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to add subtask', true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="task-subtasks" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {subtasks === null ? (
        <div className="task-meta">Loading…</div>
      ) : (
        <>
          {subtasks.map((s) => (
            <label key={s.id} className="task-subtask-row">
              <input type="checkbox" checked={s.is_complete} onChange={() => toggle(s)} />
              <span className={s.is_complete ? 'done' : ''}>{s.title}</span>
            </label>
          ))}
          <div className="task-subtask-add">
            <input
              className="fi"
              placeholder="Add subtask…"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  add();
                }
              }}
            />
            <button type="button" className="btn btn-ghost btn-sm" onClick={add} disabled={busy || !newTitle.trim()}>
              <IconPlus size={13} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function TaskCard({
  task,
  onClick,
  dragDisabled,
  onChanged,
}: {
  task: Task;
  onClick: () => void;
  dragDisabled: boolean;
  onChanged: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: dragDisabled,
  });
  const [expanded, setExpanded] = useState(false);
  const overdue = task.overdue;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className="task-card"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        borderLeft: `3px solid ${PRIORITY_COLOR[task.priority] || 'var(--border-md)'}`,
      }}
    >
      <div className="task-title">
        {task.is_punch_list && (
          <span className="badge bg-purple" style={{ marginRight: 6, fontSize: 9, padding: '1px 6px', verticalAlign: 2 }}>
            Punch
          </span>
        )}
        {task.title}
      </div>
      <div className="task-meta">{task.projects?.name?.replace(/\|.*/, '').trim() || 'No project'}</div>
      {task.assigned_to && (
        <div className="task-meta" style={{ marginTop: 3 }}>
          <span style={{ background: 'var(--bbg)', color: 'var(--btx)', padding: '1px 6px', borderRadius: 10, fontSize: 10 }}>
            {task.assigned_to}
          </span>
        </div>
      )}
      {task.scheduled_end && (
        <div className="task-meta" style={{ marginTop: 3, color: overdue ? 'var(--red)' : undefined, fontWeight: overdue ? 500 : undefined }}>
          {overdue ? '⚠ ' : ''}Due {fmtD(task.scheduled_end)}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn-reset task-subtask-toggle"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{ fontSize: 10, color: 'var(--t2)', display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}
        >
          {expanded ? <IconChevronDown size={11} /> : <IconChevronRight size={11} />}
          <IconChecklist size={11} />
          {task.subtask_total > 0 ? `${task.subtask_complete}/${task.subtask_total}` : 'Add subtask'}
        </button>
        {task.comment_count > 0 && (
          <span style={{ fontSize: 10, color: 'var(--t2)', display: 'flex', alignItems: 'center', gap: 3 }}>
            <IconMessageCircle size={11} /> {task.comment_count}
          </span>
        )}
        {task.blocked && (
          <span style={{ fontSize: 10, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 3 }}>
            <IconLock size={11} /> Blocked
          </span>
        )}
      </div>
      {expanded && <SubtaskChecklist taskId={task.id} onChanged={onChanged} />}
    </div>
  );
}

function Column({
  id,
  label,
  taskIds,
  tasksById,
  onTaskClick,
  onAddTask,
  dragDisabled,
  onChanged,
}: {
  id: string;
  label: string;
  taskIds: string[];
  tasksById: Map<string, Task>;
  onTaskClick: (id: string) => void;
  onAddTask: () => void;
  dragDisabled: boolean;
  onChanged: () => void;
}) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <div className="col" ref={setNodeRef}>
      <div className="col-hd">
        <span>{label}</span>
        <span style={{ background: 'var(--border)', padding: '1px 7px', borderRadius: 10, fontSize: 11 }}>{taskIds.length}</span>
      </div>
      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        {taskIds.map((id) => {
          const t = tasksById.get(id);
          if (!t) return null;
          return <TaskCard key={id} task={t} onClick={() => onTaskClick(id)} dragDisabled={dragDisabled} onChanged={onChanged} />;
        })}
      </SortableContext>
      <button className="btn btn-ghost btn-sm" style={{ width: '100%', marginTop: 6, color: 'var(--t2)', justifyContent: 'center' }} onClick={onAddTask}>
        + Add
      </button>
    </div>
  );
}

export function KanbanBoard({
  tasks,
  onTaskClick,
  onAddTask,
  onChanged,
  filtersActive,
}: {
  tasks: Task[];
  onTaskClick: (id: string) => void;
  onAddTask: (status: string) => void;
  onChanged: () => void;
  filtersActive?: boolean;
}) {
  const toast = useToast();
  const [columns, setColumns] = useState<Record<string, string[]>>({});
  const tasksById = new Map(tasks.map((t) => [t.id, t]));
  const snapshotRef = useRef<Record<string, string[]> | null>(null);

  useEffect(() => {
    const grouped: Record<string, string[]> = { upcoming: [], in_progress: [], delayed: [], complete: [] };
    for (const t of tasks) {
      const col = t.status === 'blocked' ? 'delayed' : grouped[t.status] ? t.status : 'upcoming';
      grouped[col].push(t.id);
    }
    setColumns(grouped);
  }, [tasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function findColumn(id: string): string | undefined {
    return Object.keys(columns).find((col) => columns[col].includes(id));
  }

  function handleDragStart(_event: DragStartEvent) {
    // Snapshot so we can cleanly roll back if the server rejects this move
    // (stale version, someone else moved the board, etc.) instead of leaving
    // the UI in a state that doesn't match what was actually saved.
    snapshotRef.current = columns;
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeCol = findColumn(active.id as string);
    const overCol = COLUMNS.some((c) => c.id === over.id) ? (over.id as string) : findColumn(over.id as string);
    if (!activeCol || !overCol || activeCol === overCol) return;

    setColumns((prev) => {
      const activeItems = prev[activeCol].filter((id) => id !== active.id);
      const overItems = [...prev[overCol], active.id as string];
      return { ...prev, [activeCol]: activeItems, [overCol]: overItems };
    });
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const rollback = snapshotRef.current;
    snapshotRef.current = null;

    if (!over) return;
    const activeCol = findColumn(active.id as string);
    const overCol = COLUMNS.some((c) => c.id === over.id) ? (over.id as string) : findColumn(over.id as string);
    if (!activeCol || !overCol) return;

    let finalColumns = columns;
    if (activeCol === overCol) {
      const oldIndex = columns[activeCol].indexOf(active.id as string);
      const newIndex = columns[activeCol].indexOf(over.id as string);
      if (oldIndex !== newIndex && newIndex !== -1) {
        finalColumns = { ...columns, [activeCol]: arrayMove(columns[activeCol], oldIndex, newIndex) };
        setColumns(finalColumns);
      }
    }

    // Send each task's last-known version so the backend can reject the
    // whole batch (409) if something else changed the board first, rather
    // than silently overwriting a concurrent edit.
    const items = Object.entries(finalColumns).flatMap(([status, ids]) =>
      ids.map((id, index) => ({ id, status, position: index, expected_version: tasksById.get(id)?.version }))
    );

    try {
      await api.patch('/tasks/reorder', { items });
      onChanged();
    } catch (e) {
      if (rollback) setColumns(rollback);
      const message =
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Failed to save the new order';
      toast(message, true);
      onChanged();
    }
  }

  return (
    <>
      {filtersActive && (
        <div className="alert alert-a" style={{ marginBottom: 12 }}>
          Clear filters to drag-and-drop reorder tasks — reordering while a filter hides other tasks in the same
          column could scramble their order.
        </div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="board">
          {COLUMNS.map((col) => (
            <Column
              key={col.id}
              id={col.id}
              label={col.label}
              taskIds={columns[col.id] || []}
              tasksById={tasksById}
              onTaskClick={onTaskClick}
              onAddTask={() => onAddTask(col.id)}
              dragDisabled={Boolean(filtersActive)}
              onChanged={onChanged}
            />
          ))}
        </div>
      </DndContext>
    </>
  );
}
