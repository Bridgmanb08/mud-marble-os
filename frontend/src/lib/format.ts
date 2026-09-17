export function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

// Whole-dollar fmt() above rounds away real cents -- fine for most summary
// figures, but wrong on an actual invoice amount: a $7,498.50 invoice
// rounding to "$7,499" on screen doesn't match the number the client
// actually owes (or the PDF export, which already always shows cents).
// Scoped to invoice-amount displays specifically, not a blanket swap of
// fmt() everywhere, so dashboard/estimate/budget summaries stay as clean
// whole-dollar figures.
export function fmtCents(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtD(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtAge(d: string | null | undefined): string {
  if (!d) return '—';
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days <= 0) return 'Today';
  return `${days} day${days === 1 ? '' : 's'}`;
}
