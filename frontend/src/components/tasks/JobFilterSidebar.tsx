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

  useEffect(() => {
    api.get<Project[]>('/projects').then(setProjects).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const active = projects.filter((p) => !p.is_archived);
    const q = search.trim().toLowerCase();
    if (!q) return active;
    return active.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, search]);

  return (
    <div className="job-sidebar">
      <div className="job-sidebar-search">
        <IconSearch size={13} />
        <input className="fi" placeholder="Search jobs…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
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
