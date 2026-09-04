import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Project } from '../../types';

const CLEAR_OPTION = { id: '', name: '— No project —' } as Project;

// Searchable "pick a project" combobox -- replaces a plain <select> that
// made finding one job out of hundreds a scroll-and-scan exercise (a native
// select only jumps to the first option starting with a typed letter, not
// substring filtering). Click to open, type any part of the address/job
// name to filter, arrow keys + Enter (or a click) to pick.
//
// Two usage shapes:
// - Uncontrolled "assign" trigger (Kanban card): omit `value`, it always
//   shows `placeholder` when closed.
// - Controlled form field (task detail drawer, new task modal): pass
//   `value` (the current project id) so the closed trigger shows the
//   currently-assigned project's name, and pass `allowClear` to offer a
//   "— No project —" row for unassigning.
//
// `compact` switches the visual weight: false (default) looks like a normal
// .fi form field, matching its sibling inputs in a drawer/modal; true is the
// small, borderless, muted-text treatment that fits inline on a dense
// Kanban card.
export function ProjectPicker({
  projects,
  value,
  onSelect,
  placeholder = 'No project — assign…',
  allowClear = false,
  compact = false,
}: {
  projects: Project[];
  value?: string;
  onSelect: (projectId: string) => void;
  placeholder?: string;
  allowClear?: boolean;
  compact?: boolean;
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
  // The clear row stays pinned to the top regardless of the typed query,
  // except once the query is specific enough that it's clearly not what
  // the user's looking for -- matching "no project"/"none" keeps it
  // reachable by typing, matching nothing else hides it like any other row.
  const showClear = allowClear && (!q || 'no project'.includes(q) || 'none'.includes(q));
  const options: Project[] = showClear ? [CLEAR_OPTION, ...filtered] : filtered;

  const selectedProject = value ? projects.find((p) => p.id === value) : undefined;
  const triggerLabel = selectedProject ? selectedProject.name.replace(/\|.*/, '').trim() : placeholder;

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
      setHighlighted((h) => Math.min(h + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (options[highlighted]) choose(options[highlighted].id);
    }
  }

  return (
    <div ref={containerRef} className="project-picker" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {!open ? (
        <button
          type="button"
          className={`btn-reset project-picker-trigger${compact ? ' compact' : ''}`}
          onClick={openPicker}
          style={selectedProject && compact ? { color: 'var(--text)' } : undefined}
        >
          {triggerLabel}
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
            style={compact ? { fontSize: 11, padding: '2px 4px', marginTop: 2 } : undefined}
          />
          <div className="project-picker-menu">
            {options.length === 0 ? (
              <div className="project-picker-empty">No matches</div>
            ) : (
              options.map((p, i) => (
                <div
                  key={p.id || '__clear__'}
                  className={`project-picker-option${i === highlighted ? ' on' : ''}${p.id === '' ? ' project-picker-clear' : ''}`}
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
