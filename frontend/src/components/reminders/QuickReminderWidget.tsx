import { useEffect, useState, type FormEvent } from 'react';
import { IconBellRinging, IconPlus, IconX } from '@tabler/icons-react';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import type { QuickReminder } from '../../types';

/**
 * Global, lightweight "quick reminder" checkboxes. Mounted once in AppLayout
 * (not per-page), so it persists across route changes. Non-blocking toast-
 * style stack in the lower-right corner; checking an item marks it done and
 * it disappears. Not tied to the real task/schedule_items model on purpose —
 * this is for fast nudges, not project tasks.
 */
export function QuickReminderWidget() {
  const { user } = useAuth();
  const [reminders, setReminders] = useState<QuickReminder[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [message, setMessage] = useState('');
  const [teamWide, setTeamWide] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    setReminders(await api.get<QuickReminder[]>('/quick-reminders').catch(() => []));
  }

  useEffect(() => {
    if (!user) return;
    load();
    const interval = setInterval(load, 45000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function complete(r: QuickReminder) {
    setReminders((prev) => prev.filter((x) => x.id !== r.id));
    try {
      await api.post(`/quick-reminders/${r.id}/done`);
    } catch {
      load();
    }
  }

  async function addReminder(e: FormEvent) {
    e.preventDefault();
    if (!message.trim() || saving || !user) return;
    setSaving(true);
    try {
      const created = await api.post<QuickReminder>('/quick-reminders', {
        message: message.trim(),
        assigned_to: teamWide ? null : user.id,
      });
      setReminders((prev) => [created, ...prev]);
      setMessage('');
      setShowAdd(false);
      setTeamWide(false);
    } catch {
      // Low-stakes widget — fail silently rather than throwing a toast on top of a toast.
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  return (
    <div className="qr-stack">
      {reminders.map((r) => (
        <label key={r.id} className="qr-item">
          <input type="checkbox" onChange={() => complete(r)} />
          <span>{r.message}</span>
        </label>
      ))}
      {showAdd ? (
        <form className="qr-add" onSubmit={addReminder}>
          <input
            className="fi"
            autoFocus
            placeholder="Quick reminder…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <label className="qr-add-teamwide">
            <input type="checkbox" checked={teamWide} onChange={(e) => setTeamWide(e.target.checked)} /> Whole team
          </label>
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
        <button type="button" className="qr-fab" onClick={() => setShowAdd(true)} title="Add a quick reminder">
          <IconBellRinging size={16} />
          <IconPlus size={11} className="qr-fab-plus" />
        </button>
      )}
    </div>
  );
}
