import { useState } from 'react';
import { fmtD } from '../../../lib/format';
import { TaskQuickViewModal } from '../TaskQuickViewModal';
import type { DashboardSummary } from '../../../types';

type Milestone = DashboardSummary['contractor_milestones'][number];

export function ContractorMilestonesWidget({ data }: { data: DashboardSummary }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Milestone | null>(null);
  const items = data.contractor_milestones.filter((t) => !dismissed.has(t.id));
  if (!items.length) return <div style={{ fontSize: 13, color: 'var(--t2)' }}>No milestones scheduled.</div>;
  return (
    <>
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          className="btn-reset"
          onClick={() => setSelected(t)}
          style={{
            display: 'flex',
            width: '100%',
            textAlign: 'left',
            alignItems: 'center',
            gap: 10,
            padding: '7px 0',
            borderBottom: '1px solid var(--border)',
            cursor: 'pointer',
          }}
        >
          <span className={`dot ${t.overdue ? 'dot-r' : 'dot-g'}`} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 500 }}>{t.title}</div>
            <div style={{ fontSize: 11, color: 'var(--t2)' }}>
              {t.project_name || ''}
              {t.assigned_to ? ` · ${t.assigned_to}` : ''}
            </div>
          </div>
          <span className={`badge ${t.overdue ? 'bg-red' : 'bg-gray'}`}>
            {t.overdue
              ? `${Math.abs(t.days_until_due ?? 0)}d overdue`
              : t.days_until_due !== null
                ? `${t.days_until_due}d left`
                : fmtD(t.scheduled_end)}
          </span>
        </button>
      ))}
      {selected && (
        <TaskQuickViewModal
          task={selected}
          onClose={() => setSelected(null)}
          onChanged={() => setDismissed((prev) => new Set(prev).add(selected.id))}
        />
      )}
    </>
  );
}

export function ClientCommunicationsWidget({ data }: { data: DashboardSummary }) {
  const items = data.client_communications;
  if (!items.length) return <div style={{ fontSize: 13, color: 'var(--t2)' }}>No active projects.</div>;
  return (
    <>
      {items.map((c) => (
        <div key={c.project_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 500 }}>{c.project_name}</div>
            <div style={{ fontSize: 11, color: 'var(--t2)' }}>
              {c.last_contact_at ? `Last contact ${fmtD(c.last_contact_at)}` : 'No contact logged yet'}
            </div>
          </div>
          {c.overdue && <span className="badge bg-red">Update due</span>}
        </div>
      ))}
    </>
  );
}

export function ChangeOrdersActionWidget({ data }: { data: DashboardSummary }) {
  const items = data.change_orders_action;
  if (!items.length)
    return <div style={{ fontSize: 13, color: 'var(--t2)' }}>No change orders need action.</div>;
  return (
    <>
      {items.map((co) => (
        <div key={co.id} style={{ padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 500 }}>
              CO-{String(co.co_number ?? '?').padStart(3, '0')} · {co.title}
            </div>
            {co.sop_breach ? (
              <span className="badge bg-red">{co.hours_since_sent}h overdue</span>
            ) : (
              <span className="badge bg-amber">{co.status}</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 2 }}>{co.project_name}</div>
        </div>
      ))}
    </>
  );
}
