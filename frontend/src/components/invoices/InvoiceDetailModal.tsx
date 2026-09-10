import { Modal } from '../ui/Modal';
import { InvoiceEditor } from './InvoiceEditor';
import type { Invoice } from '../../types';

// A full-size popup version of the invoice editor, for Project Detail's
// Invoices tab -- clicking a row used to do nothing at all; this keeps you
// in the project's context instead of navigating away to the standalone
// /invoices/:id page (which the global Invoices list still uses).
export function InvoiceDetailModal({
  invoiceId,
  onClose,
  onInvoiceChanged,
}: {
  invoiceId: string;
  onClose: () => void;
  onInvoiceChanged?: (invoice: Invoice) => void;
}) {
  return (
    <Modal title="Invoice" onClose={onClose} xl resizable>
      <InvoiceEditor invoiceId={invoiceId} onInvoiceChanged={onInvoiceChanged} />
    </Modal>
  );
}
