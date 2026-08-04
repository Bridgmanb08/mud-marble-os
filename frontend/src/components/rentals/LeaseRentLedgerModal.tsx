import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { fmt, fmtD } from '../../lib/format';
import { openDatePicker } from '../../lib/datePicker';
import type { RentalLease, RentalPayment } from '../../types';

const STATUS_BADGE: Record<string, string> = { due: 'bg-gray', partial: 'bg-amber', paid: 'bg-green' };

export function LeaseRentLedgerModal({ lease, onClose }: { lease: RentalLease; onClose: () => void }) {
  const toast = useToast();
  const [payments, setPayments] = useState<RentalPayment[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [amountPaid, setAmountPaid] = useState('');
  const [paidDate, setPaidDate] = useState('');

  function load() {
    api
      .get<RentalPayment[]>(`/rental-leases/${lease.id}/payments`)
      .then(setPayments)
      .catch(() => toast('Failed to load rent ledger', true));
  }

  useEffect(load, [lease.id]);

  function startMarkPaid(p: RentalPayment) {
    setEditingId(p.id);
    setAmountPaid(String(p.amount_paid ?? p.amount_due));
    setPaidDate(p.paid_date || new Date().toISOString().slice(0, 10));
  }

  async function savePaid(p: RentalPayment) {
    try {
      await api.patch(`/rental-payments/${p.id}`, {
        amount_paid: parseFloat(amountPaid) || 0,
        paid_date: paidDate,
        status: 'paid',
      });
      setEditingId(null);
      toast('Payment recorded');
      load();
    } catch {
      toast('Failed to record payment', true);
    }
  }

  const tenantName = lease.tenants?.name || 'Unknown tenant';
  const unitLabel = lease.rental_units?.unit_label || 'Unit';

  return (
    <Modal title={`Rent ledger — ${tenantName} (${unitLabel})`} onClose={onClose}>
      <div style={{ fontSize: 12.5, color: 'var(--t2)', marginBottom: 12 }}>
        {fmtD(lease.start_date)} – {fmtD(lease.end_date)} · {fmt(lease.monthly_rent)}/mo
      </div>
      {payments === null ? (
        <div className="empty">
          <div className="empty-t">Loading…</div>
        </div>
      ) : payments.length === 0 ? (
        <div className="empty">
          <div className="empty-t">No payment rows yet</div>
        </div>
      ) : (
        <table className="tbl">
          <thead>
            <tr>
              <th>Due date</th>
              <th>Amount due</th>
              <th>Status</th>
              <th>Paid</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td>
                  {fmtD(p.due_date)}
                  {p.is_late && <span className="badge bg-red" style={{ marginLeft: 6 }}>Late</span>}
                </td>
                <td>{fmt(p.amount_due)}</td>
                <td>
                  <span className={`badge ${STATUS_BADGE[p.status] || 'bg-gray'}`}>{p.status}</span>
                </td>
                <td>
                  {editingId === p.id ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        className="fi"
                        style={{ width: 80 }}
                        type="number"
                        value={amountPaid}
                        onChange={(e) => setAmountPaid(e.target.value)}
                      />
                      <input
                        className="fi"
                        style={{ width: 130 }}
                        type="date"
                        value={paidDate}
                        onClick={openDatePicker}
                        onChange={(e) => setPaidDate(e.target.value)}
                      />
                    </div>
                  ) : p.paid_date ? (
                    `${fmt(p.amount_paid || 0)} on ${fmtD(p.paid_date)}`
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  {editingId === p.id ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                      <button className="btn btn-p btn-sm" onClick={() => savePaid(p)}>
                        Save
                      </button>
                    </div>
                  ) : (
                    p.status !== 'paid' && (
                      <button className="btn btn-sm" onClick={() => startMarkPaid(p)}>
                        Mark paid
                      </button>
                    )
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="ma">
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
