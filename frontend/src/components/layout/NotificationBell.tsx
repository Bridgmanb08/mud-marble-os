import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconBell, IconX } from '@tabler/icons-react';
import { fmtD } from '../../lib/format';
import { loadReminderHistory, removeReminderHistoryEntry, type ReminderHistoryEntry } from '../../lib/reminderHistory';
import { CATEGORY_META, type Category } from './TeamReminders';
import { useNotifications } from '../../notifications/useNotifications';
import { markNotificationRead, markAllNotificationsRead } from '../../notifications/notificationsStore';
import type { AppNotification } from '../../types';

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function NotificationBell() {
  // Reads off the shared notificationsStore (one poll loop for the whole
  // app) instead of fetching and polling independently -- see
  // notificationsStore.ts for why.
  const notifications = useNotifications();
  const [reminders, setReminders] = useState<ReminderHistoryEntry[]>([]);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  function clearReminder(key: string) {
    // Only removes it from this list -- doesn't touch the underlying task,
    // and doesn't re-enable the toast to fire again today (that's governed by
    // TeamReminders' own separate dedupe-key set).
    removeReminderHistoryEntry(key);
    setReminders((prev) => prev.filter((r) => r.key !== key));
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  async function handleOpen(n: AppNotification) {
    if (!n.is_read) {
      await markNotificationRead(n.id);
    }
    setOpen(false);
    if (n.type === 'unclaimed_media') navigate('/review');
    else if (n.type === 'job_import_conflict' && n.project_id) navigate(`/job-import/${n.project_id}`);
    else if (n.project_id) navigate(`/projects/${n.project_id}`);
  }

  async function markAllRead() {
    await markAllNotificationsRead();
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        className="btn btn-sm btn-ghost"
        style={{ position: 'relative' }}
        onClick={() => {
          setOpen((v) => !v);
          setReminders(loadReminderHistory());
        }}
      >
        <IconBell size={16} />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 2,
              right: 2,
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--red)',
            }}
          />
        )}
      </button>
      {open && (
        <div
          className="card"
          style={{ position: 'absolute', top: '110%', right: 0, width: 320, maxHeight: 400, overflowY: 'auto', zIndex: 30 }}
          onMouseLeave={() => setOpen(false)}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Notifications</span>
            {unreadCount > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={markAllRead}>
                Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <div style={{ padding: 16, fontSize: 12, color: 'var(--t2)' }}>No notifications yet.</div>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                className="btn-reset"
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderBottom: '1px solid var(--border)',
                  background: n.is_read ? undefined : 'var(--bbg)',
                  cursor: 'pointer',
                }}
                onClick={() => handleOpen(n)}
              >
                <div style={{ fontSize: 12.5, lineHeight: 1.4 }}>{n.message}</div>
                <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 3 }}>{fmtD(n.created_at)}</div>
              </button>
            ))
          )}

          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Today's reminders</span>
          </div>
          {reminders.length === 0 ? (
            <div style={{ padding: 16, fontSize: 12, color: 'var(--t2)' }}>No reminders shown yet today.</div>
          ) : (
            [...reminders].reverse().map((r) => {
              const meta = CATEGORY_META[r.category as Category];
              const Icon = meta?.Icon;
              return (
                <div
                  key={r.key}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--border)' }}
                >
                  {Icon && <Icon size={14} style={{ color: meta.color, flexShrink: 0, marginTop: 2 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, lineHeight: 1.4 }}>{r.message}</div>
                    <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 3 }}>{fmtTime(r.firedAt)}</div>
                  </div>
                  <button
                    type="button"
                    className="btn-reset"
                    title="Clear -- doesn't affect the task"
                    onClick={() => clearReminder(r.key)}
                    style={{ flexShrink: 0, color: 'var(--t3)', cursor: 'pointer' }}
                  >
                    <IconX size={13} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
