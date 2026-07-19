import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import type { Project } from '../../types';

interface NewTaskModalProps {
  onClose: () => void;
  onSaved: () => void;
  defaultStatus?: string;
  defaultProjectId?: string;
}

export function NewTaskModal({ onClose, onSaved, defaultStatus, defaultProjectId }: NewTaskModalProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState(defaultProjectId || '');
  const [title, setTitle] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [phase, setPhase] = useState('');
  const [status, setStatus] = useState(defaultStatus || 'upcoming');
  const [priority, setPriority] = useState('normal');
  const [scheduledStart, setScheduledStart] = useState('');
  const [scheduledEnd, setScheduledEnd] = useState('');
  const [notes, setNotes] = useState('');
  const [isMilestone, setIsMilestone] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<Project[]>('/projects').then(setProjects).catch(() => {});
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    setSaving(true);
    setError('');
    const payload = {
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
    };
    try {
      await api.post('/tasks', payload);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save task');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New task" onClose={onClose} wide>
      <form onSubmit={handleSubmit}>
        {error && <div className="merr">{error}</div>}
        <div className="fg">
          <label className="fl">Title</label>
          <input className="fi" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Schedule framing inspection" />
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
            <input className="fi" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} placeholder="Shannon" />
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
            <input className="fi" value={phase} onChange={(e) => setPhase(e.target.value)} placeholder="Framing" />
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
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', marginBottom: 14 }}>
          <input type="checkbox" checked={isMilestone} onChange={(e) => setIsMilestone(e.target.checked)} /> Milestone
        </label>
        <div className="ma">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-p" disabled={saving}>
            {saving ? 'Saving…' : 'Create task'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
