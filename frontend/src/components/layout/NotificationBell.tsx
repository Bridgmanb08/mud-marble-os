import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconBell } from '@tabler/icons-react';
import { api } from '../../api/client';
import { fmtD } from '../../lib/format';
import type { AppNotification } from '../../types';

export function NotificationBell() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  async function load() {
    setNotifications(await api.get<AppNotification[]>('/notifications').catch(() => []));
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  async function handleOpen(n: AppNotification) {
    if (!n.is_read) {
      await api.post(`/notifications/${n.id}/read`).catch(() => {});
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
    }
    setOpen(false);
    if (n.type === 'unclaimed_media') navigate('/review');
    else if (n.project_id) navigate(`/projects/${n.project_id}`);
  }

  async function markAllRead() {
    await api.post('/notifications/mark-all-read').catch(() => {});
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  return (
    <div style={{ position: 'relative' }}>
      <button className="btn btn-sm btn-ghost" style={{ position: 'relative' }} onClick={() => setOpen((v) => !v)}>
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
        </div>
      )}
    </div>
  );
}
