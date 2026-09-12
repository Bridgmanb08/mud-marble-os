import { Modal } from '../ui/Modal';
import { ChangeOrderEditor } from './ChangeOrderEditor';
import type { ChangeOrder } from '../../types';

// A full-size popup editor -- a change order previously had no edit view at
// all beyond the inline status dropdown on its list card, with no way to
// fix a typo'd title/price or add internal notes after creation. Same
// resizable-popup pattern as InvoiceDetailModal.
export function ChangeOrderDetailModal({
  coId,
  onClose,
  onChanged,
}: {
  coId: string;
  onClose: () => void;
  onChanged?: (co: ChangeOrder) => void;
}) {
  return (
    <Modal title="Change Order" onClose={onClose} xl resizable>
      <ChangeOrderEditor coId={coId} onChanged={onChanged} />
    </Modal>
  );
}
