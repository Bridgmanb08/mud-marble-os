import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { IconBookmark, IconPlus, IconTrash } from '@tabler/icons-react';
import { api } from '../api/client';
import { useToast } from '../components/ui/Toast';
import { fmt } from '../lib/format';
import { CATEGORICAL_COLORS, OTHER_COLOR } from '../lib/reportPalette';
import type { ReportFilter, ReportRunResult, ReportSource, ReportSpec, SavedReport } from '../types';

type FieldType = 'text' | 'bool' | 'number' | 'date';

interface FieldOption {
  value: string;
  label: string;
  type?: FieldType;
}

const SOURCE_CONFIG: Record<
  ReportSource,
  { label: string; groupFields: FieldOption[]; numericFields: FieldOption[]; filterFields: FieldOption[] }
> = {
  transactions: {
    label: 'Transactions (In-House Ledger)',
    groupFields: [
      { value: 'project', label: 'Project' },
      { value: 'cost_code', label: 'Cost code' },
      { value: 'vendor', label: 'Vendor' },
      { value: 'transaction_type', label: 'Type' },
      { value: 'month', label: 'Month' },
    ],
    numericFields: [{ value: 'amount', label: 'Amount' }],
    filterFields: [
      { value: 'vendor', label: 'Vendor', type: 'text' },
      { value: 'transaction_type', label: 'Type', type: 'text' },
      { value: 'payment_source', label: 'Payment source', type: 'text' },
      { value: 'is_allowance', label: 'Is allowance', type: 'bool' },
      { value: 'is_change_order', label: 'Is change order', type: 'bool' },
      { value: 'transaction_date', label: 'Date', type: 'date' },
      { value: 'amount', label: 'Amount', type: 'number' },
    ],
  },
  invoices: {
    label: 'Invoices',
    groupFields: [
      { value: 'project', label: 'Project' },
      { value: 'status', label: 'Status' },
      { value: 'invoice_type', label: 'Type' },
      { value: 'month', label: 'Month' },
    ],
    numericFields: [
      { value: 'amount_due', label: 'Amount due' },
      { value: 'amount_paid', label: 'Amount paid' },
    ],
    filterFields: [
      { value: 'status', label: 'Status', type: 'text' },
      { value: 'invoice_type', label: 'Type', type: 'text' },
      { value: 'issued_at', label: 'Issued date', type: 'date' },
      { value: 'amount_due', label: 'Amount due', type: 'number' },
    ],
  },
  change_orders: {
    label: 'Change Orders',
    groupFields: [
      { value: 'project', label: 'Project' },
      { value: 'status', label: 'Status' },
      { value: 'co_type', label: 'Type' },
      { value: 'month', label: 'Month' },
    ],
    numericFields: [
      { value: 'owner_price', label: 'Owner price' },
      { value: 'builder_cost', label: 'Builder cost' },
    ],
    filterFields: [
      { value: 'status', label: 'Status', type: 'text' },
      { value: 'co_type', label: 'Type', type: 'text' },
      { value: 'created_at', label: 'Created date', type: 'date' },
      { value: 'owner_price', label: 'Owner price', type: 'number' },
    ],
  },
  projects: {
    label: 'Projects',
    groupFields: [
      { value: 'status', label: 'Status' },
      { value: 'health_status', label: 'Health status' },
      { value: 'project_type', label: 'Project type' },
    ],
    numericFields: [{ value: 'contract_value', label: 'Contract value' }],
    filterFields: [
      { value: 'status', label: 'Status', type: 'text' },
      { value: 'health_status', label: 'Health status', type: 'text' },
      { value: 'project_type', label: 'Project type', type: 'text' },
      { value: 'contract_value', label: 'Contract value', type: 'number' },
    ],
  },
};

const OPS: { value: ReportFilter['op']; label: string }[] = [
  { value: 'eq', label: '=' },
  { value: 'neq', label: '≠' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '≥' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '≤' },
  { value: 'contains', label: 'contains' },
];

function defaultSpec(): ReportSpec {
  return {
    source: 'transactions',
    filters: [],
    group_by: 'project',
    aggregation: 'sum',
    aggregation_field: 'amount',
    chart_type: 'bar',
  };
}

