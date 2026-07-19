import type { DashboardSummary } from '../../../types';

export function DesignProjectsWidget({ data }: { data: DashboardSummary }) {
  if (!data.design_projects.length)
    return <div style={{ fontSize: 13, color: 'var(--t2)' }}>No active projects.</div>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
      {data.design_projects.map((p) => (
        <div
          key={p.project_id}
          className="card"
          style={{ padding: 14, borderColor: p.at_risk ? 'var(--red)' : undefined }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{p.project_name}</div>
            {p.at_risk && <span className="badge bg-red">At risk</span>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--t2)', marginBottom: 4 }}>Timeline</div>
          <div style={{ height: 6, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden', marginBottom: 10 }}>
            <div style={{ height: '100%', width: `${p.timeline_pct ?? 0}%`, background: 'var(--blue)' }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--t2)', marginBottom: 4 }}>Tasks complete</div>
          <div style={{ height: 6, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${p.task_completion_pct ?? 0}%`, background: 'var(--green)' }} />
          </div>
        </div>
      ))}
    </div>
  );
}
