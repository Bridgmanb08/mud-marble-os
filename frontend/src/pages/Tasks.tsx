import { useEffect, useState } from 'react';
import { IconPlus, IconLayoutKanban, IconTable } from '@tabler/icons-react';
import { api } from '../api/client';
import { useToast } from '../components/ui/Toast';
import type { Task } from '../types';
import { KanbanBoard } from '../components/tasks/KanbanBoard';
import { TableView } from '../components/tasks/TableView';
import { NewTaskModal } from '../components/tasks/NewTaskModal';

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const [showModal, setShowModal] = useState(false);
  const [defaultStatus, setDefaultStatus] = useState('upcoming');
  const [editingTask, setEditingTask] = useState<Task | undefined>(undefined);
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

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openNew(status: string) {
    setEditingTask(undefined);
    setDefaultStatus(status);
    setShowModal(true);
  }

  function openEdit(id: string) {
    const t = tasks?.find((t) => t.id === id);
    if (t) {
      setEditingTask(t);
      setShowModal(true);
    }
  }

  const total = tasks?.length ?? 0;
  const inProgress = tasks?.filter((t) => t.status === 'in_progress').length ?? 0;
  const delayed = tasks?.filter((t) => ['delayed', 'blocked'].includes(t.status)).length ?? 0;
  const done = tasks?.filter((t) => t.status === 'complete').length ?? 0;

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
        <KanbanBoard tasks={tasks} onTaskClick={openEdit} onAddTask={openNew} onChanged={load} />
      ) : (
        <TableView tasks={tasks} onTaskClick={openEdit} />
      )}

      {showModal && (
        <NewTaskModal
          task={editingTask}
          defaultStatus={defaultStatus}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            toast(editingTask ? 'Task updated' : 'Task created');
            load();
          }}
        />
      )}
    </>
  );
}
