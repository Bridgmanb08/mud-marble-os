import { useEffect, useMemo, useState } from 'react';
import { IconSearch, IconBriefcase } from '@tabler/icons-react';
import { api } from '../../api/client';
import type { Project, Task } from '../../types';

interface JobFilterSidebarProps {
  value: string;
  onChange: (projectId: string) => void;
  tasks: Task[];
}

export function JobFilterSidebar({ value, onChange, tasks }: JobFilterSidebarProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    api.get<Project[]>('/projects').then(setProjects).catch(() => {});
  }, []);

  // Per-project task stats derived from the already-loaded task list (no
  // second fetch needed) -- `total` gates which jobs even show in this list
  // (a job with zero tasks assigned shouldn't clutter it, but is still
  // fully assignable from the New Task modal's own unfiltered project
  // picker, which reads straight off GET /projects, not this sidebar);
  // `open` (everything except 'complete') backs the gray count badge.
  const taskStatsByProject = useMemo(() => {
    const stats = new Map<string, { total: number; open: number }>();
    for (const t of tasks) {
      if (!t.project_id) continue;
      const s = stats.get(t.project_id) || { total: 0, open: 0 };
      s.total += 1;
      if (t.status !== 'complete') s.open += 1;
      stats.set(t.project_id, s);
    }
    return stats;
  }, [tasks]);

  // Derived from whatever statuses actually exist on real projects, rather
  // than a hardcoded list -- stays correct as project statuses evolve.
  const statuses = useMemo(() => {
    const set = new Set(projects.filter((p) => !p.is_archived).map((p) => p.status));
    return Array.from(set).sort();
  }, [projects]);

  const filtered = useMemo(() => {
    let active = projects.filter((p) => !p.is_archived && taskStatsByProject.has(p.id));
    if (statusFilter) active = active.filter((p) => p.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (!q) return active;
    return active.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, search, statusFilter, taskStatsByProject]);

  return (
    <div className="job-sidebar">
      <div className="job-sidebar-search">
        <IconSearch size={13} />
        <input className="fi" placeholder="Search jobs…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <select
        className="fi job-sidebar-status"
        style={{ textTransform: 'capitalize' }}
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
      >
        <option value="">All statuses</option>
        {statuses.map((s) => (
          <option key={s} value={s} style={{ textTransform: 'capitalize' }}>
            {s.replace(/_/g, ' ')}
          </option>
        ))}
      </select>
      <button type="button" className={`job-sidebar-item${value === '' ? ' active' : ''}`} onClick={() => onChange('')}>
        <IconBriefcase size={14} /> All jobs
      </button>
      <div className="job-sidebar-list">
        {filtered.map((p) => {
          const name = p.name.replace(/\|.*/, '').trim();
          const open = taskStatsByProject.get(p.id)?.open ?? 0;
          return (
            <button
              key={p.id}
              type="button"
              className={`job-sidebar-item${value === p.id ? ' active' : ''}`}
              onClick={() => onChange(p.id)}
              title={name}
            >
              <span className="job-sidebar-item-name">{name}</span>
              {open > 0 && <span className="job-sidebar-count">{open}</span>}
            </button>
          );
        })}
        {filtered.length === 0 && <div className="job-sidebar-empty">No jobs with tasks assigned yet</div>}
      </div>
    </div>
  );
}
