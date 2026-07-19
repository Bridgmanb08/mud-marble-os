import { fmt } from '../../../lib/format';
import type { CustomWidgetFilter, CustomWidgetSpec, DashboardSummary } from '../../../types';

function matches(row: Record<string, unknown>, filter: CustomWidgetFilter): boolean {
  const actual = row[filter.field];
  const expected = filter.value;
  switch (filter.op) {
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'gt':
      return typeof actual === 'number' && actual > Number(expected);
    case 'gte':
      return typeof actual === 'number' && actual >= Number(expected);
    case 'lt':
      return typeof actual === 'number' && actual < Number(expected);
    case 'lte':
      return typeof actual === 'number' && actual <= Number(expected);
    case 'contains':
      return typeof actual === 'string' && actual.toLowerCase().includes(String(expected).toLowerCase());
    default:
      return true;
  }
}

export function CustomWidgetRenderer({ spec, data }: { spec: CustomWidgetSpec; data: DashboardSummary }) {
  const rows = (data[spec.source] as Record<string, unknown>[] | undefined) ?? [];
  const filtered = rows.filter((r) => spec.filters.every((f) => matches(r, f)));

  if (spec.aggregation === 'count') {
    return <div className="m-val">{filtered.length}</div>;
  }

  if (spec.aggregation === 'sum' || spec.aggregation === 'avg') {
    const field = spec.aggregation_field || '';
    const values = filtered.map((r) => Number(r[field]) || 0);
    const total = values.reduce((s, v) => s + v, 0);
    const value = spec.aggregation === 'avg' ? (values.length ? total / values.length : 0) : total;
    return <div className="m-val">{fmt(value)}</div>;
  }

  // list
  if (!filtered.length) return <div style={{ fontSize: 13, color: 'var(--t2)' }}>Nothing matches.</div>;
  const columns = Object.keys(filtered[0]).filter((k) => k !== 'id' && k !== 'project_id');
  return (
    <table className="tbl">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c}>{c.replace(/_/g, ' ')}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filtered.slice(0, 15).map((r, i) => (
          <tr key={i}>
            {columns.map((c) => (
              <td key={c}>{String(r[c] ?? '—')}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
