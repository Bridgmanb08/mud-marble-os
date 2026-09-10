import { useEffect, useRef, useState } from 'react';
import { IconDots, IconPencil, IconTrash } from '@tabler/icons-react';

// A small kebab menu per invoice row -- quick actions (rename, delete)
// without leaving the list, mirroring EstimateRowMenu's pattern on the
// Estimates page.
export function InvoiceRowMenu({
  invoiceNumber,
  onRename,
  onDelete,
}: {
  invoiceNumber: string | null;
  onRename: (newNumber: string) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(invoiceNumber || '');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setEditing(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  function startEdit() {
    setValue(invoiceNumber || '');
    setEditing(true);
  }

  function submitRename() {
    onRename(value.trim());
    setEditing(false);
    setOpen(false);
  }

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
        <div
          className="card"
          style={{ position: 'absolute', top: '110%', right: 0, padding: 6, minWidth: editing ? 200 : 180, zIndex: 5 }}
          onClick={(e) => e.stopPropagation()}
        >
          {editing ? (
            <div style={{ padding: 4 }}>
              <label className="fl">Invoice number</label>
              <input
                className="fi"
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitRename()}
                style={{ marginBottom: 8 }}
              />
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-sm" onClick={() => setEditing(false)}>
                  Cancel
                </button>
                <button type="button" className="btn btn-p btn-sm" onClick={submitRename}>
                  Save
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ width: '100%', justifyContent: 'flex-start' }}
                onClick={startEdit}
              >
                <IconPencil size={14} /> Edit invoice number
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ width: '100%', justifyContent: 'flex-start', color: 'var(--red)' }}
                onClick={() => {
                  setOpen(false);
                  onDelete();
                }}
              >
                <IconTrash size={14} /> Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
