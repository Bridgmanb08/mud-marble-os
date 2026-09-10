import { useParams, useNavigate } from 'react-router-dom';
import { IconArrowLeft } from '@tabler/icons-react';
import { InvoiceEditor } from '../components/invoices/InvoiceEditor';

export default function InvoiceWorksheet() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  if (!id) return null;

  return (
    <>
      <button className="btn btn-sm" style={{ marginBottom: 12 }} onClick={() => navigate('/invoices')}>
        <IconArrowLeft size={14} /> Back to Invoices
      </button>
      <InvoiceEditor invoiceId={id} />
    </>
  );
}
