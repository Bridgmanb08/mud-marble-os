// Every financial figure in the app shows cents -- rounding to whole
// dollars silently loses real money (a $7,498.50 invoice used to show
// "$7,499", which doesn't match what the client actually owes or what the
// PDF export already always showed). Previously fmt() rounded to whole
// dollars everywhere except invoice amounts (which went through the
// separate fmtCents below); per Brent, that whole-dollar rounding was wrong
// everywhere else too, so fmt() now always shows cents like fmtCents did.
export function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Kept as an alias -- fmt() now does exactly this, but this name stays
// around so the many existing invoice-amount call sites don't all need to
// be touched just to keep working.
export const fmtCents = fmt;

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
