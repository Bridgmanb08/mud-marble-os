import { IconPencil, IconTrash } from '@tabler/icons-react';
import { RowMenu } from '../ui/RowMenu';

// A small kebab menu per project card on the Projects list -- edit or
// delete without navigating into the project first. Builds on the same
// shared RowMenu as InvoiceRowMenu/EstimateRowMenu (portal-rendered, so it
// can't get clipped by anything it happens to sit inside).
export function ProjectRowMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
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
            <IconPencil size={14} /> Edit project
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