export default function Reports() {
  const toast = useToast();
  const [spec, setSpec] = useState<ReportSpec>(defaultSpec());
  const [result, setResult] = useState<ReportRunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [saved, setSaved] = useState<SavedReport[]>([]);
  const [activeReportId, setActiveReportId] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [reportName, setReportName] = useState('');

  const config = SOURCE_CONFIG[spec.source];

  async function loadSaved() {
    setSaved(await api.get<SavedReport[]>('/reports').catch(() => []));
  }

  useEffect(() => {
    loadSaved();
  }, []);

  function updateSource(source: ReportSource) {
    const cfg = SOURCE_CONFIG[source];
    setSpec({
      source,
      filters: [],
      group_by: cfg.groupFields[0].value,
      aggregation: 'sum',
      aggregation_field: cfg.numericFields[0]?.value || null,
      chart_type: 'bar',
    });
    setResult(null);
    setActiveReportId('');
  }

  function addFilter() {
    const first = config.filterFields[0];
    setSpec((s) => ({ ...s, filters: [...s.filters, { field: first.value, op: 'eq', value: '' }] }));
  }

  function updateFilter(index: number, patch: Partial<ReportFilter>) {
    setSpec((s) => ({ ...s, filters: s.filters.map((f, i) => (i === index ? { ...f, ...patch } : f)) }));
  }

  function removeFilter(index: number) {
    setSpec((s) => ({ ...s, filters: s.filters.filter((_, i) => i !== index) }));
  }

  async function runReport(useSpec: ReportSpec = spec) {
    setRunning(true);
    try {
      const r = await api.post<ReportRunResult>('/reports/run', useSpec);
      setResult(r);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to run report', true);
      setResult(null);
    } finally {
      setRunning(false);
    }
  }

  async function saveReport() {
    if (!reportName.trim()) return;
    try {
      await api.post('/reports', { name: reportName.trim(), spec });
      toast('Report saved');
      setShowSaveModal(false);
      setReportName('');
      loadSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to save report', true);
    }
  }

  async function loadReport(r: SavedReport) {
    setSpec(r.spec);
    setActiveReportId(r.id);
    await runReport(r.spec);
  }

  async function deleteReport(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Delete this saved report?')) return;
    try {
      await api.delete(`/reports/${id}`);
      toast('Report deleted');
      if (activeReportId === id) setActiveReportId('');
      loadSaved();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete report', true);
    }
  }

  const chartRows = useMemo(() => {
    if (!result) return [];
    if (spec.chart_type === 'line') {
      return [...result.rows].sort((a, b) => a.group.localeCompare(b.group));
    }
    return result.rows;
  }, [result, spec.chart_type]);

  const pieRows = useMemo(() => {
    if (chartRows.length <= 5) return chartRows;
    const top = chartRows.slice(0, 4);
    const rest = chartRows.slice(4);
    const otherValue = rest.reduce((sum, r) => sum + r.value, 0);
    const otherCount = rest.reduce((sum, r) => sum + r.count, 0);
    return [...top, { group: 'Other', value: otherValue, count: otherCount }];
  }, [chartRows]);

  return (
    <>
      <div className="ph">
        <div>
          <h1>Reports</h1>
          <p>Build and save custom financial reports across your ledger, invoices, and change orders</p>
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div className="fr3">
          <div className="fg">
            <label className="fl">Data source</label>
            <select className="fi" value={spec.source} onChange={(e) => updateSource(e.target.value as ReportSource)}>
              {(Object.keys(SOURCE_CONFIG) as ReportSource[]).map((s) => (
                <option key={s} value={s}>
                  {SOURCE_CONFIG[s].label}
                </option>
              ))}
            </select>
          </div>
          <div className="fg">
            <label className="fl">Group by</label>
            <select className="fi" value={spec.group_by} onChange={(e) => setSpec((s) => ({ ...s, group_by: e.target.value }))}>
              {config.groupFields.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div className="fg">
            <label className="fl">Chart type</label>
            <select className="fi" value={spec.chart_type} onChange={(e) => setSpec((s) => ({ ...s, chart_type: e.target.value as ReportSpec['chart_type'] }))}>
              <option value="bar">Bar</option>
              <option value="line">Line</option>
              <option value="pie">Pie</option>
              <option value="table">Table</option>
            </select>
          </div>
        </div>
        <div className="fr3">
          <div className="fg">
            <label className="fl">Aggregation</label>
            <select
              className="fi"
              value={spec.aggregation}
              onChange={(e) =>
                setSpec((s) => ({
                  ...s,
                  aggregation: e.target.value as ReportSpec['aggregation'],
                  aggregation_field: e.target.value === 'count' ? null : s.aggregation_field || config.numericFields[0]?.value,
                }))
              }
            >
              <option value="sum">Sum</option>
              <option value="avg">Average</option>
              <option value="count">Count</option>
            </select>
          </div>
          {spec.aggregation !== 'count' && (
            <div className="fg">
              <label className="fl">Of field</label>
              <select
                className="fi"
                value={spec.aggregation_field || ''}
                onChange={(e) => setSpec((s) => ({ ...s, aggregation_field: e.target.value }))}
              >
                {config.numericFields.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="fg" style={{ marginTop: 6 }}>
          <label className="fl">Filters</label>
          {spec.filters.map((f, i) => {
            const fieldDef = config.filterFields.find((ff) => ff.value === f.field);
            return (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <select className="fi" style={{ flex: 1 }} value={f.field} onChange={(e) => updateFilter(i, { field: e.target.value })}>
                  {config.filterFields.map((ff) => (
                    <option key={ff.value} value={ff.value}>
                      {ff.label}
                    </option>
                  ))}
                </select>
                <select className="fi" style={{ width: 100 }} value={f.op} onChange={(e) => updateFilter(i, { op: e.target.value as ReportFilter['op'] })}>
                  {OPS.map((op) => (
                    <option key={op.value} value={op.value}>
                      {op.label}
                    </option>
                  ))}
                </select>
                {fieldDef?.type === 'bool' ? (
                  <select className="fi" style={{ flex: 1 }} value={String(f.value)} onChange={(e) => updateFilter(i, { value: e.target.value === 'true' })}>
                    <option value="true">True</option>
                    <option value="false">False</option>
                  </select>
                ) : (
                  <input
                    className="fi"
                    style={{ flex: 1 }}
                    type={fieldDef?.type === 'number' ? 'number' : fieldDef?.type === 'date' ? 'date' : 'text'}
                    value={String(f.value)}
                    onChange={(e) => updateFilter(i, { value: fieldDef?.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value })}
                  />
                )}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeFilter(i)}>
                  <IconTrash size={13} />
                </button>
              </div>
            );
          })}
          <button type="button" className="btn btn-sm" onClick={addFilter}>
            <IconPlus size={13} /> Add filter
          </button>
        </div>

        <div className="ma">
          <button type="button" className="btn" onClick={() => setShowSaveModal(true)}>
            <IconBookmark size={14} /> Save report
          </button>
          <button type="button" className="btn btn-p" onClick={() => runReport()} disabled={running}>
            {running ? 'Running…' : 'Run report'}
          </button>
        </div>
      </div>

      {saved.length > 0 && (
        <div className="filters" style={{ marginBottom: 16 }}>
          {saved.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`fb${activeReportId === r.id ? ' on' : ''}`}
              onClick={() => loadReport(r)}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {r.name}
              <span onClick={(e) => deleteReport(r.id, e)} style={{ display: 'flex' }}>
                <IconTrash size={11} />
              </span>
            </button>
          ))}
        </div>
      )}

      {result && (
        <div className="card" style={{ padding: 20 }}>
          <div className="sh">
            <div className="st">
              {result.rows.length} group{result.rows.length === 1 ? '' : 's'} · {result.total_rows} record{result.total_rows === 1 ? '' : 's'}
            </div>
          </div>

          {result.rows.length === 0 ? (
            <div className="empty-s">No data matches this report's filters.</div>
          ) : spec.chart_type === 'table' ? (
            <table className="tbl">
              <thead>
                <tr>
                  <th>{config.groupFields.find((f) => f.value === spec.group_by)?.label || 'Group'}</th>
                  <th style={{ textAlign: 'right' }}>{spec.aggregation === 'count' ? 'Count' : spec.aggregation === 'avg' ? 'Average' : 'Total'}</th>
                  <th style={{ textAlign: 'right' }}>Records</th>
                </tr>
              </thead>
              <tbody>
                {chartRows.map((row) => (
                  <tr key={row.group}>
                    <td style={{ fontWeight: 500 }}>{row.group}</td>
                    <td style={{ textAlign: 'right' }}>{spec.aggregation === 'count' ? row.value : fmt(row.value)}</td>
                    <td style={{ textAlign: 'right' }}>{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : spec.chart_type === 'pie' ? (
            <ResponsiveContainer width="100%" height={360}>
              <PieChart>
                <Pie
                  data={pieRows}
                  dataKey="value"
                  nameKey="group"
                  cx="50%"
                  cy="50%"
                  outerRadius={120}
                  label={(d: { group?: string; value?: number }) => `${d.group}: ${fmt(d.value || 0)}`}
                >
                  {pieRows.map((row, i) => (
                    <Cell key={row.group} fill={row.group === 'Other' ? OTHER_COLOR : CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length]} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip formatter={(v) => fmt(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
          ) : spec.chart_type === 'line' ? (
            <ResponsiveContainer width="100%" height={360}>
              <LineChart data={chartRows}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="group" tick={{ fontSize: 11, fill: 'var(--t2)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--t2)' }} />
                <Tooltip formatter={(v) => fmt(Number(v))} />
                <Line type="monotone" dataKey="value" stroke={CATEGORICAL_COLORS[0]} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={chartRows}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="group" tick={{ fontSize: 11, fill: 'var(--t2)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--t2)' }} />
                <Tooltip formatter={(v) => fmt(Number(v))} />
                <Bar dataKey="value" fill={CATEGORICAL_COLORS[0]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {showSaveModal && (
        <div className="mo" onClick={(e) => e.target === e.currentTarget && setShowSaveModal(false)}>
          <div className="mb">
            <div className="mt">Save report</div>
            <div className="fg">
              <label className="fl">Name</label>
              <input
                className="fi"
                autoFocus
                value={reportName}
                onChange={(e) => setReportName(e.target.value)}
                placeholder="Monthly spend by cost code"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    saveReport();
                  }
                }}
              />
            </div>
            <div className="ma">
              <button type="button" className="btn" onClick={() => setShowSaveModal(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-p" onClick={saveReport} disabled={!reportName.trim()}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
