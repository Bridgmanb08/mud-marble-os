import { useMemo, useState } from 'react';
import { fmtD } from '../../lib/format';
import type { Task } from '../../types';

type SortKey = 'title' | 'status' | 'priority' | 'scheduled_end' | 'assigned_to';
type GroupBy = 'none' | 'project' | 'assigned_to' | 'status';

export function TableView({ tasks, onTaskClick }: { tasks: Task[]; onTaskClick: (id: string) => void }) {
  const [sortKey, setSortKey] = useState<SortKey>('scheduled_end');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');

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

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <select className="fi" style={{ width: 'auto' }} value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
          <option value="none">No grouping</option>
          <option value="project">Group by project</option>
          <option value="assigned_to">Group by assignee</option>
          <option value="status">Group by status</option>
        </select>
      </div>
      {Object.entries(groups).map(([group, items]) => (
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
                    <td style={{ fontWeight: 500 }}>{t.title}</td>
                    <td>{t.projects?.name?.replace(/\|.*/, '').trim() || '—'}</td>
                    <td>{t.assigned_to || '—'}</td>
                    <td>
                      <span className="badge bg-gray">{t.status.replace('_', ' ')}</span>
                    </td>
                    <td>{t.priority}</td>
                    <td>{fmtD(t.scheduled_end)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  );
}
