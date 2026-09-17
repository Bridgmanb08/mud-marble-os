import { IconArchive, IconArchiveOff, IconTrash } from '@tabler/icons-react';
import { RowMenu } from '../ui/RowMenu';

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
  return (
    <RowMenu>
      {(close) => (
        <>
          {isArchived ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ width: '100%', justifyContent: 'flex-start' }}
              onClick={() => {
                close();
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
                close();
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
              close();
              onDelete();
            }}
          >
            <IconTrash size={14} /> Delete permanently
          </button>
        </>
      )}
    </RowMenu>
  );
}
