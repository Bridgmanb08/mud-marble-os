export function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
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
