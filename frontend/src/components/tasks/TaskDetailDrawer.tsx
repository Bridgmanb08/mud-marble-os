import { useEffect, useState, type FormEvent } from 'react';
import { IconTrash, IconLock } from '@tabler/icons-react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import type { Project, Task, TaskComment, TaskDependency, TaskSubtask } from '../../types';

interface TaskDetailDrawerProps {
  task: Task;
  allTasks: Task[];
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

export function TaskDetailDrawer({ task, allTasks, onClose, onSaved, onDeleted }: TaskDetailDrawerProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [title, setTitle] = useState(task.title);
  const [projectId, setProjectId] = useState(task.project_id || '');
  const [assignedTo, setAssignedTo] = useState(task.assigned_to || '');
  const [phase, setPhase] = useState(task.phase || '');
  const [status, setStatus] = useState(task.status);
  const [priority, setPriority] = useState(task.priority);
  const [scheduledStart, setScheduledStart] = useState(task.scheduled_start?.slice(0, 10) || '');
  const [scheduledEnd, setScheduledEnd] = useState(task.scheduled_end?.slice(0, 10) || '');
  const [notes, setNotes] = useState(task.notes || '');
  const [isMilestone, setIsMilestone] = useState(task.is_milestone);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [subtasks, setSubtasks] = useState<TaskSubtask[]>([]);
  const [newSubtask, setNewSubtask] = useState('');
  const [dependencies, setDependencies] = useState<TaskDependency[]>([]);
  const [newDependencyId, setNewDependencyId] = useState('');
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [newComment, setNewComment] = useState('');

  const tasksById = new Map(allTasks.map((t) => [t.id, t]));

  useEffect(() => {
    api.get<Project[]>('/projects').then(setProjects).catch(() => {});
    loadSubtasks();
    loadDependencies();
    loadComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  async function loadSubtasks() {
    setSubtasks(await api.get<TaskSubtask[]>(`/tasks/${task.id}/subtasks`).catch(() => []));
  }
  async function loadDependencies() {
    setDependencies(await api.get<TaskDependency[]>(`/tasks/${task.id}/dependencies`).catch(() => []));
  }
  async function loadComments() {
    setComments(await api.get<TaskComment[]>(`/tasks/${task.id}/comments`).catch(() => []));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.patch(`/tasks/${task.id}`, {
        project_id: projectId || null,
        title: title.trim(),
        assigned_to: assignedTo || null,
        phase: phase.trim() || null,
        status,
        priority,
        scheduled_start: scheduledStart || null,
        scheduled_end: scheduledEnd || null,
        notes: notes.trim() || null,
        is_milestone: isMilestone,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save task');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this task? This cannot be undone.')) return;
    await api.delete(`/tasks/${task.id}`);
    onDeleted();
  }

  async function addSubtask() {
    if (!newSubtask.trim()) return;
    await api.post(`/tasks/${task.id}/subtasks`, { title: newSubtask.trim() });
    setNewSubtask('');
    loadSubtasks();
  }

  async function toggleSubtask(s: TaskSubtask) {
    await api.patch(`/tasks/${task.id}/subtasks/${s.id}`, { is_complete: !s.is_complete });
    loadSubtasks();
  }

  async function deleteSubtask(s: TaskSubtask) {
    await api.delete(`/tasks/${task.id}/subtasks/${s.id}`);
    loadSubtasks();
  }

  async function addDependency() {
    if (!newDependencyId) return;
    await api.post(`/tasks/${task.id}/dependencies`, { depends_on_id: newDependencyId });
    setNewDependencyId('');
    loadDependencies();
  }

  async function removeDependency(d: TaskDependency) {
    await api.delete(`/tasks/${task.id}/dependencies/${d.id}`);
    loadDependencies();
  }

  async function postComment() {
    if (!newComment.trim()) return;
    await api.post(`/tasks/${task.id}/comments`, { content: newComment.trim() });
    setNewComment('');
    loadComments();
  }

  const dependencyOptions = allTasks.filter(
    (t) => t.id !== task.id && !dependencies.some((d) => d.depends_on_id === t.id)
  );
  const blockedByIncomplete = dependencies.some((d) => tasksById.get(d.depends_on_id)?.status !== 'complete');

  return (
    <Modal title="Task detail" onClose={onClose} xl>
      <form onSubmit={handleSubmit}>
        {error && <div className="merr">{error}</div>}
        <div className="fg">
          <label className="fl">Title</label>
          <input className="fi" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="fr">
          <div className="fg">
            <label className="fl">Project</label>
            <select className="fi" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">— No project —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name.replace(/\|.*/, '').trim()}
                </option>
              ))}
            </select>
          </div>
          <div className="fg">
            <label className="fl">Assigned to</label>
            <input className="fi" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} />
          </div>
        </div>
        <div className="fr3">
          <div className="fg">
            <label className="fl">Status</label>
            <select className="fi" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="upcoming">To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="delayed">Delayed / Blocked</option>
              <option value="complete">Done</option>
            </select>
          </div>
          <div className="fg">
            <label className="fl">Priority</label>
            <select className="fi" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div className="fg">
            <label className="fl">Phase</label>
            <input className="fi" value={phase} onChange={(e) => setPhase(e.target.value)} />
          </div>
        </div>
        <div className="fr">
          <div className="fg">
            <label className="fl">Start</label>
            <input className="fi" type="date" value={scheduledStart} onChange={(e) => setScheduledStart(e.target.value)} />
          </div>
          <div className="fg">
            <label className="fl">Due</label>
            <input className="fi" type="date" value={scheduledEnd} onChange={(e) => setScheduledEnd(e.target.value)} />
          </div>
        </div>
        <div className="fg">
          <label className="fl">Notes</label>
          <textarea className="fi" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', marginBottom: 6 }}>
          <input type="checkbox" checked={isMilestone} onChange={(e) => setIsMilestone(e.target.checked)} /> Milestone
        </label>

