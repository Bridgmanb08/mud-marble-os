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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, search]);

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
