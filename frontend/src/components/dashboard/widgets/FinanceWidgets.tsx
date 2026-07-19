import { fmt } from '../../../lib/format';
import type { DashboardSummary } from '../../../types';

const BUCKET_LABELS: Record<string, string> = {
  current: 'Current',
  '1-30': '1–30 days',
  '31-60': '31–60 days',
  '61-90': '61–90 days',
  '90+': '90+ days',
};

export function ARAgingWidget({ data }: { data: DashboardSummary }) {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, marginBottom: 14 }}>
        {data.ar_aging.map((b) => (
          <div key={b.bucket} style={{ textAlign: 'center', padding: 10, background: 'var(--bg)', borderRadius: 8 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: b.bucket === '90+' ? 'var(--red)' : undefined }}>
              {fmt(b.total)}
            </div>
            <div style={{ fontSize: 10, color: 'var(--t2)', marginTop: 2 }}>{BUCKET_LABELS[b.bucket]}</div>
          </div>
        ))}
      </div>
      {data.ar_aging_detail.length ? (
        data.ar_aging_detail.map((d, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500 }}>{d.project_name}</div>
              <div style={{ fontSize: 11, color: 'var(--t2)' }}>{d.client_name || ''}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{fmt(d.amount_outstanding)}</div>
              <div style={{ fontSize: 11, color: 'var(--t3)' }}>{d.days_overdue}d overdue</div>
            </div>
          </div>
        ))
      ) : (
        <div style={{ fontSize: 13, color: 'var(--t2)' }}>Nothing outstanding.</div>
      )}
    </>
  );
}

export function ProjectProfitabilityWidget({ data }: { data: DashboardSummary }) {
  if (!data.project_profitability.length)
    return <div style={{ fontSize: 13, color: 'var(--t2)' }}>No project financial data yet.</div>;
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>Project</th>
          <th>Estimated</th>
          <th>Actual spend</th>
          <th>Variance</th>
        </tr>
      </thead>
      <tbody>
        {data.project_profitability.map((p) => (
          <tr key={p.project_id}>
            <td style={{ fontWeight: 500 }}>{p.project_name}</td>
            <td>{fmt(p.estimated)}</td>
            <td>{fmt(p.actual_spend)}</td>
            <td style={{ color: p.variance < 0 ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>{fmt(p.variance)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function QBOSyncWidget({ data }: { data: DashboardSummary }) {
  const { unsynced_count, total_count, most_recent_transaction_date } = data.qbo_sync;
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <div className="kpi" style={{ flex: 1, textAlign: 'center', padding: 12, background: 'var(--bg)', borderRadius: 8 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: unsynced_count > 0 ? 'var(--atx)' : 'var(--green)' }}>
          {unsynced_count}
        </div>
        <div style={{ fontSize: 10, color: 'var(--t2)', textTransform: 'uppercase' }}>Unsynced</div>
      </div>
      <div className="kpi" style={{ flex: 1, textAlign: 'center', padding: 12, background: 'var(--bg)', borderRadius: 8 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{total_count}</div>
        <div style={{ fontSize: 10, color: 'var(--t2)', textTransform: 'uppercase' }}>Total txns</div>
      </div>
      <div className="kpi" style={{ flex: 1, textAlign: 'center', padding: 12, background: 'var(--bg)', borderRadius: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4 }}>
          {most_recent_transaction_date ? new Date(most_recent_transaction_date).toLocaleDateString() : '—'}
        </div>
        <div style={{ fontSize: 10, color: 'var(--t2)', textTransform: 'uppercase' }}>Most recent txn</div>
      </div>
    </div>
  );
}

export function CashPositionWidget({ data }: { data: DashboardSummary }) {
  const { total_income, total_expense, net } = data.cash_position;
  return (
    <div className="kpi-row">
      <div className="kpi">
        <div className="kpi-val" style={{ color: 'var(--green)' }}>
          {fmt(total_income)}
        </div>
        <div className="kpi-label">Income</div>
      </div>
      <div className="kpi">
        <div className="kpi-val" style={{ color: 'var(--red)' }}>
          {fmt(total_expense)}
        </div>
        <div className="kpi-label">Expense</div>
      </div>
      <div className="kpi">
        <div className="kpi-val">{fmt(net)}</div>
        <div className="kpi-label">Net</div>
      </div>
    </div>
  );
}

export function AlexCostWidget({ data }: { data: DashboardSummary }) {
  const { month_to_date_spend, monthly_target, pct_of_target } = data.alex_cost;
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{fmt(month_to_date_spend)} of {fmt(monthly_target)}</span>
        <span style={{ fontSize: 13, color: pct_of_target > 100 ? 'var(--red)' : 'var(--t2)' }}>{pct_of_target}%</span>
      </div>
      <div style={{ height: 8, background: 'var(--bg)', borderRadius: 4, overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${Math.min(100, pct_of_target)}%`,
            background: pct_of_target > 100 ? 'var(--red)' : 'var(--green)',
          }}
        />
      </div>
      <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 8 }}>Month-to-date, matched by vendor name</div>
    </>
  );
}
