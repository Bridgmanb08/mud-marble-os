import type { Invoice } from '../types';

export type InvoiceSortKey = 'number' | 'type' | 'amount_due' | 'paid' | 'due' | 'status';
export type SortDir = 'asc' | 'desc';

const STATUS_RANK: Record<string, number> = { draft: 0, sent: 1, overdue: 2, paid: 3 };

// Invoice numbers compare number-aware ("02" before "10", "INV-9" before
// "INV-10"). A row with nothing to sort on -- a draft with no invoice number
// yet, an invoice with no due date -- goes to the bottom whichever direction
// is chosen. Ties fall back to invoice number, lowest first.
function byNumber(a: Invoice, b: Invoice): number {
  const an = a.invoice_number || '';
  const bn = b.invoice_number || '';
  if (!an && !bn) return a.created_at.localeCompare(b.created_at);
  if (!an) return 1;
  if (!bn) return -1;
  return an.localeCompare(bn, undefined, { numeric: true }) || a.created_at.localeCompare(b.created_at);
}

function value(inv: Invoice, key: InvoiceSortKey): string | number | null {
  switch (key) {
    case 'type':
      return inv.invoice_type || null;
    case 'amount_due':
      return inv.amount_due ?? 0;
    case 'paid':
      return inv.amount_paid ?? 0;
    case 'due':
      return inv.due_date || null;
    case 'status':
      return STATUS_RANK[inv.status] ?? 9;
    default:
      return null;
  }
}

export function sortInvoices(invoices: Invoice[], key: InvoiceSortKey, dir: SortDir): Invoice[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...invoices].sort((a, b) => {
    if (key === 'number') {
      const an = a.invoice_number || '';
      const bn = b.invoice_number || '';
      if (!an !== !bn) return !an ? 1 : -1; // empty last, either direction
      return byNumber(a, b) * sign;
    }
    const av = value(a, key);
    const bv = value(b, key);
    if (av === null && bv === null) return byNumber(a, b);
    if (av === null) return 1;
    if (bv === null) return -1;
    const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
    return cmp * sign || byNumber(a, b);
  });
}
