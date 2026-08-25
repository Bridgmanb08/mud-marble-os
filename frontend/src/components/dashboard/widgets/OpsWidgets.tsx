import { useMemo, useState } from 'react';
import { fmtD } from '../../../lib/format';
import { DashboardTaskDrawer } from '../DashboardTaskDrawer';
import { api, ApiError } from '../../../api/client';
import { useToast } from '../../ui/Toast';
import type { DashboardSummary } from '../../../types';

export function TaskManagementWidget({ data }: { data: DashboardSummary }) {
  const toast = useToast();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const items = data.contractor_milestones.filter((t) => !dismissed.has(t.id));

  async function markComplete(id: string) {
    try {
      await api.patch(`/tasks/${id}`, { status: 'complete' });
      setDismissed((prev) => new Set(prev).add(id));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to update task', true);
    }
  }

  // Grouping/sorting was previously recomputed inline on every render,
  // including the frequent case of a single checkbox toggle (which only
  // changes local `dismissed` state) -- memoized so it only reruns when the
  // underlying milestone list or dismissed set actually changes.
  const { groups, groupNames } = useMemo(() => {
    const g = new Map<string, typeof items>();
    for (const t of items) {
      const key = t.project_name || 'No project';
      if (!g.has(key)) g.set(key, []);
      g.get(key)!.push(t);
    }
    const names = Array.from(g.keys()).sort((a, b) => {
      if (a === 'No project') return 1;
      if (b === 'No project') return -1;
      return a.localeCompare(b);
    });
    return { groups: g, groupNames: names };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.contractor_milestones, dismissed]);

  if (!items.length) return <div style={{ fontSize: 13, color: 'var(--t2)' }}>No milestones scheduled.</div>;

  return (
    <>
      {groupNames.map((project) => (
        <div key={project} style={{ marginBottom: 4 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--t2)',
              textTransform: 'uppercase',
              letterSpacing: 0.3,
              margin: '10px 0 2px',
            }}
          >
            {project} ({groups.get(project)!.length})
          </div>
          {groups.get(project)!.map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <input
                type="checkbox"
                title="Mark complete"
                onChange={() => markComplete(t.id)}
                style={{ cursor: 'pointer', flexShrink: 0 }}
              />
              <button
                type="button"
                className="btn-reset"
                onClick={() => setOpenTaskId(t.id)}
                style={{ display: 'flex', flex: 1, minWidth: 0, textAlign: 'left', alignItems: 'center', gap: 10, cursor: 'pointer' }}
              >
                <span className={`dot ${t.overdue ? 'dot-r' : 'dot-g'}`} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{t.title}</div>
                  {t.assigned_to && <div style={{ fontSize: 11, color: 'var(--t2)' }}>{t.assigned_to}</div>}
                </div>
                {(t.overdue || t.days_until_due !== null) && (
                  <span className={`badge ${t.overdue ? 'bg-red' : 'bg-gray'}`}>
                    {t.overdue ? `${Math.abs(t.days_until_due ?? 0)}d overdue` : `${t.days_until_due}d left`}
                  </span>
                )}
              </button>
            </div>
          ))}
        </div>
      ))}
      {openTaskId && <DashboardTaskDrawer taskId={openTaskId} onClose={() => setOpenTaskId(null)} />}
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
