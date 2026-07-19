import { useEffect, useMemo, useState } from 'react';
import { IconChevronLeft, IconChevronRight, IconCalendar, IconList } from '@tabler/icons-react';
import { api } from '../api/client';
import { useToast } from '../components/ui/Toast';
import { fmtD } from '../lib/format';
import type { Task } from '../types';
import { TaskDetailDrawer } from '../components/tasks/TaskDetailDrawer';

const STATUS_COLOR: Record<string, string> = {
  upcoming: 'var(--border-md)',
  in_progress: 'var(--amber)',
  delayed: 'var(--red)',
  blocked: 'var(--red)',
  complete: 'var(--green)',
};

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Schedule() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [detailTask, setDetailTask] = useState<Task | undefined>(undefined);
  const toast = useToast();

  async function load() {
    try {
      setTasks(await api.get<Task[]>('/tasks'));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load schedule', true);
      setTasks([]);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks || []) {
      const d = t.scheduled_end || t.scheduled_start;
      if (!d) continue;
      const key = dateKey(new Date(d));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return map;
  }, [tasks]);

  const datedSorted = useMemo(() => {
    return (tasks || [])
      .filter((t) => t.scheduled_end || t.scheduled_start)
      .sort((a, b) => new Date(a.scheduled_end || a.scheduled_start!).getTime() - new Date(b.scheduled_end || b.scheduled_start!).getTime());
  }, [tasks]);

  const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const weeks = useMemo(() => {
    const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(firstOfMonth);
    start.setDate(start.getDate() - start.getDay());
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
    const out: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
    return out;
  }, [cursor]);

  function openTask(id: string) {
    const t = tasks?.find((t) => t.id === id);
    if (t) setDetailTask(t);
  }

  const today = dateKey(new Date());

  return (
    <>
      <div className="ph">
        <div>
          <h1>Schedule</h1>
          <p>Task and milestone calendar across all active projects</p>
        </div>
        <div style={{ display: 'flex', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 3, gap: 2 }}>
          <button
            className="btn btn-sm btn-ghost"
            style={{ background: view === 'calendar' ? 'var(--surface)' : undefined, boxShadow: view === 'calendar' ? '0 1px 3px rgba(0,0,0,.08)' : undefined }}
            onClick={() => setView('calendar')}
          >
            <IconCalendar size={14} /> Calendar
          </button>
          <button
            className="btn btn-sm btn-ghost"
            style={{ background: view === 'list' ? 'var(--surface)' : undefined, boxShadow: view === 'list' ? '0 1px 3px rgba(0,0,0,.08)' : undefined }}
            onClick={() => setView('list')}
          >
            <IconList size={14} /> List
          </button>
        </div>
      </div>

      {tasks === null ? (
        <div className="empty">
          <div className="empty-t">Loading…</div>
        </div>
      ) : view === 'calendar' ? (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <button className="btn btn-sm btn-ghost" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
              <IconChevronLeft size={14} />
            </button>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{monthLabel}</div>
            <button className="btn btn-sm btn-ghost" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
              <IconChevronRight size={14} />
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} style={{ padding: '6px 8px', fontSize: 11, fontWeight: 600, color: 'var(--t2)', textAlign: 'center' }}>
                {d}
              </div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: wi < weeks.length - 1 ? '1px solid var(--border)' : undefined }}>
              {week.map((day) => {
                const key = dateKey(day);
                const inMonth = day.getMonth() === cursor.getMonth();
                const dayTasks = tasksByDay.get(key) || [];
                return (
                  <div
                    key={key}
                    style={{
                      minHeight: 90,
                      padding: 6,
                      borderRight: '1px solid var(--border)',
                      opacity: inMonth ? 1 : 0.35,
                      background: key === today ? 'var(--bg)' : undefined,
                    }}
                  >
                    <div style={{ fontSize: 11, color: key === today ? 'var(--accent)' : 'var(--t2)', fontWeight: key === today ? 700 : 500, marginBottom: 4 }}>
                      {day.getDate()}
                    </div>
                    {dayTasks.slice(0, 3).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className="btn-reset"
                        onClick={() => openTask(t.id)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          fontSize: 11,
                          padding: '2px 5px',
                          marginBottom: 2,
                          borderRadius: 3,
                          background: 'var(--bg)',
                          borderLeft: `2px solid ${STATUS_COLOR[t.status] || 'var(--border-md)'}`,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={t.title}
                      >
                        {t.title}
                      </button>
                    ))}
                    {dayTasks.length > 3 && <div style={{ fontSize: 10, color: 'var(--t2)' }}>+{dayTasks.length - 3} more</div>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          {datedSorted.length === 0 ? (
            <div className="empty">
              <div className="empty-t">No scheduled tasks</div>
            </div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Title</th>
                  <th>Project</th>
                  <th>Assignee</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {datedSorted.map((t) => (
                  <tr key={t.id} onClick={() => openTask(t.id)}>
                    <td>{fmtD(t.scheduled_end || t.scheduled_start)}</td>
                    <td style={{ fontWeight: 500 }}>{t.title}</td>
                    <td>{t.projects?.name?.replace(/\|.*/, '').trim() || '—'}</td>
                    <td>{t.assigned_to || '—'}</td>
                    <td>
                      <span className="badge bg-gray">{t.status.replace('_', ' ')}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {detailTask && (
        <TaskDetailDrawer
          task={detailTask}
          allTasks={tasks || []}
          onClose={() => setDetailTask(undefined)}
          onSaved={() => {
            setDetailTask(undefined);
            toast('Task updated');
            load();
          }}
          onDeleted={() => {
            setDetailTask(undefined);
            toast('Task deleted');
            load();
          }}
        />
      )}
    </>
  );
}
