import { IconPencil, IconTrash } from '@tabler/icons-react';
import { RowMenu } from '../ui/RowMenu';

// A small kebab menu per change-order row -- "Edit" just opens the same
// detail modal a row click does (there's no separate inline-rename like
// invoices have), "Delete" removes it outright. Builds on the same shared
// RowMenu as InvoiceRowMenu/EstimateRowMenu.
export function ChangeOrderRowMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <RowMenu>
      {(close) => (
        <>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ width: '100%', justifyContent: 'flex-start' }}
            onClick={() => {
              close();
              onEdit();
            }}
          >
            <IconPencil size={14} /> Edit
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
      )}
    </RowMenu>
  );
}
