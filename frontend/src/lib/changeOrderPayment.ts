import type { ChangeOrder } from '../types';

export type CoPaymentState = 'unpaid' | 'partial' | 'paid';

// paid / partly paid / unpaid, read the same way as an invoice's amount paid against its amount due.
export function coPaymentState(co: Pick<ChangeOrder, 'owner_price' | 'amount_paid'>): CoPaymentState {
  const paid = co.amount_paid || 0;
  if (paid <= 0) return 'unpaid';
  return paid >= (co.owner_price || 0) - 0.005 ? 'paid' : 'partial';
}

export const CO_PAYMENT_LABEL: Record<CoPaymentState, string> = { unpaid: 'Unpaid', partial: 'Partially paid', paid: 'Paid' };
export const CO_PAYMENT_BADGE: Record<CoPaymentState, string> = { unpaid: 'bg-gray', partial: 'bg-amber', paid: 'bg-green' };

// What to save when someone marks a change order paid or unpaid in one click.
export function paymentPatch(co: Pick<ChangeOrder, 'owner_price'>, paid: boolean): { amount_paid: number } {
  return { amount_paid: paid ? co.owner_price || 0 : 0 };
}
