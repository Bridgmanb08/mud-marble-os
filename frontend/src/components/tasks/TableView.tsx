import { useEffect, useMemo, useState } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IconTrash, IconGripVertical } from '@tabler/icons-react';
import { api } from '../../api/client';
import { useToast } from '../ui/Toast';
import { fmtD } from '../../lib/format';
import type { Task, UserDirectoryEntry } from '../../types';

type SortKey = 'title' | 'status' | 'priority' | 'scheduled_end' | 'assigned_to' | 'manual_position';
export type TaskGroupBy = 'none' | 'project' | 'assigned_to' | 'status';

function TaskTableRow({
  task,
  dragEnabled,
  displayOrder,
  selected,
  onToggleSelect,
  onTaskClick,
}: {
  task: Task;
  dragEnabled: boolean;
  displayOrder: number | null;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onTaskClick: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: !dragEnabled,
  });
  return (
    <tr
      ref={setNodeRef}
      onClick={() => onTaskClick(task.id)}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        position: 'relative',
        background: isDragging ? 'var(--surface)' : undefined,
      }}
    >
      {dragEnabled && (
        <td onClick={(e) => e.stopPropagation()} style={{ width: 24 }}>
          <button
            type="button"
            className="btn-reset"
            {...attributes}
            {...listeners}
            style={{ display: 'flex', cursor: 'grab', color: 'var(--t3)', touchAction: 'none' }}
            title="Drag to reorder"
          >
            <IconGripVertical size={14} />
          </button>
        </td>
      )}
      <td onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={selected} onChange={() => onToggleSelect(task.id)} />
      </td>
      <td style={{ color: 'var(--t2)' }}>{displayOrder != null ? displayOrder + 1 : '—'}</td>
      <td style={{ fontWeight: 500 }}>{task.title}</td>
      <td>{task.projects?.name?.replace(/\|.*/, '').trim() || '—'}</td>
      <td>{task.assigned_to || '—'}</td>
      <td>
        <span className="badge bg-gray">{task.status.replace('_', ' ')}</span>
      </td>
      <td>{task.priority}</td>
      <td style={{ color: task.overdue ? 'var(--red)' : undefined, fontWeight: task.overdue ? 500 : undefined }}>
        {task.overdue ? '⚠ ' : ''}
        {fmtD(task.scheduled_end)}
      </td>
    </tr>
  );
}

