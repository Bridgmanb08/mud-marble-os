import { useEffect, useState } from 'react';
import {
  DndContext,
  closestCorners,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IconMessageCircle, IconChecklist, IconLock } from '@tabler/icons-react';
import { api } from '../../api/client';
import { useToast } from '../ui/Toast';
import { fmtD } from '../../lib/format';
import type { Task } from '../../types';

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

function TaskCard({ task, onClick, dragDisabled }: { task: Task; onClick: () => void; dragDisabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: dragDisabled,
  });
  const overdue = task.scheduled_end && new Date(task.scheduled_end) < new Date() && task.status !== 'complete';

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
      <div className="task-title">{task.title}</div>
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
      <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
        {task.subtask_total > 0 && (
          <span style={{ fontSize: 10, color: 'var(--t2)', display: 'flex', alignItems: 'center', gap: 3 }}>
            <IconChecklist size={11} /> {task.subtask_complete}/{task.subtask_total}
          </span>
        )}
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
    </div>
  );
}

function Column({ id, label, taskIds, tasksById, onTaskClick, onAddTask, dragDisabled }: {
  id: string;
  label: string;
  taskIds: string[];
  tasksById: Map<string, Task>;
  onTaskClick: (id: string) => void;
  onAddTask: () => void;
  dragDisabled: boolean;
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
          return <TaskCard key={id} task={t} onClick={() => onTaskClick(id)} dragDisabled={dragDisabled} />;
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
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function findColumn(id: string): string | undefined {
    return Object.keys(columns).find((col) => columns[col].includes(id));
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

    const items = Object.entries(finalColumns).flatMap(([status, ids]) =>
      ids.map((id, index) => ({ id, status, position: index }))
    );
    try {
      await api.patch('/tasks/reorder', { items });
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to save the new order — reloading', true);
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
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
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
            />
          ))}
        </div>
      </DndContext>
    </>
  );
}
