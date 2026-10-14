import type { InvoiceableItem, InvoiceLineItem } from '../types';

export interface LineBilling {
  total: number; // what the whole estimate / change order line is worth
  previous: number; // billed on OTHER invoices
  current: number; // billed on THIS invoice
  previousPct: number;
  currentPct: number;
  leftPct: number; // never negative
  over: number; // dollars billed beyond the line's total (0 when within it)
}

// How much of the estimate/change-order line behind one invoice line has been
// billed: on earlier invoices ("previous") versus this one ("current").
// invoiceable.invoiced_amount counts every invoice on the project INCLUDING this
// one, so this invoice's own share (every line on it pointing at the same
// source line) is taken back out to get what was billed before. Returns null
// when there's nothing to compare against (a hand-typed line with no source, or
// a source worth $0).
export function lineBilling(
  line: InvoiceLineItem,
  allLines: InvoiceLineItem[],
  sourceById: Map<string, InvoiceableItem>
): LineBilling | null {
  if (!line.source_line_item_id) return null;
  const source = sourceById.get(line.source_line_item_id);
  if (!source || !source.owner_price) return null;

  const total = source.owner_price;
  const thisInvoiceTotalForSource = allLines
    .filter((l) => l.source_line_item_id === line.source_line_item_id)
    .reduce((s, l) => s + (l.amount || 0), 0);
  const previous = Math.round((source.invoiced_amount - thisInvoiceTotalForSource) * 100) / 100;
  const current = line.amount || 0;

  const pct = (amount: number) => (amount / total) * 100;
  const previousPct = Math.max(0, pct(previous));
  const currentPct = Math.max(0, pct(current));
  const billedPct = previousPct + currentPct;
  const over = billedPct > 100.005 ? Math.round(((billedPct - 100) / 100) * Math.abs(total) * 100) / 100 : 0;
  return { total, previous, current, previousPct, currentPct, leftPct: Math.max(0, 100 - billedPct), over };
}