        <div className="fg" style={{ marginTop: 18 }}>
          <label className="fl">Subtasks {subtasks.length > 0 && `(${subtasks.filter((s) => s.is_complete).length}/${subtasks.length})`}</label>
          {subtasks.map((s) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
              <input type="checkbox" checked={s.is_complete} onChange={() => toggleSubtask(s)} />
              <span style={{ flex: 1, fontSize: 13, textDecoration: s.is_complete ? 'line-through' : undefined, color: s.is_complete ? 'var(--t2)' : undefined }}>
                {s.title}
              </span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => deleteSubtask(s)}>
                <IconTrash size={13} />
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <input
              className="fi"
              placeholder="Add a subtask…"
              value={newSubtask}
              onChange={(e) => setNewSubtask(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addSubtask();
                }
              }}
            />
            <button type="button" className="btn btn-sm" onClick={addSubtask}>
              Add
            </button>
          </div>
        </div>

        <div className="fg" style={{ marginTop: 18 }}>
          <label className="fl">
            Dependencies {blockedByIncomplete && (
              <span style={{ color: 'var(--red)', fontWeight: 500 }}>
                <IconLock size={12} style={{ verticalAlign: -2 }} /> Blocked
              </span>
            )}
          </label>
          {dependencies.map((d) => {
            const blocker = tasksById.get(d.depends_on_id);
            const done = blocker?.status === 'complete';
            return (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <span style={{ flex: 1, fontSize: 13, color: done ? 'var(--t2)' : undefined }}>
                  {done ? '✓ ' : '⏳ '}
                  {blocker?.title || 'Unknown task'}
                </span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeDependency(d)}>
                  <IconTrash size={13} />
                </button>
              </div>
            );
          })}
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <select className="fi" value={newDependencyId} onChange={(e) => setNewDependencyId(e.target.value)}>
              <option value="">Depends on…</option>
              {dependencyOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-sm" onClick={addDependency}>
              Add
            </button>
          </div>
        </div>

        <div className="fg" style={{ marginTop: 18 }}>
          <label className="fl">Comments</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input
              className="fi"
              placeholder="Add a comment…"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  postComment();
                }
              }}
            />
            <button type="button" className="btn btn-sm" onClick={postComment}>
              Post
            </button>
          </div>
          {comments.map((c) => (
            <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 500 }}>{c.author}</div>
              <div style={{ fontSize: 13, marginTop: 2 }}>{c.content}</div>
              <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 2 }}>{new Date(c.created_at).toLocaleString()}</div>
            </div>
          ))}
          {comments.length === 0 && <div style={{ fontSize: 12, color: 'var(--t2)' }}>No comments yet.</div>}
        </div>

        <div className="ma">
          <button type="button" className="btn" style={{ color: 'var(--red)' }} onClick={handleDelete}>
            <IconTrash size={14} /> Delete task
          </button>
          <div style={{ flex: 1 }} />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-p" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
