import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Project } from '../../types';

// Searchable "assign a project" combobox for a Kanban card -- replaces a
// plain <select> that made finding one job out of hundreds a scroll-and-scan
// exercise. Click to open, type any part of the address/job name to filter,
// arrow keys + Enter (or a click) to pick.
export function ProjectPicker({
  projects,
  onSelect,
  placeholder = 'No project — assign…',
}: {
  projects: Project[];
  onSelect: (projectId: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? projects.filter((p) => p.name.replace(/\|.*/, '').trim().toLowerCase().includes(q))
    : projects;

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  function openPicker() {
    setOpen(true);
    setQuery('');
    setHighlighted(0);
    // The input doesn't exist until this same render commits -- focus next tick.
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function choose(projectId: string) {
    onSelect(projectId);
    setOpen(false);
    setQuery('');
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlighted]) choose(filtered[highlighted].id);
    }
  }

  return (
    <div ref={containerRef} className="project-picker" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {!open ? (
        <button type="button" className="btn-reset project-picker-trigger" onClick={openPicker}>
          {placeholder}
        </button>
      ) : (
        <>
          <input
            ref={inputRef}
            className="fi"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlighted(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type an address or job name…"
            style={{ fontSize: 11, padding: '2px 4px', marginTop: 2 }}
          />
          <div className="project-picker-menu">
            {filtered.length === 0 ? (
              <div className="project-picker-empty">No matches</div>
            ) : (
              filtered.map((p, i) => (
                <div
                  key={p.id}
                  className={`project-picker-option${i === highlighted ? ' on' : ''}`}
                  onClick={() => choose(p.id)}
                  onMouseEnter={() => setHighlighted(i)}
                >
                  {p.name.replace(/\|.*/, '').trim()}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
