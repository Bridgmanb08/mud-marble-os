import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { MetricCard } from '../components/ui/MetricCard';
import { fmt, fmtD } from '../lib/format';
import { useToast } from '../components/ui/Toast';
import type { DashboardSummary } from '../types';

const HEALTH_DOT: Record<string, string> = { green: 'dot-g', yellow: 'dot-a', red: 'dot-r' };

export default function Dashboard() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const toast = useToast();

  useEffect(() => {
    api
      .get<DashboardSummary>('/dashboard')
      .then(setData)
      .catch((e) => toast(e instanceof Error ? e.message : 'Failed to load dashboard', true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <>
      <div className="ph">
        <div>
          <h1>Good morning.</h1>
          <p>{dateStr}</p>
        </div>
      </div>

      {!data ? (
        <div className="empty">
          <div className="empty-t">Loading…</div>
        </div>
      ) : (
        <>
          <div className="metrics">
            <MetricCard label="Active builds" value={data.active_project_count} sub="on the tools now" />
            <MetricCard label="Total contract value" value={fmt(data.total_contract_value)} />
            <MetricCard label="Collected" value={fmt(data.total_collected)} sub={`${data.pct_collected}% of invoiced`} valueColor="var(--green)" />
            <MetricCard
              label="Outstanding"
              value={fmt(data.total_outstanding)}
              valueColor={data.total_outstanding > 0 ? 'var(--atx)' : undefined}
            />
          </div>

          {(data.overdue_invoices > 0 || data.open_change_orders > 0) && (
            <div className="alert alert-a">
              <strong>Needs attention:</strong>{' '}
              {data.overdue_invoices > 0 && `${data.overdue_invoices} overdue invoice(s). `}
              {data.open_change_orders > 0 && `${data.open_change_orders} change order(s) awaiting action.`}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="card" style={{ padding: 20 }}>
              <div className="st" style={{ marginBottom: 12 }}>
                Active project health
              </div>
              {data.active_projects.length ? (
                data.active_projects.map((p) => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <span className={`dot ${HEALTH_DOT[p.health_status || 'green']}`} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--t2)' }}>{p.client_name || 'No client'}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 13, color: 'var(--t2)' }}>No active projects.</div>
              )}
            </div>

            <div className="card" style={{ padding: 20 }}>
              <div className="st" style={{ marginBottom: 12 }}>
                Upcoming tasks
              </div>
              {data.upcoming_tasks.length ? (
                data.upcoming_tasks.map((t) => (
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
                ))
              ) : (
                <div style={{ fontSize: 13, color: 'var(--t2)' }}>No upcoming tasks.</div>
              )}
            </div>

            <div className="card" style={{ padding: 20, gridColumn: '1 / -1' }}>
              <div className="st" style={{ marginBottom: 12 }}>
                Recent activity
              </div>
              {data.recent_activity.length ? (
                data.recent_activity.map((n) => (
                  <div key={n.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 12 }}>
                      <strong>{n.author || 'Someone'}</strong> logged a {(n.note_type || 'note').replace('_', ' ')} on{' '}
                      <em>{n.project_name || 'a project'}</em>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 2 }}>{n.content.slice(0, 120)}</div>
                    <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{fmtD(n.created_at)}</div>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 13, color: 'var(--t2)' }}>No recent activity.</div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