export function TableView({
  tasks,
  onTaskClick,
  groupBy,
  onGroupByChange,
  onChanged,
}: {
  tasks: Task[];
  onTaskClick: (id: string) => void;
  groupBy: TaskGroupBy;
  onGroupByChange: (g: TaskGroupBy) => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [sortKey, setSortKey] = useState<SortKey>('scheduled_end');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkAssignee, setBulkAssignee] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [directory, setDirectory] = useState<UserDirectoryEntry[]>([]);
  // Optimistic manual_position overrides, keyed by task id -- cleared once the
  // corresponding task in the `tasks` prop reflects the same value (i.e. the
  // reorder round-tripped through the server and back down via onChanged()).
  const [manualOverride, setManualOverride] = useState<Record<string, number>>({});
  const dragEnabled = sortKey === 'manual_position';

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    api.get<UserDirectoryEntry[]>('/users/directory').then(setDirectory).catch(() => {});
  }, []);

  useEffect(() => {
    setManualOverride((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const t of tasks) {
        if (next[t.id] !== undefined && t.manual_position === next[t.id]) {
          delete next[t.id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [tasks]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const sorted = useMemo(() => {
    const copy = [...tasks];
    if (sortKey === 'manual_position') {
      copy.sort((a, b) => {
        const av = manualOverride[a.id] ?? a.manual_position ?? Infinity;
        const bv = manualOverride[b.id] ?? b.manual_position ?? Infinity;
        if (av !== bv) return sortDir === 'asc' ? av - bv : bv - av;
        return (a.scheduled_end || '').localeCompare(b.scheduled_end || '');
      });
    } else {
      copy.sort((a, b) => {
        const av = String(a[sortKey] ?? '');
        const bv = String(b[sortKey] ?? '');
        const cmp = av.localeCompare(bv);
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    return copy;
  }, [tasks, sortKey, sortDir, manualOverride]);

  const groups = useMemo(() => {
    if (groupBy === 'none') return { All: sorted };
    const out: Record<string, Task[]> = {};
    for (const t of sorted) {
      const key =
        groupBy === 'project'
          ? t.projects?.name?.replace(/\|.*/, '').trim() || 'No project'
          : groupBy === 'assigned_to'
            ? t.assigned_to || 'Unassigned'
            : t.status;
      if (!out[key]) out[key] = [];
      out[key].push(t);
    }
    return out;
  }, [sorted, groupBy]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectGroup(ids: string[]) {
    setSelected((prev) => {
      const allSelected = ids.length > 0 && ids.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  async function handlePriorityReorder(groupItems: Task[], event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = groupItems.findIndex((t) => t.id === active.id);
    const newIndex = groupItems.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(groupItems, oldIndex, newIndex);
    const overrides: Record<string, number> = {};
    reordered.forEach((t, i) => {
      overrides[t.id] = i;
    });
    setManualOverride((prev) => ({ ...prev, ...overrides }));

    try {
      await api.patch('/tasks/reorder-priority', {
        items: reordered.map((t, i) => ({ id: t.id, manual_position: i })),
      });
      onChanged();
    } catch (e) {
      setManualOverride((prev) => {
        const next = { ...prev };
        for (const id of Object.keys(overrides)) delete next[id];
        return next;
      });
      toast(e instanceof Error ? e.message : 'Failed to save the new order', true);
    }
  }

  async function applyBulkStatus() {
    if (!bulkStatus || selected.size === 0) return;
    setBulkBusy(true);
    try {
      await api.patch('/tasks/bulk', { ids: Array.from(selected), status: bulkStatus });
      toast(`Updated ${selected.size} task${selected.size === 1 ? '' : 's'}`);
      setSelected(new Set());
      setBulkStatus('');
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Bulk update failed', true);
    } finally {
      setBulkBusy(false);
    }
  }

  async function applyBulkAssign() {
    if (!bulkAssignee.trim() || selected.size === 0) return;
    setBulkBusy(true);
    try {
      await api.patch('/tasks/bulk', { ids: Array.from(selected), assigned_to: bulkAssignee.trim() });
      toast(`Assigned ${selected.size} task${selected.size === 1 ? '' : 's'}`);
      setSelected(new Set());
      setBulkAssignee('');
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Bulk assign failed', true);
    } finally {
      setBulkBusy(false);
    }
  }

  async function applyBulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} selected task${selected.size === 1 ? '' : 's'}? This cannot be undone.`)) return;
    setBulkBusy(true);
    try {
      await api.post('/tasks/bulk-delete', { ids: Array.from(selected) });
      toast(`Deleted ${selected.size} task${selected.size === 1 ? '' : 's'}`);
      setSelected(new Set());
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Bulk delete failed', true);
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
        {selected.size > 0 ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--t2)' }}>{selected.size} selected</span>
            <select className="fi" style={{ width: 'auto' }} value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} disabled={bulkBusy}>
              <option value="">Set status…</option>
              <option value="upcoming">To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="delayed">Delayed / Blocked</option>
              <option value="complete">Done</option>
            </select>
            <button type="button" className="btn btn-sm" onClick={applyBulkStatus} disabled={!bulkStatus || bulkBusy}>
              Apply
            </button>
            <input
              className="fi"
              style={{ width: 140 }}
              list="bulk-assignee-options"
              placeholder="Assign to…"
              value={bulkAssignee}
              onChange={(e) => setBulkAssignee(e.target.value)}
              disabled={bulkBusy}
            />
            <datalist id="bulk-assignee-options">
              {directory.map((u) => (
                <option key={u.id} value={u.name} />
              ))}
            </datalist>
            <button type="button" className="btn btn-sm" onClick={applyBulkAssign} disabled={!bulkAssignee.trim() || bulkBusy}>
              Apply
            </button>
            <button type="button" className="btn btn-sm" style={{ color: 'var(--red)' }} onClick={applyBulkDelete} disabled={bulkBusy}>
              <IconTrash size={13} /> Delete
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setSelected(new Set())} disabled={bulkBusy}>
              Clear
            </button>
          </div>
        ) : (
          <div />
        )}
        <select className="fi" style={{ width: 'auto' }} value={groupBy} onChange={(e) => onGroupByChange(e.target.value as TaskGroupBy)}>
          <option value="none">No grouping</option>
          <option value="project">Group by project</option>
          <option value="assigned_to">Group by assignee</option>
          <option value="status">Group by status</option>
        </select>
      </div>
      {dragEnabled && (
        <div className="alert alert-a" style={{ marginBottom: 12 }}>
          Sorted by priority — drag the handle to reorder within a group. Switch to another column sort to hide the
          handles.
        </div>
      )}
      {Object.entries(groups).map(([group, items]) => {
        const groupIds = items.map((t) => t.id);
        const groupAllSelected = groupIds.length > 0 && groupIds.every((id) => selected.has(id));
        const tbody = (
          <tbody>
            {items.map((t) => (
              <TaskTableRow
                key={t.id}
                task={t}
                dragEnabled={dragEnabled}
                displayOrder={manualOverride[t.id] ?? t.manual_position}
                selected={selected.has(t.id)}
                onToggleSelect={toggleSelect}
                onTaskClick={onTaskClick}
              />
            ))}
          </tbody>
        );
        return (
          <div key={group} style={{ marginBottom: 16 }}>
            {groupBy !== 'none' && (
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                {group} ({items.length})
              </div>
            )}
            <div className="card">
              <table className="tbl">
                <thead>
                  <tr>
                    {dragEnabled && <th style={{ width: 24 }} />}
                    <th style={{ width: 28 }}>
                      <input type="checkbox" checked={groupAllSelected} onChange={() => toggleSelectGroup(groupIds)} onClick={(e) => e.stopPropagation()} />
                    </th>
                    <th
                      className="sortable"
                      onClick={() => toggleSort('manual_position')}
                      title="Sort by your own manual order -- reveals drag handles to reorder"
                    >
                      Order
                    </th>
                    <th className="sortable" onClick={() => toggleSort('title')}>
                      Title
                    </th>
                    <th>Project</th>
                    <th className="sortable" onClick={() => toggleSort('assigned_to')}>
                      Assignee
                    </th>
                    <th className="sortable" onClick={() => toggleSort('status')}>
                      Status
                    </th>
                    <th className="sortable" onClick={() => toggleSort('priority')}>
                      Priority
                    </th>
                    <th className="sortable" onClick={() => toggleSort('scheduled_end')}>
                      Due
                    </th>
                  </tr>
                </thead>
                {dragEnabled ? (
                  <DndContext sensors={sensors} onDragEnd={(e) => handlePriorityReorder(items, e)}>
                    <SortableContext items={groupIds} strategy={verticalListSortingStrategy}>
                      {tbody}
                    </SortableContext>
                  </DndContext>
                ) : (
                  tbody
                )}
              </table>
            </div>
          </div>
        );
      })}
    </>
  );
}
