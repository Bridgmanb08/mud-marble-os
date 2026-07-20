import { useEffect, useMemo, useState } from 'react';
import { IconAlertTriangle, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { api } from '../../api/client';
import type { Subcontractor, Task } from '../../types';

const WEEKS_SHOWN = 6;

function startOfWeek(d: Date): Date {
  const r = new Date(d);
  r.setDate(r.getDate() - r.getDay());
  r.setHours(0, 0, 0, 0);
  return r;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function fmtShort(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function taskSpan(t: Task): [Date, Date] | null {
  const s = t.scheduled_start ? new Date(t.scheduled_start) : t.scheduled_end ? new Date(t.scheduled_end) : null;
  const e = t.scheduled_end ? new Date(t.scheduled_end) : t.scheduled_start ? new Date(t.scheduled_start) : null;
  if (!s || !e) return null;
  return [s, e];
}

interface SubcontractorScheduleGridProps {
  tasks: Task[];
  onOpenTask: (id: string) => void;
}

export function SubcontractorScheduleGrid({ tasks, onOpenTask }: SubcontractorScheduleGridProps) {
  const [subs, setSubs] = useState<Subcontractor[]>([]);
  const [cursor, setCursor] = useState(() => startOfWeek(new Date()));

  useEffect(() => {
    api.get<Subcontractor[]>('/subcontractors').then(setSubs).catch(() => {});
  }, []);

  const weeks = useMemo(() => {
    const out: Date[] = [];
    for (let i = 0; i < WEEKS_SHOWN; i++) out.push(addDays(cursor, i * 7));
    return out;
  }, [cursor]);

  const linkedTasks = tasks.filter((t) => t.subcontractor_id);
  const activeSubs = subs.filter((s) => s.is_active !== false);

  return (
    <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <button className="btn btn-sm btn-ghost" onClick={() => setCursor(addDays(cursor, -7 * WEEKS_SHOWN))}>
          <IconChevronLeft size={14} />
        </button>
        <div style={{ fontWeight: 600, fontSize: 14 }}>
          {fmtShort(weeks[0])} – {fmtShort(addDays(weeks[weeks.length - 1], 6))}
        </div>
        <button className="btn btn-sm btn-ghost" onClick={() => setCursor(addDays(cursor, 7 * WEEKS_SHOWN))}>
          <IconChevronRight size={14} />
        </button>
      </div>
      <table className="tbl" style={{ minWidth: 900 }}>
        <thead>
          <tr>
            <th style={{ position: 'sticky', left: 0, background: 'var(--surface)', zIndex: 1 }}>Subcontractor</th>
            {weeks.map((w) => (
              <th key={w.toISOString()} style={{ textAlign: 'center' }}>
                {fmtShort(w)} – {fmtShort(addDays(w, 6))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {activeSubs.length === 0 && (
            <tr>
              <td colSpan={weeks.length + 1} style={{ textAlign: 'center', color: 'var(--t2)', padding: 20 }}>
                No subcontractors yet.
              </td>
            </tr>
          )}
          {activeSubs.map((sub) => (
            <tr key={sub.id}>
              <td style={{ position: 'sticky', left: 0, background: 'var(--surface)', fontWeight: 500 }}>
                {sub.company_name}
                {sub.trade && <div style={{ fontSize: 11, color: 'var(--t2)', fontWeight: 400 }}>{sub.trade}</div>}
              </td>
              {weeks.map((w) => {
                const weekEnd = addDays(w, 6);
                const cellTasks = linkedTasks.filter((t) => {
                  if (t.subcontractor_id !== sub.id) return false;
                  const span = taskSpan(t);
                  if (!span) return false;
                  return span[0] <= weekEnd && span[1] >= w;
                });
                const projectNames = Array.from(new Set(cellTasks.map((t) => t.projects?.name?.replace(/\|.*/, '').trim() || 'Unassigned')));
                const overlap = projectNames.length > 1;
                return (
                  <td key={w.toISOString()} style={{ verticalAlign: 'top', background: overlap ? 'var(--rbg)' : undefined, minWidth: 130 }}>
                    {overlap && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--rtx)', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
                        <IconAlertTriangle size={12} /> Overlap
                      </div>
                    )}
                    {cellTasks.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className="btn-reset"
                        onClick={() => onOpenTask(t.id)}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          fontSize: 11,
                          padding: '2px 4px',
                          marginBottom: 2,
                          borderRadius: 3,
                          background: 'var(--bg)',
                          cursor: 'pointer',
                        }}
                        title={t.title}
                      >
                        {t.projects?.name?.replace(/\|.*/, '').trim() || 'Unassigned'}
                      </button>
                    ))}
                    {cellTasks.length === 0 && <span style={{ fontSize: 11, color: 'var(--t3)' }}>—</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
