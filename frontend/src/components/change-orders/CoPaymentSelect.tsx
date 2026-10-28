import { api, ApiError } from '../../api/client';
import { useToast } from '../ui/Toast';
import { CO_PAYMENT_BADGE, CO_PAYMENT_LABEL, coPaymentState, paymentPatch } from '../../lib/changeOrderPayment';
import type { ChangeOrder } from '../../types';

// One-click Paid / Unpaid for a change order, shown as a colored badge like the
// status picker beside it. A partly-paid change order shows as "Partially paid"
// (set an exact amount in the change order itself).
export function CoPaymentSelect({ co, onChanged }: { co: ChangeOrder; onChanged: () => void }) {
  const toast = useToast();
  const state = coPaymentState(co);

  async function change(next: string) {
    try {
      await api.patch(`/change-orders/${co.id}`, paymentPatch(co, next === 'paid'));
      toast(`CO-${String(co.co_number ?? '?').padStart(3, '0')} marked ${next}`);
      onChanged();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to update payment', true);
    }
  }

  return (
    <select
      className={`badge ${CO_PAYMENT_BADGE[state]}`}
      style={{ border: 'none', cursor: 'pointer', fontSize: 11, padding: '2px 6px' }}
      value={state}
      title="Mark this change order paid or unpaid"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onChange={(e) => change(e.target.value)}
    >
      <option value="unpaid">{CO_PAYMENT_LABEL.unpaid}</option>
      {state === 'partial' && <option value="partial" disabled>{CO_PAYMENT_LABEL.partial}</option>}
      <option value="paid">{CO_PAYMENT_LABEL.paid}</option>
    </select>
  );
}
