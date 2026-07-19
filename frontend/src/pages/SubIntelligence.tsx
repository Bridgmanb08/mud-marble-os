import { useEffect, useState } from 'react';
import { IconBulb } from '@tabler/icons-react';
import { api } from '../api/client';
import { useToast } from '../components/ui/Toast';
import { fmt, fmtD } from '../lib/format';
import type { SubIntelligenceSummary } from '../types';

const CATEGORY_NAMES: Record<string, string> = {
  '01': 'Preliminary',
  '02': 'Business ops',
  '03': 'Site work',
  '04': 'Foundation',
  '05': 'Framing',
  '06': 'Roofing',
  '07': 'Plumbing',
  '08': 'Electrical',
  '09': 'HVAC',
  '10': 'Drywall',
  '11': 'Glass',
  '12': 'Carpentry',
  '13': 'Doors/Windows',
  '14': 'Paint',
  '15': 'Flooring/Tile',
  '16': 'Appliances',
  '17': 'Masonry',
  '18': 'Exterior',
  '19': 'Cleanup',
  '20': 'Allowances',
};

const SCORECARD_COLOR: Record<string, string> = {
  good: 'var(--green)',
  warn: 'var(--amber)',
  bad: 'var(--red)',
};

const STATUS_BADGE: Record<string, string> = {
  none: 'bg-gray',
  ok: 'bg-gray',
  expiring: 'bg-amber',
  expired: 'bg-red',
};

