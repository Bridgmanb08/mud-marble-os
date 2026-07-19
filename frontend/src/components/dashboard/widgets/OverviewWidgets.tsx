import { fmt, fmtD } from '../../../lib/format';
import type { DashboardSummary } from '../../../types';

const HEALTH_DOT: Record<string, string> = { green: 'dot-g', yellow: 'dot-a', red: 'dot-r' };

export function KeyMetricsWidget({ data }: { data: DashboardSummary }) {
  return (
    <div className="metrics" style={{ marginBottom: 0 }}>
      <div className="metric" style={{ padding: 0, border: 'none' }}>
        <div className="m-label">Active builds</div>
        <div className="m-val">{data.active_project_count}</div>
        <div className="m-sub">on the tools now</div>
      </div>
      <div className="metric" style={{ padding: 0, border: 'none' }}>
        <div className="m-label">Total contract value</div>
        <div className="m-val">{fmt(data.total_contract_value)}</div>
      </div>
      <div className="metric" style={{ padding: 0, border: 'none' }}>
        <div className="m-label">Collected</div>
        <div className="m-val" style={{ color: 'var(--green)' }}>
          {fmt(data.total_collected)}
        </div>
        <div className="m-sub">{data.pct_collected}% of invoiced</div>
      </div>
      <div className="metric" style={{ padding: 0, border: 'none' }}>
        <div className="m-label">Outstanding</div>
        <div className="m-val" style={{ color: data.total_outstanding > 0 ? 'var(--atx)' : undefined }}>
          {fmt(data.total_outstanding)}
        </div>
      </div>
    </div>
  );
}

export function ActiveProjectHealthWidget({ data }: { data: DashboardSummary }) {
  if (!data.active_projects.length) return <div style={{ fontSize: 13, color: 'var(--t2)' }}>No active projects.</div>;
  return (
    <>
      {data.active_projects.map((p) => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
          <span className={`dot ${HEALTH_DOT[p.health_status || 'green']}`} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 500 }}>{p.name}</div>
            <div style={{ fontSize: 11, color: 'var(--t2)' }}>{p.client_name || 'No client'}</div>
          </div>
        </div>
      ))}
    </>
  );
}

export function UpcomingTasksWidget({ data }: { data: DashboardSummary }) {
  if (!data.upcoming_tasks.length) return <div style={{ fontSize: 13, color: 'var(--t2)' }}>No upcoming tasks.</div>;
  return (
    <>
      {data.upcoming_tasks.map((t) => (
        <div key={t.id} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 500 }}>{t.title}</div>
            <div style={{ fontSize: 11, color: 'var(--t2)' }}>
              {t.project_name || ''}
              {t.assigned_to ? ` · ${t.assigned_to}` : ''}
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--t3)' }}>{fmtD(t.scheduled_end)}</div>
        </div>
      ))}
    </>
  );
}

export function RecentActivityWidget({ data }: { data: DashboardSummary }) {
  if (!data.recent_activity.length) return <div style={{ fontSize: 13, color: 'var(--t2)' }}>No recent activity.</div>;
  return (
    <>
      {data.recent_activity.map((n) => (
        <div key={n.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12 }}>
            <strong>{n.author || 'Someone'}</strong> logged a {(n.note_type || 'note').replace('_', ' ')} on{' '}
            <em>{n.project_name || 'a project'}</em>
          </div>
          <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 2 }}>{n.content.slice(0, 120)}</div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{fmtD(n.created_at)}</div>
        </div>
      ))}
    </>
  );
}
