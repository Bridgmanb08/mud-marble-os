import { useEffect, useMemo, useState } from 'react';
import { IconCalendar, IconList, IconUsersGroup } from '@tabler/icons-react';
import { api } from '../api/client';
import { useToast } from '../components/ui/Toast';
import { fmtD } from '../lib/format';
import { colorForProject } from '../lib/jobColors';
import type { Project, Subcontractor, Task } from '../types';
import { TaskDetailDrawer } from '../components/tasks/TaskDetailDrawer';
import { SubcontractorScheduleGrid } from '../components/schedule/SubcontractorScheduleGrid';
import { WeekScrollCalendar } from '../components/schedule/WeekScrollCalendar';
import { MasterJobFilter } from '../components/schedule/MasterJobFilter';

export default function Schedule() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string> | null>(null);
  const [subFilter, setSubFilter] = useState('');
  const [view, setView] = useState<'calendar' | 'list' | 'subs'>('calendar');
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
    api
      .get<Project[]>('/projects')
      .then((rows) => {
        setProjects(rows);
        setSelectedProjectIds((prev) => prev ?? new Set(rows.map((p) => p.id)));
      })
      .catch(() => {});
    api.get<Subcontractor[]>('/subcontractors').then(setSubcontractors).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // New jobs (created after the page loaded) default to visible rather than
  // silently hidden by a filter set that predates them.
  useEffect(() => {
    setSelectedProjectIds((prev) => {
      if (!prev) return prev;
      const missing = projects.filter((p) => !prev.has(p.id));
      if (missing.length === 0) return prev;
      const next = new Set(prev);
      for (const p of missing) next.add(p.id);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

  function handleProjectColorChanged(projectId: string, color: string) {
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, color } : p)));
  }

  const filteredTasks = useMemo(() => {
    if (!tasks) return [];
    return tasks.filter((t) => {
      // Tasks with no project aren't tied to any job, so the job filter doesn't apply to them.
      if (selectedProjectIds && t.project_id && !selectedProjectIds.has(t.project_id)) return false;
      if (subFilter && t.subcontractor_id !== subFilter) return false;
      return true;
    });
  }, [tasks, selectedProjectIds, subFilter]);

  const datedSorted = useMemo(() => {
    return filteredTasks
      .filter((t) => t.scheduled_end || t.scheduled_start)
      .sort((a, b) => new Date(a.scheduled_end || a.scheduled_start!).getTime() - new Date(b.scheduled_end || b.scheduled_start!).getTime());
  }, [filteredTasks]);

  function openTask(id: string) {
    const t = tasks?.find((t) => t.id === id);
    if (t) setDetailTask(t);
  }

  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  return (
    <>
      <div className="ph">
        <div>
          <h1>Master Schedule</h1>
          <p>Task and milestone calendar across every active job</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <select className="fi" style={{ width: 'auto' }} value={subFilter} onChange={(e) => setSubFilter(e.target.value)}>
            <option value="">All subcontractors</option>
            {subcontractors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.company_name}
                {s.trade ? ` (${s.trade})` : ''}
              </option>
            ))}
          </select>
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
            <button
              className="btn btn-sm btn-ghost"
              style={{ background: view === 'subs' ? 'var(--surface)' : undefined, boxShadow: view === 'subs' ? '0 1px 3px rgba(0,0,0,.08)' : undefined }}
              onClick={() => setView('subs')}
            >
              <IconUsersGroup size={14} /> Subcontractors
            </button>
          </div>
        </div>
      </div>

      <div className="tasks-layout">
        <MasterJobFilter
          projects={projects}
          selected={selectedProjectIds || new Set()}
          onChange={setSelectedProjectIds}
          onProjectColorChanged={handleProjectColorChanged}
        />

        <div className="tasks-main">
          {tasks === null ? (
            <div className="empty">
              <div className="empty-t">Loading…</div>
            </div>
          ) : view === 'calendar' ? (
            <WeekScrollCalendar
              tasks={filteredTasks}
              projects={projects}
              colorForTask={(t) => colorForProject(t.project_id ? projectsById.get(t.project_id) : undefined)}
              onOpenTask={openTask}
              onChanged={load}
            />
          ) : view === 'list' ? (
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
                      <tr key={t.id} onClick={() => openTask(t.id)} style={{ cursor: 'pointer' }}>
                        <td>{fmtD(t.scheduled_end || t.scheduled_start)}</td>
                        <td style={{ fontWeight: 500 }}>{t.title}</td>
                        <td style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: colorForProject(t.project_id ? projectsById.get(t.project_id) : undefined),
                              flexShrink: 0,
                            }}
                          />
                          {t.projects?.name?.replace(/\|.*/, '').trim() || '—'}
                        </td>
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
          ) : (
            <SubcontractorScheduleGrid tasks={filteredTasks} onOpenTask={openTask} />
          )}
        </div>
      </div>

      {detailTask && (
        <TaskDetailDrawer
          task={detailTask}
          allTasks={tasks || []}
          onClose={() => setDetailTask(undefined)}
          onChanged={load}
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
