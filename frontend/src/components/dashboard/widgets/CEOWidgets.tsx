import { useState } from 'react';
import { IconSparkles } from '@tabler/icons-react';
import { api, ApiError } from '../../../api/client';
import { fmt, fmtD } from '../../../lib/format';
import type { DashboardSummary, TeamWorkloadInsightsResponse } from '../../../types';

const LEAD_STAGE_LABELS: Record<string, string> = {
  new: 'New',
  stage_1: 'Initial Walkthrough',
  stage_2: 'Working On Proposal',
  stage_3: 'Negotiations',
  stage_4: 'Paid For Initial Step',
  stage_5: 'Signed!',
  stage_6_lost: 'Missed Opportunity',
  converted: 'Converted',
};

const TASK_PRIORITY_COLOR: Record<string, string> = {
  low: 'var(--green)',
  normal: 'var(--border-md)',
  high: 'var(--amber)',
  urgent: 'var(--red)',
};

export function TeamWorkloadWidget({ data }: { data: DashboardSummary }) {
  const [insights, setInsights] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function getInsights() {
    setLoading(true);
    setError('');
    try {
      const res = await api.post<TeamWorkloadInsightsResponse>('/dashboard/team-workload-insights');
      setInsights(res.summaries);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to generate insights');
    } finally {
      setLoading(false);
    }
  }

  if (!data.team_workload.length) return <div style={{ fontSize: 13, color: 'var(--t2)' }}>No tasks assigned yet.</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button type="button" className="btn btn-sm" onClick={getInsights} disabled={loading}>
          <IconSparkles size={14} /> {loading ? 'Thinking…' : 'Get AI insights'}
        </button>
      </div>
      {error && <div className="merr" style={{ marginBottom: 10 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
        {data.team_workload.map((w) => (
          <div
            key={w.user_id || w.name}
            style={{ flex: '0 0 220px', background: 'var(--bg)', borderRadius: 10, padding: 12 }}
          >
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>{w.name}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              <span className="badge bg-gray">{w.incomplete_count} open</span>
              {w.completed_this_week > 0 && <span className="badge bg-green">{w.completed_this_week} done</span>}
              {w.overdue_count > 0 && <span className="badge bg-red">{w.overdue_count} overdue</span>}
            </div>
            {insights[w.name] && (
              <div style={{ fontSize: 11.5, color: 'var(--t2)', fontStyle: 'italic', marginBottom: 10, lineHeight: 1.4 }}>
                "{insights[w.name]}"
              </div>
            )}
            {w.top_tasks.length === 0 ? (
              <div style={{ fontSize: 11.5, color: 'var(--t3)' }}>Nothing open right now.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {w.top_tasks.map((t) => (
                  <div key={t.id} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: TASK_PRIORITY_COLOR[t.priority] || 'var(--border-md)',
                        marginTop: 4,
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.title}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--t3)' }}>
                        {t.project_name || 'No job'}
                        {t.due_date ? ` · ${fmtD(t.due_date)}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function JobsOverdueToCloseWidget({ data }: { data: DashboardSummary }) {
  const { jobs, total_potential_revenue, construction_total, allowance_total, pm_fee_total } = data.jobs_overdue_to_close;
  if (!jobs.length) return <div style={{ fontSize: 13, color: 'var(--t2)' }}>Nothing overdue — every job is either closed or on schedule.</div>;
  return (
    <>
      <div className="kpi-row" style={{ marginBottom: 12 }}>
        <div className="kpi">
          <div className="kpi-val" style={{ color: 'var(--atx)' }}>
            {jobs.length}
          </div>
          <div className="kpi-label">Jobs overdue to close</div>
        </div>
        <div className="kpi">
          <div className="kpi-val">{fmt(total_potential_revenue)}</div>
          <div className="kpi-label">Potential revenue</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: 8, marginBottom: 12 }}>
        <div style={{ textAlign: 'center', padding: 8, background: 'var(--bg)', borderRadius: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{fmt(construction_total)}</div>
          <div style={{ fontSize: 10, color: 'var(--t2)' }}>Construction</div>
        </div>
        <div style={{ textAlign: 'center', padding: 8, background: 'var(--bg)', borderRadius: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{fmt(allowance_total)}</div>
          <div style={{ fontSize: 10, color: 'var(--t2)' }}>Allowance</div>
        </div>
        <div style={{ textAlign: 'center', padding: 8, background: 'var(--bg)', borderRadius: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{fmt(pm_fee_total)}</div>
          <div style={{ fontSize: 10, color: 'var(--t2)' }}>PM fee</div>
        </div>
      </div>
      {jobs.map((j) => (
        <div key={j.project_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500 }}>{j.project_name}</div>
            <div style={{ fontSize: 11, color: 'var(--t2)' }}>{fmtD(j.estimated_completion)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{fmt(j.potential_revenue)}</div>
            <div style={{ fontSize: 11, color: 'var(--red)' }}>{j.days_overdue}d overdue</div>
          </div>
        </div>
      ))}
    </>
  );
}

export function LeadPipelineWidget({ data }: { data: DashboardSummary }) {
  const { stages, total_open_count, total_potential_revenue_min, total_potential_revenue_max } = data.lead_pipeline;
  return (
    <>
      <div className="kpi-row" style={{ marginBottom: 12 }}>
        <div className="kpi">
          <div className="kpi-val">{total_open_count}</div>
          <div className="kpi-label">Open leads</div>
        </div>
        <div className="kpi">
          <div className="kpi-val">
            {fmt(total_potential_revenue_min)}–{fmt(total_potential_revenue_max)}
          </div>
          <div className="kpi-label">Pipeline potential</div>
        </div>
      </div>
      {stages.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--t2)' }}>No leads yet.</div>
      ) : (
        stages.map((s) => (
          <div key={s.status} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, fontWeight: 500, textTransform: 'capitalize' }}>{LEAD_STAGE_LABELS[s.status] || s.status}</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
              <span style={{ fontSize: 11, color: 'var(--t2)' }}>
                {fmt(s.potential_revenue_min)}–{fmt(s.potential_revenue_max)}
              </span>
              <span className="badge bg-gray">{s.count}</span>
            </div>
          </div>
        ))
      )}
    </>
  );
}

export function SubcontractorRiskWidget({ data }: { data: DashboardSummary }) {
  const { total_active, missing_w9, insurance_expired, insurance_expiring_soon } = data.subcontractor_risk;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
      <div style={{ textAlign: 'center', padding: 12, background: 'var(--bg)', borderRadius: 8 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{total_active}</div>
        <div style={{ fontSize: 10, color: 'var(--t2)', textTransform: 'uppercase' }}>Active subs</div>
      </div>
      <div style={{ textAlign: 'center', padding: 12, background: 'var(--bg)', borderRadius: 8 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: missing_w9 > 0 ? 'var(--atx)' : 'var(--green)' }}>{missing_w9}</div>
        <div style={{ fontSize: 10, color: 'var(--t2)', textTransform: 'uppercase' }}>Missing W9</div>
      </div>
      <div style={{ textAlign: 'center', padding: 12, background: 'var(--bg)', borderRadius: 8 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: insurance_expired > 0 ? 'var(--red)' : 'var(--green)' }}>{insurance_expired}</div>
        <div style={{ fontSize: 10, color: 'var(--t2)', textTransform: 'uppercase' }}>Insurance expired</div>
      </div>
      <div style={{ textAlign: 'center', padding: 12, background: 'var(--bg)', borderRadius: 8 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: insurance_expiring_soon > 0 ? 'var(--atx)' : 'var(--green)' }}>
          {insurance_expiring_soon}
        </div>
        <div style={{ fontSize: 10, color: 'var(--t2)', textTransform: 'uppercase' }}>Expiring in 30d</div>
      </div>
    </div>
  );
}

export function ChangeOrderStatsWidget({ data }: { data: DashboardSummary }) {
  const { approved_count, rejected_count, pending_count, win_rate_pct, approved_revenue_total } = data.change_order_stats;
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Win rate</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: win_rate_pct >= 70 ? 'var(--green)' : win_rate_pct >= 40 ? 'var(--atx)' : 'var(--red)' }}>
          {win_rate_pct}%
        </span>
      </div>
      <div style={{ height: 8, background: 'var(--bg)', borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ height: '100%', width: `${win_rate_pct}%`, background: 'var(--green)' }} />
      </div>
      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-val" style={{ color: 'var(--green)' }}>
            {approved_count}
          </div>
          <div className="kpi-label">Approved</div>
        </div>
        <div className="kpi">
          <div className="kpi-val" style={{ color: 'var(--red)' }}>
            {rejected_count}
          </div>
          <div className="kpi-label">Rejected</div>
        </div>
        <div className="kpi">
          <div className="kpi-val">{pending_count}</div>
          <div className="kpi-label">Pending</div>
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 10 }}>
        <strong>{fmt(approved_revenue_total)}</strong> in additional revenue from approved change orders
      </div>
    </>
  );
}

export function EstimateWinRateWidget({ data }: { data: DashboardSummary }) {
  const { sent_count, approved_count, rejected_count, win_rate_pct, pipeline_value } = data.estimate_win_rate;
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Win rate</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: win_rate_pct >= 50 ? 'var(--green)' : 'var(--atx)' }}>{win_rate_pct}%</span>
      </div>
      <div style={{ height: 8, background: 'var(--bg)', borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ height: '100%', width: `${win_rate_pct}%`, background: 'var(--green)' }} />
      </div>
      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-val">{sent_count}</div>
          <div className="kpi-label">Sent</div>
        </div>
        <div className="kpi">
          <div className="kpi-val" style={{ color: 'var(--green)' }}>
            {approved_count}
          </div>
          <div className="kpi-label">Approved</div>
        </div>
        <div className="kpi">
          <div className="kpi-val" style={{ color: 'var(--red)' }}>
            {rejected_count}
          </div>
          <div className="kpi-label">Rejected</div>
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 10 }}>
        <strong>{fmt(pipeline_value)}</strong> awaiting a client decision right now
      </div>
    </>
  );
}
