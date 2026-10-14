// Invoice statuses, in the order they appear in pickers. "partial" is set
// automatically when a payment covers some but not all of the invoice.
export const INVOICE_STATUS_OPTIONS = ['draft', 'sent', 'partial', 'paid', 'overdue', 'void'];

const LABELS: Record<string, string> = { partial: 'partially paid' };
export const invoiceStatusLabel = (status: string): string => LABELS[status] ?? status;

export const INVOICE_STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray',
  sent: 'bg-amber',
  partial: 'bg-amber',
  paid: 'bg-green',
  overdue: 'bg-red',
  void: 'bg-gray',
};
