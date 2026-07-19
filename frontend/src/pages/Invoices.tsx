import { useEffect, useMemo, useState } from 'react';
import { IconPlus, IconReceipt } from '@tabler/icons-react';
import { api } from '../api/client';
import { useToast } from '../components/ui/Toast';
import { fmt, fmtD } from '../lib/format';
import type { Invoice } from '../types';
import { NewInvoiceModal } from '../components/invoices/NewInvoiceModal';

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray',
  sent: 'bg-amber',
  paid: 'bg-green',
  overdue: 'bg-red',
  void: 'bg-gray',
};

const FILTERS = ['all', 'overdue', 'sent', 'paid', 'draft'];

export default function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [filter, setFilter] = useState('all');
  const [showNew, setShowNew] = useState(false);
  const toast = useToast();

  async function load() {
    try {
      const data = await api.get<Invoice[]>('/invoices');
      setInvoices(data);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load invoices', true);
      setInvoices([]);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!invoices) return [];
    return filter === 'all' ? invoices : invoices.filter((i) => i.status === filter);
  }, [invoices, filter]);

  const overdue = invoices?.filter((i) => i.status === 'overdue').length ?? 0;
  const sent = invoices?.filter((i) => i.status === 'sent').length ?? 0;
  const paid = invoices?.filter((i) => i.status === 'paid').length ?? 0;
  const outstanding =
    invoices?.filter((i) => ['sent', 'overdue'].includes(i.status)).reduce((s, i) => s + i.amount_due - (i.amount_paid || 0), 0) ?? 0;

  return (
    <>
      <div className="ph">
        <div>
          <h1>Invoices</h1>
          <p>All invoices across all projects</p>
        </div>
        <button className="btn btn-p btn-sm" onClick={() => setShowNew(true)}>
          <IconPlus size={14} /> Create invoice
        </button>
      </div>

      <div className="metrics">
        <div className="metric">
          <div className="m-label">Overdue</div>
          <div className="m-val" style={{ color: overdue ? 'var(--red)' : undefined }}>
            {overdue}
          </div>
          <div className="m-sub">needs attention</div>
        </div>
        <div className="metric">
          <div className="m-label">Awaiting payment</div>
          <div className="m-val">{sent}</div>
        </div>
        <div className="metric">
          <div className="m-label">Paid</div>
          <div className="m-val">{paid}</div>
        </div>
        <div className="metric">
          <div className="m-label">Outstanding</div>
          <div className="m-val" style={{ fontSize: 17, color: outstanding > 0 ? 'var(--atx)' : undefined }}>
            {fmt(outstanding)}
          </div>
        </div>
      </div>

      <div className="sh">
        <div className="st">All invoices</div>
        <div className="filters">
          {FILTERS.map((f) => (
            <button key={f} className={`fb${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>
              {f === 'all' ? `All (${invoices?.length ?? 0})` : f}
            </button>
          ))}
        </div>
      </div>

      {invoices === null ? (
        <div className="empty">
          <div className="empty-t">Loading…</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <IconReceipt size={32} color="var(--t3)" style={{ display: 'block', margin: '0 auto 12px' }} />
          <div className="empty-t">No invoices</div>
        </div>
      ) : (
        filtered.map((i) => (
          <div key={i.id} className="invr">
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>
                {i.invoice_number || 'Draft'} <span style={{ color: 'var(--t2)', fontWeight: 400 }}>· {i.projects?.name || ''}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--t3)' }}>
                {i.invoice_type} · Due {fmtD(i.due_date)}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{fmt(i.amount_due)}</span>
              <span className={`badge ${STATUS_BADGE[i.status] || 'bg-gray'}`}>{i.status}</span>
            </div>
          </div>
        ))
      )}

      {showNew && (
        <NewInvoiceModal
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            toast('Invoice created');
            load();
          }}
        />
      )}
    </>
  );
}
