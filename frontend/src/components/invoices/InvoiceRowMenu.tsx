import { useState } from 'react';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { RowMenu } from '../ui/RowMenu';

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
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(invoiceNumber || '');

  function startEdit() {
    setValue(invoiceNumber || '');
    setEditing(true);
  }

  function submitRename(close: () => void) {
    onRename(value.trim());
    setEditing(false);
    close();
  }

  return (
    <RowMenu minWidth={editing ? 200 : 180} onClose={() => setEditing(false)}>
      {(close) =>
        editing ? (
          <div style={{ padding: 4 }}>
            <label className="fl">Invoice number</label>
            <input
              className="fi"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitRename(close)}
              style={{ marginBottom: 8 }}
            />
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-sm" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-p btn-sm" onClick={() => submitRename(close)}>
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
                close();
                onDelete();
              }}
            >
              <IconTrash size={14} /> Delete
            </button>
          </>
        )
      }
    </RowMenu>
  );
}
