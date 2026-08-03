import { useEffect, useMemo, useState } from 'react';
import { IconSearch, IconBriefcase } from '@tabler/icons-react';
import { api } from '../../api/client';
import type { Project } from '../../types';

interface JobFilterSidebarProps {
  value: string;
  onChange: (projectId: string) => void;
}

export function JobFilterSidebar({ value, onChange }: JobFilterSidebarProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    api.get<Project[]>('/projects').then(setProjects).catch(() => {});
  }, []);

  // Derived from whatever statuses actually exist on real projects, rather
  // than a hardcoded list -- stays correct as project statuses evolve.
  const statuses = useMemo(() => {
    const set = new Set(projects.filter((p) => !p.is_archived).map((p) => p.status));
    return Array.from(set).sort();
  }, [projects]);

  const filtered = useMemo(() => {
    let active = projects.filter((p) => !p.is_archived);
    if (statusFilter) active = active.filter((p) => p.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (!q) return active;
    return active.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, search, statusFilter]);

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
          return (
            <button
              key={p.id}
              type="button"
              className={`job-sidebar-item${value === p.id ? ' active' : ''}`}
              onClick={() => onChange(p.id)}
              title={name}
            >
              {name}
            </button>
          );
        })}
        {filtered.length === 0 && <div className="job-sidebar-empty">No matching jobs</div>}
      </div>
    </div>
  );
}