export default function SubIntelligence() {
  const [data, setData] = useState<SubIntelligenceSummary | null>(null);
  const toast = useToast();

  useEffect(() => {
    api
      .get<SubIntelligenceSummary>('/sub-intelligence')
      .then(setData)
      .catch((e) => toast(e instanceof Error ? e.message : 'Failed to load business intelligence', true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data) {
    return (
      <>
        <div className="ph">
          <div>
            <h1>Business Intelligence</h1>
            <p>Insights to run Mud &amp; Marble smarter — powered by your real data</p>
          </div>
        </div>
        <div className="empty">
          <div className="empty-t">Loading…</div>
        </div>
      </>
    );
  }

  const oversight = data.co_breakdown.find((b) => b.key === 'oversight');
  const maxCatVal = data.spend_by_category[0]?.total || 1;

  return (
    <>
      <div className="ph">
        <div>
          <h1>Business Intelligence</h1>
          <p>Insights to run Mud &amp; Marble smarter — powered by your real data</p>
        </div>
      </div>

      <div className="metrics">
        <div className="metric">
          <div className="m-label">Avg project value</div>
          <div className="m-val" style={{ fontSize: 17 }}>
            {fmt(data.avg_project_value)}
          </div>
          <div className="m-sub">across {data.project_count} projects</div>
        </div>
        <div className="metric">
          <div className="m-label">Overall margin</div>
          <div className="m-val" style={{ color: SCORECARD_COLOR[data.overall_margin >= 20 ? 'good' : data.overall_margin >= 10 ? 'warn' : 'bad'] }}>
            {data.overall_margin}%
          </div>
          <div className="m-sub">target: 20–35%</div>
        </div>
        <div className="metric">
          <div className="m-label">CO approval rate</div>
          <div className="m-val">{data.co_approval_rate}%</div>
          <div className="m-sub">
            {data.co_approved_count} of {data.co_total_count} COs
          </div>
        </div>
        <div className="metric">
          <div className="m-label">CO revenue added</div>
          <div className="m-val" style={{ fontSize: 17, color: 'var(--green)' }}>
            {fmt(data.co_total_value)}
          </div>
          <div className="m-sub">from change orders</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="card" style={{ padding: 18 }}>
          <div className="ibt">Change order breakdown</div>
          {data.co_breakdown.map((row) => (
            <div key={row.key} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{row.label}</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  {fmt(row.total)} <span style={{ fontSize: 11, color: 'var(--t2)', fontWeight: 400 }}>{row.count} COs</span>
                </span>
              </div>
              <div style={{ height: 8, background: 'var(--bg)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${row.pct}%`, background: 'var(--accent)', borderRadius: 4 }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 2 }}>{row.pct}% of all change orders</div>
            </div>
          ))}
          {oversight && oversight.count > 0 && (
            <div style={{ background: 'var(--abg)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: 'var(--atx)', marginTop: 8 }}>
              <IconBulb size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
              <strong>Insight:</strong> {oversight.pct}% of your COs are oversight. Every oversight CO is a margin hit. Reviewing past oversight
              COs by cost code can tighten your estimating.
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 18 }}>
          <div className="ibt">Top spend categories</div>
          {data.spend_by_category.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--t2)' }}>Add transactions with cost codes to see spend breakdown.</div>
          ) : (
            data.spend_by_category.map((c) => (
              <div key={c.code} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--t2)', width: 90, flexShrink: 0 }}>{CATEGORY_NAMES[c.code] || `Cat ${c.code}`}</div>
                <div style={{ flex: 1, height: 14, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.round((c.total / maxCatVal) * 100)}%`, background: 'var(--blue, var(--accent))', borderRadius: 3 }} />
                </div>
                <div style={{ fontSize: 12, fontWeight: 500, width: 70, textAlign: 'right', flexShrink: 0 }}>{fmt(c.total)}</div>
              </div>
            ))
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="card" style={{ padding: 18, overflowX: 'auto' }}>
          <div className="ibt">Project performance vs estimate</div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Project</th>
                <th style={{ textAlign: 'right' }}>Contract</th>
                <th style={{ textAlign: 'right' }}>COs</th>
                <th style={{ textAlign: 'right' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.project_performance.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', color: 'var(--t2)', padding: 16 }}>
                    No active projects
                  </td>
                </tr>
              ) : (
                data.project_performance.map((p) => (
                  <tr key={p.project_id}>
                    <td style={{ fontSize: 12, fontWeight: 500, maxWidth: 140, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p.project_name}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: 12 }}>{fmt(p.contract_value)}</td>
                    <td style={{ textAlign: 'right', fontSize: 12, color: p.co_total > 0 ? 'var(--green)' : undefined }}>
                      {p.co_total > 0 ? `+${fmt(p.co_total)}` : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="badge bg-gray">{p.status.replace('_', ' ')}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="card" style={{ padding: 18 }}>
          <div className="ibt">Business health scorecard</div>
          {data.scorecard.map((item) => (
            <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{item.label}</div>
                <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 2 }}>Target: {item.target}</div>
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: SCORECARD_COLOR[item.status] }}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 18, overflowX: 'auto' }}>
        <div className="ibt">Subcontractor roster &amp; compliance</div>
        {data.subcontractors.length === 0 ? (
          <div className="empty">
            <div className="empty-t">No subcontractors yet</div>
            <div className="empty-s">Add subs from the Subcontractors page to see intelligence here.</div>
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Company</th>
                <th>Trade</th>
                <th>Contact</th>
                <th>Phone</th>
                <th style={{ textAlign: 'center' }}>W9</th>
                <th style={{ textAlign: 'center' }}>Insurance</th>
                <th style={{ textAlign: 'center' }}>Rating</th>
                <th style={{ textAlign: 'center' }}>Preferred</th>
              </tr>
            </thead>
            <tbody>
              {data.subcontractors.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 500 }}>{s.company_name}</td>
                  <td style={{ fontSize: 12, color: 'var(--t2)' }}>{s.trade || '—'}</td>
                  <td style={{ fontSize: 12 }}>{s.contact_name || '—'}</td>
                  <td style={{ fontSize: 12 }}>{s.phone || '—'}</td>
                  <td style={{ textAlign: 'center' }}>
                    {s.w9_on_file ? <span style={{ color: 'var(--green)' }}>✓</span> : <span className="badge bg-amber">Missing</span>}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {s.insurance_status === 'none' ? (
                      <span style={{ color: 'var(--t3)', fontSize: 11 }}>—</span>
                    ) : (
                      <span className={`badge ${STATUS_BADGE[s.insurance_status]}`}>{fmtD(s.insurance_expiry)}</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>{s.rating ? '★'.repeat(s.rating) + '☆'.repeat(5 - s.rating) : '—'}</td>
                  <td style={{ textAlign: 'center' }}>{s.preferred ? <span className="badge bg-green">Yes</span> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
