import { useEffect, useState, type FormEvent } from 'react';
import { IconBellRinging, IconPlus, IconX } from '@tabler/icons-react';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../ui/Toast';

/**
 * Floating quick-capture button, mounted once in AppLayout (not per-page) so
 * it persists across route changes. Off by default -- each person turns it
 * on for themselves in Settings > Notification settings if they want it.
 *
 * Formerly a standalone ad hoc reminder checklist; repurposed into a fast
 * task-capture shortcut. Submitting posts straight to /tasks (status
 * "upcoming"), which server-side already sorts new tasks to the top of
 * their column -- so a quick note typed here shows up first on the Task
 * Board's To Do list, not buried at the bottom.
 */
export function QuickTaskWidget() {
  const { user } = useAuth();
  const toast = useToast();
  const [enabled, setEnabled] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    api
      .get<{ quick_task_widget_enabled: boolean }>('/users/me/preferences')
      .then((p) => setEnabled(p.quick_task_widget_enabled))
      .catch(() => setEnabled(false));
  }, [user]);

  useEffect(() => {
    // Settings > Notification settings toggles this same preference, but
    // this widget is mounted once in AppLayout and only reads it on mount --
    // without this listener, flipping the toggle wouldn't take effect here
    // until a full page reload.
    function handleToggle(e: Event) {
      setEnabled((e as CustomEvent<{ enabled: boolean }>).detail.enabled);
    }
    window.addEventListener('quick-task-widget-toggled', handleToggle);
    return () => window.removeEventListener('quick-task-widget-toggled', handleToggle);
  }, []);

  async function addTask(e: FormEvent) {
    e.preventDefault();
    if (!message.trim() || saving || !user) return;
    setSaving(true);
    try {
      await api.post('/tasks', {
        title: message.trim(),
        status: 'upcoming',
        assigned_to: user.name,
        assignees: [user.name],
      });
      toast('Task added to the top of the list');
      setMessage('');
      setShowAdd(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to add task', true);
    } finally {
      setSaving(false);
    }
  }

  if (!user || !enabled) return null;

  return (
    <div className="qr-stack">
      {showAdd ? (
        <form className="qr-add" onSubmit={addTask}>
          <input
            className="fi"
            autoFocus
            placeholder="Quick task…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <div className="qr-add-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAdd(false)}>
              <IconX size={13} />
            </button>
            <button type="submit" className="btn btn-p btn-sm" disabled={!message.trim() || saving}>
              Add
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="qr-fab" onClick={() => setShowAdd(true)} title="Quick-add a task">
          <IconBellRinging size={16} />
          <IconPlus size={11} className="qr-fab-plus" />
        </button>
      )}
    </div>
  );
}
