import { useEffect, useMemo, useState } from 'react';
import { IconPlus, IconLayoutKanban, IconTable, IconBookmark, IconTrash } from '@tabler/icons-react';
import { api } from '../api/client';
import { useToast } from '../components/ui/Toast';
import { Modal } from '../components/ui/Modal';
import type { BoardView, Task } from '../types';
import { KanbanBoard } from '../components/tasks/KanbanBoard';
import { TableView, type TaskGroupBy } from '../components/tasks/TableView';
import { NewTaskModal } from '../components/tasks/NewTaskModal';
import { TaskDetailDrawer } from '../components/tasks/TaskDetailDrawer';

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const [groupBy, setGroupBy] = useState<TaskGroupBy>('none');
  const [projectFilter, setProjectFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [defaultStatus, setDefaultStatus] = useState('upcoming');
  const [detailTask, setDetailTask] = useState<Task | undefined>(undefined);

  const [views, setViews] = useState<BoardView[]>([]);
  const [activeViewId, setActiveViewId] = useState('');
  const [showSaveViewModal, setShowSaveViewModal] = useState(false);
  const [newViewName, setNewViewName] = useState('');

  const toast = useToast();

  async function load() {
    try {
      const data = await api.get<Task[]>('/tasks');
      setTasks(data);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load tasks', true);
      setTasks([]);
    }
  }

  async function loadViews() {
    setViews(await api.get<BoardView[]>('/tasks/views').catch(() => []));
  }

  useEffect(() => {
    load();
    loadViews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openNew(status: string) {
    setDefaultStatus(status);
    setShowModal(true);
  }

  function openEdit(id: string) {
    const t = tasks?.find((t) => t.id === id);
    if (t) setDetailTask(t);
  }

  function applyView(v: BoardView) {
    setActiveViewId(v.id);
    setView(v.view_type === 'table' ? 'table' : 'kanban');
    setGroupBy((v.group_by as TaskGroupBy) || 'none');
    const f = v.filters || {};
    setProjectFilter((f.project_id as string) || '');
    setAssigneeFilter((f.assigned_to as string) || '');
    setStatusFilter((f.status as string) || '');
  }

  async function saveCurrentView() {
    if (!newViewName.trim()) return;
    const created = await api.post<BoardView>('/tasks/views', {
      name: newViewName.trim(),
      view_type: view,
      group_by: groupBy,
      filters: { project_id: projectFilter, assigned_to: assigneeFilter, status: statusFilter },
    });
    setViews((prev) => [...prev, created]);
    setActiveViewId(created.id);
    setShowSaveViewModal(false);
    setNewViewName('');
    toast('View saved');
  }

  async function deleteActiveView() {
    if (!activeViewId) return;
    await api.delete(`/tasks/views/${activeViewId}`);
    setViews((prev) => prev.filter((v) => v.id !== activeViewId));
    setActiveViewId('');
    toast('View deleted');
  }

  const projectOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const t of tasks || []) {
      if (t.project_id && t.projects?.name) seen.set(t.project_id, t.projects.name.replace(/\|.*/, '').trim());
    }
    return Array.from(seen.entries());
  }, [tasks]);

  const assigneeOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const t of tasks || []) if (t.assigned_to) seen.add(t.assigned_to);
    return Array.from(seen);
  }, [tasks]);

  const filtered = useMemo(() => {
    return (tasks || []).filter(
      (t) =>
        (!projectFilter || t.project_id === projectFilter) &&
        (!assigneeFilter || t.assigned_to === assigneeFilter) &&
        (!statusFilter || t.status === statusFilter)
    );
  }, [tasks, projectFilter, assigneeFilter, statusFilter]);

  const total = filtered.length;
  const inProgress = filtered.filter((t) => t.status === 'in_progress').length;
  const delayed = filtered.filter((t) => ['delayed', 'blocked'].includes(t.status)).length;
  const done = filtered.filter((t) => t.status === 'complete').length;

  return (
    <>
      <div className="ph">
        <div>
          <h1>Task Board</h1>
          <p>Shared task management across all active projects</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ display: 'flex', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 3, gap: 2 }}>
            <button
              className="btn btn-sm btn-ghost"
              style={{ background: view === 'kanban' ? 'var(--surface)' : undefined, boxShadow: view === 'kanban' ? '0 1px 3px rgba(0,0,0,.08)' : undefined }}
              onClick={() => setView('kanban')}
            >
              <IconLayoutKanban size={14} /> Board
            </button>
            <button
              className="btn btn-sm btn-ghost"
              style={{ background: view === 'table' ? 'var(--surface)' : undefined, boxShadow: view === 'table' ? '0 1px 3px rgba(0,0,0,.08)' : undefined }}
              onClick={() => setView('table')}
            >
              <IconTable size={14} /> Table
            </button>
          </div>
          <button className="btn btn-p btn-sm" onClick={() => openNew('upcoming')}>
            <IconPlus size={14} /> New task
          </button>
        </div>
      </div>

      <div className="filters" style={{ marginBottom: 14, alignItems: 'center' }}>
        <select
          className="fi"
          style={{ width: 'auto' }}
          value={activeViewId}
          onChange={(e) => {
            const v = views.find((v) => v.id === e.target.value);
            if (v) applyView(v);
            else setActiveViewId('');
          }}
        >
          <option value="">Saved views…</option>
          {views.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <button className="btn btn-sm btn-ghost" onClick={() => setShowSaveViewModal(true)}>
          <IconBookmark size={13} /> Save view
        </button>
        {activeViewId && (
          <button className="btn btn-sm btn-ghost" onClick={deleteActiveView}>
            <IconTrash size={13} /> Delete view
          </button>
        )}
        <select className="fi" style={{ width: 'auto', marginLeft: 'auto' }} value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
          <option value="">All projects</option>
          {projectOptions.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <select className="fi" style={{ width: 'auto' }} value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
          <option value="">All assignees</option>
          {assigneeOptions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select className="fi" style={{ width: 'auto' }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="upcoming">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="delayed">Delayed / Blocked</option>
          <option value="complete">Done</option>
        </select>
      </div>

      <div className="metrics">
        <div className="metric">
          <div className="m-label">Total tasks</div>
          <div className="m-val">{total}</div>
        </div>
        <div className="metric">
          <div className="m-label">In progress</div>
          <div className="m-val" style={{ color: 'var(--amber)' }}>
            {inProgress}
          </div>
        </div>
        <div className="metric">
          <div className="m-label">Delayed / blocked</div>
          <div className="m-val" style={{ color: delayed ? 'var(--red)' : undefined }}>
            {delayed}
          </div>
        </div>
        <div className="metric">
          <div className="m-label">Completed</div>
          <div className="m-val" style={{ color: 'var(--green)' }}>
            {done}/{total}
          </div>
          <div className="m-sub">{total > 0 ? Math.round((done / total) * 100) : 0}% done</div>
        </div>
      </div>

      {tasks === null ? (
        <div className="empty">
          <div className="empty-t">Loading…</div>
        </div>
      ) : view === 'kanban' ? (
        <KanbanBoard tasks={filtered} onTaskClick={openEdit} onAddTask={openNew} onChanged={load} />
      ) : (
        <TableView tasks={filtered} onTaskClick={openEdit} groupBy={groupBy} onGroupByChange={setGroupBy} />
      )}

      {showModal && (
        <NewTaskModal
          defaultStatus={defaultStatus}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            toast('Task created');
            load();
          }}
        />
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

      {showSaveViewModal && (
        <Modal title="Save view" onClose={() => setShowSaveViewModal(false)}>
          <div className="fg">
            <label className="fl">Name</label>
            <input
              className="fi"
              autoFocus
              value={newViewName}
              onChange={(e) => setNewViewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  saveCurrentView();
                }
              }}
              placeholder="Shannon's board"
            />
          </div>
          <div className="ma">
            <button type="button" className="btn" onClick={() => setShowSaveViewModal(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-p" onClick={saveCurrentView} disabled={!newViewName.trim()}>
              Save view
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
