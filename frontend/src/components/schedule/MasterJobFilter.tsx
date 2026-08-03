import { useMemo, useState } from 'react';
import { IconSearch } from '@tabler/icons-react';
import { JobColorDot } from './JobColorDot';
import type { Project } from '../../types';

interface MasterJobFilterProps {
  projects: Project[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  onProjectColorChanged: (projectId: string, color: string) => void;
}

export function MasterJobFilter({ projects, selected, onChange, onProjectColorChanged }: MasterJobFilterProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Derived from whatever statuses actually exist on real projects, rather
  // than a hardcoded list -- stays correct as project statuses evolve.
  const statuses = useMemo(() => {
    const set = new Set(projects.map((p) => p.status));
    return Array.from(set).sort();
  }, [projects]);

  const filtered = useMemo(() => {
    let list = projects;
    if (statusFilter) list = list.filter((p) => p.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, search, statusFilter]);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  const allSelected = projects.length > 0 && projects.every((p) => selected.has(p.id));

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
      <button
        type="button"
        className="job-sidebar-item"
        onClick={() => onChange(allSelected ? new Set() : new Set(projects.map((p) => p.id)))}
      >
        {allSelected ? 'Clear all' : 'Select all'}
      </button>
      <div className="job-sidebar-list">
        {filtered.map((p) => {
          const name = p.name.replace(/\|.*/, '').trim();
          return (
            <label key={p.id} className={`job-filter-row${selected.has(p.id) ? ' active' : ''}`}>
              <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
              <JobColorDot project={p} onChanged={(color) => onProjectColorChanged(p.id, color)} />
              <span className="job-filter-name" title={name}>
                {name}
              </span>
            </label>
          );
        })}
        {filtered.length === 0 && <div className="job-sidebar-empty">No matching jobs</div>}
      </div>
    </div>
  );
}
