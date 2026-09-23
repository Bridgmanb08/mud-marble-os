import { useEffect, useMemo, useRef, useState } from 'react';
import type { CostCode } from '../../types';

// A live-filtered cost code combobox -- type "all" and the list narrows to
// just Allowance, the same way the Cmd+K project search narrows as you
// type, instead of relying on the browser's own <datalist> popup (Brent:
// "kind of like when we're searching for projects... shrink down the
// options"). Matches against code AND name as substrings anywhere, not just
// a prefix, so "all" finds "20.00 - Allowance" and "elec" finds
// "08.00 - Electrical" equally well.
export function CostCodeSelect({
  costCodes,
  value,
  onSelect,
  placeholder = 'Start typing, e.g. electrical…',
}: {
  costCodes: CostCode[];
  value: string;
  onSelect: (costCode: CostCode | null) => void;
  placeholder?: string;
}) {
  const selected = useMemo(() => costCodes.find((c) => c.id === value) || null, [costCodes, value]);
  const [query, setQuery] = useState(selected ? `${selected.code} - ${selected.name}` : '');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Keep the displayed text in sync when the selection changes from outside
  // (e.g. editing a different item, or the parent clearing it) without
  // fighting the user's own typing while the dropdown is open.
  useEffect(() => {
    if (!open) setQuery(selected ? `${selected.code} - ${selected.name}` : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery(selected ? `${selected.code} - ${selected.name}` : '');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selected]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = costCodes.filter((c) => c.is_active);
    if (!q) return pool.slice(0, 50);
    return pool.filter((c) => `${c.code} ${c.name}`.toLowerCase().includes(q)).slice(0, 50);
  }, [costCodes, query]);

  useEffect(() => setActiveIndex(0), [query, open]);

  function choose(c: CostCode | null) {
    onSelect(c);
    setQuery(c ? `${c.code} - ${c.name}` : '');
    setOpen(false);
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        className="fi"
        value={query}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (results[activeIndex]) choose(results[activeIndex]);
          } else if (e.key === 'Escape') {
            setOpen(false);
            setQuery(selected ? `${selected.code} - ${selected.name}` : '');
          }
        }}
      />
      {open && (
        <div className="css-dropdown" role="listbox">
          {selected && (
            <button type="button" className="css-option css-clear" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(null)}>
              — None —
            </button>
          )}
          {results.length === 0 ? (
            <div className="css-empty">No matching cost codes</div>
          ) : (
            results.map((c, i) => (
              <button
                key={c.id}
                type="button"
                className={`css-option${i === activeIndex ? ' active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => choose(c)}
              >
                <span className="css-code">{c.code}</span> {c.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
