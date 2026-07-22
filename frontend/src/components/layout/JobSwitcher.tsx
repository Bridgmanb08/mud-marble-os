import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconBriefcase, IconChevronDown, IconSearch } from '@tabler/icons-react';
import { api } from '../../api/client';
import type { Project } from '../../types';

export function JobSwitcher() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && projects.length === 0) {
      api
        .get<Project[]>('/projects')
        .then(setProjects)
        .catch(() => setProjects([]));
    }
  }, [open, projects.length]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = projects.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn btn-sm btn-ghost"
        onClick={() => setOpen((v) => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        title="Jump to a job"
      >
        <IconBriefcase size={15} />
        Jobs
        <IconChevronDown size={13} />
      </button>
      {open && (
        <div
          className="card"
          style={{ position: 'absolute', top: '110%', left: 0, width: 300, maxHeight: 380, display: 'flex', flexDirection: 'column', zIndex: 30 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
            <IconSearch size={14} style={{ color: 'var(--t3)' }} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search jobs…"
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, background: 'transparent' }}
            />
          </div>
          <div style={{ overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 14, fontSize: 12, color: 'var(--t2)' }}>No jobs found.</div>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="btn-reset"
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', cursor: 'pointer' }}
                  onClick={() => {
                    navigate(`/projects/${p.id}`);
                    setOpen(false);
                    setQuery('');
                  }}
                >
                  <div style={{ fontSize: 13 }}>{p.name.replace(/\|.*/, '').trim()}</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)', textTransform: 'capitalize' }}>{p.status}</div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
