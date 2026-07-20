import { useEffect, useMemo, useState } from 'react';
import { IconTrash } from '@tabler/icons-react';
import { api } from '../../api/client';
import { useToast } from '../ui/Toast';
import { fmtD } from '../../lib/format';
import type { Task, UserDirectoryEntry } from '../../types';

type SortKey = 'title' | 'status' | 'priority' | 'scheduled_end' | 'assigned_to';
export type TaskGroupBy = 'none' | 'project' | 'assigned_to' | 'status';

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

  useEffect(() => {
    api.get<UserDirectoryEntry[]>('/users/directory').then(setDirectory).catch(() => {});
  }, []);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const sorted = useMemo(() => {
    const copy = [...tasks];
    copy.sort((a, b) => {
      const av = String(a[sortKey] ?? '');
      const bv = String(b[sortKey] ?? '');
      const cmp = av.localeCompare(bv);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [tasks, sortKey, sortDir]);

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
      {Object.entries(groups).map(([group, items]) => {
        const groupIds = items.map((t) => t.id);
        const groupAllSelected = groupIds.length > 0 && groupIds.every((id) => selected.has(id));
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
                    <th style={{ width: 28 }}>
                      <input type="checkbox" checked={groupAllSelected} onChange={() => toggleSelectGroup(groupIds)} onClick={(e) => e.stopPropagation()} />
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
                <tbody>
                  {items.map((t) => (
                    <tr key={t.id} onClick={() => onTaskClick(t.id)}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSelect(t.id)} />
                      </td>
                      <td style={{ fontWeight: 500 }}>{t.title}</td>
                      <td>{t.projects?.name?.replace(/\|.*/, '').trim() || '—'}</td>
                      <td>{t.assigned_to || '—'}</td>
                      <td>
                        <span className="badge bg-gray">{t.status.replace('_', ' ')}</span>
                      </td>
                      <td>{t.priority}</td>
                      <td style={{ color: t.overdue ? 'var(--red)' : undefined, fontWeight: t.overdue ? 500 : undefined }}>
                        {t.overdue ? '⚠ ' : ''}
                        {fmtD(t.scheduled_end)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </>
  );
}
