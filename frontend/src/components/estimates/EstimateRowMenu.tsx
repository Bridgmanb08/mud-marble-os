import { useEffect, useRef, useState } from 'react';
import { IconDots, IconArchive, IconArchiveOff, IconTrash } from '@tabler/icons-react';

// A small kebab menu per estimate-version row on the Estimates list, so old
// draft versions (v1/v2/v3 iterations that piled up while an estimate was
// being worked out) can be tucked away without cluttering the table with a
// row of always-visible action buttons.
export function EstimateRowMenu({
  isArchived,
  onArchive,
  onUnarchive,
  onDelete,
}: {
  isArchived: boolean;
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => setOpen((v) => !v)}
        title="More actions"
        aria-label="More actions"
      >
        <IconDots size={16} />
      </button>
      {open && (
        <div className="card" style={{ position: 'absolute', top: '110%', right: 0, padding: 6, minWidth: 190, zIndex: 5 }}>
          {isArchived ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ width: '100%', justifyContent: 'flex-start' }}
              onClick={() => {
                setOpen(false);
                onUnarchive();
              }}
            >
              <IconArchiveOff size={14} /> Unarchive
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ width: '100%', justifyContent: 'flex-start' }}
              onClick={() => {
                setOpen(false);
                onArchive();
              }}
            >
              <IconArchive size={14} /> Archive (hide from list)
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ width: '100%', justifyContent: 'flex-start', color: 'var(--red)' }}
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            <IconTrash size={14} /> Delete permanently
          </button>
        </div>
      )}
    </div>
  );
}
