import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { api, ApiError } from '../../api/client';
import { fmtD } from '../../lib/format';

interface QuickViewTask {
  id: string;
  title: string;
  project_name: string | null;
  assigned_to: string | null;
  scheduled_end: string | null;
  days_until_due: number | null;
  overdue: boolean;
}

interface TaskQuickViewModalProps {
  task: QuickViewTask;
  onClose: () => void;
  onChanged: () => void;
}

export function TaskQuickViewModal({ task, onClose, onChanged }: TaskQuickViewModalProps) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  async function markComplete() {
    setSaving(true);
    try {
      await api.patch(`/tasks/${task.id}`, { status: 'complete' });
      toast('Task marked complete');
      onChanged();
      onClose();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to update task', true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={task.title} onClose={onClose}>
      <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 4 }}>{task.project_name || 'No project'}</div>
      {task.assigned_to && <div style={{ fontSize: 13, marginBottom: 4 }}>Assigned to {task.assigned_to}</div>}
      <div style={{ fontSize: 13, marginBottom: 16 }}>
        {task.overdue ? (
          <span style={{ color: 'var(--red)', fontWeight: 500 }}>
            {Math.abs(task.days_until_due ?? 0)}d overdue
          </span>
        ) : task.days_until_due !== null ? (
          `${task.days_until_due}d left`
        ) : task.scheduled_end ? (
          `Due ${fmtD(task.scheduled_end)}`
        ) : (
          'No due date'
        )}
      </div>
      <div className="ma">
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
        <button type="button" className="btn btn-p" onClick={markComplete} disabled={saving}>
          {saving ? 'Saving…' : 'Mark complete'}
        </button>
      </div>
    </Modal>
  );
}
