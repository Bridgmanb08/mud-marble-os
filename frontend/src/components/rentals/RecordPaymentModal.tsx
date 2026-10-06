import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { fmt, fmtD } from '../../lib/format';
import { openDatePicker } from '../../lib/datePicker';
import type { RentRollRow } from '../../types';

// Quick "rent came in" entry straight from the rent roll: how much has been
// paid this month and on what date. Saves to this month's payment row, and
// the paid / partial / still-due status follows from the amounts. The month's
// amount due can be corrected here too (a prorated month, a credit).
export function RecordPaymentModal({
  row,
  onClose,
  onSaved,
}: {
  row: RentRollRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [amountDue, setAmountDue] = useState(String(row.current_month_due));
  const [amountPaid, setAmountPaid] = useState(String(row.current_month_paid || row.current_month_due));
  const [paidDate, setPaidDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const due = parseFloat(amountDue) || 0;
  const paid = parseFloat(amountPaid) || 0;
  const remaining = Math.max(0, due - paid);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!row.current_payment_id) return;
    setSaving(true);
    setError('');
    try {
      await api.patch(`/rental-payments/${row.current_payment_id}`, {
        amount_due: due,
        amount_paid: paid,
        ...(paid > 0 ? { paid_date: paidDate } : {}),
      });
      toast(paid <= 0 ? 'Payment cleared' : remaining > 0 ? `Partial payment recorded — ${fmt(remaining)} still due` : 'Rent marked paid');
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save the payment');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Record rent — ${row.property_address}, ${row.unit_label}`} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div className="merr">{error}</div>}
        <div style={{ fontSize: 12.5, color: 'var(--t2)', marginBottom: 14 }}>
          {row.tenant_name ? `${row.tenant_name} · ` : ''}
          {row.current_payment_due_date ? `rent due ${fmtD(row.current_payment_due_date)}` : 'this month'}
        </div>
        <div className="fr">
          <div className="fg">
            <label className="fl">Rent due this month ($)</label>
            <input className="fi" type="number" step="0.01" value={amountDue} onChange={(e) => setAmountDue(e.target.value)} />
          </div>
          <div className="fg">
            <label className="fl">Paid so far ($)</label>
            <input className="fi" type="number" step="0.01" autoFocus value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} />
          </div>
        </div>
        <div className="fg">
          <label className="fl">Date paid</label>
          <input className="fi" type="date" value={paidDate} onClick={openDatePicker} onChange={(e) => setPaidDate(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
          <button type="button" className="btn btn-sm" onClick={() => setAmountPaid(String(due))}>
            Paid in full
          </button>
          <span style={{ fontSize: 12.5, color: remaining > 0 ? 'var(--red)' : 'var(--green)' }}>
            {remaining > 0 ? `${fmt(remaining)} still due` : 'Nothing due'}
          </span>
        </div>
        {row.past_due_total > 0 && (
          <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 8 }}>
            {fmt(row.past_due_total)} is also past due from earlier months -- record it from the Past due column.
          </div>
        )}
        <div className="ma">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-p" disabled={saving}>
            {saving ? 'Saving…' : 'Save payment'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
