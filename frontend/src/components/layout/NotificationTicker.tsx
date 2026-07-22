import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconAlertTriangle, IconAt, IconChevronLeft, IconChevronRight, IconX } from '@tabler/icons-react';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { DashboardTaskDrawer } from '../dashboard/DashboardTaskDrawer';
import type { AppNotification, Task } from '../../types';

interface TickerItem {
  id: string;
  kind: 'task' | 'mention';
  text: string;
  urgent: boolean;
  onClick: () => void;
}

const ROTATE_MS = 5000;
const DUE_SOON_DAYS = 2;

export function NotificationTicker() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  async function load() {
    const [t, n] = await Promise.all([
      api.get<Task[]>('/tasks').catch(() => []),
      api.get<AppNotification[]>('/notifications').catch(() => []),
    ]);
    setTasks(t);
    setNotifications(n);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items = useMemo<TickerItem[]>(() => {
    if (!user) return [];
    const today = new Date();
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() + DUE_SOON_DAYS);

    const myTasks = tasks.filter(
      (t) => t.status !== 'complete' && (t.assigned_to === user.name || t.assignees?.includes(user.name))
    );

    const taskItems: TickerItem[] = myTasks
      .filter((t) => t.overdue || (t.scheduled_end && new Date(t.scheduled_end) <= cutoff))
      .map((t) => ({
        id: `task-${t.id}`,
        kind: 'task',
        urgent: t.overdue,
        text: t.overdue ? `Overdue: "${t.title}"` : `Due soon: "${t.title}"`,
        onClick: () => setOpenTaskId(t.id),
      }));

    const mentionItems: TickerItem[] = notifications
      .filter((n) => !n.is_read)
      .map((n) => ({
        id: `note-${n.id}`,
        kind: 'mention',
        urgent: false,
        text: n.message,
        onClick: async () => {
          await api.post(`/notifications/${n.id}/read`).catch(() => {});
          setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
          if (n.project_id) navigate(`/projects/${n.project_id}`);
        },
      }));

    return [...taskItems, ...mentionItems];
  }, [tasks, notifications, user, navigate]);

  useEffect(() => {
    if (items.length < 2) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % items.length), ROTATE_MS);
    return () => clearInterval(timer);
  }, [items.length]);

  useEffect(() => {
    if (index >= items.length) setIndex(0);
  }, [items.length, index]);

  if (dismissed || items.length === 0) return null;

  const current = items[index % items.length];

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '6px 20px',
          background: current.urgent ? 'var(--rbg)' : 'var(--bbg)',
          borderBottom: '1px solid var(--border)',
          fontSize: 12.5,
        }}
      >
        {current.kind === 'task' ? (
          <IconAlertTriangle size={14} style={{ color: current.urgent ? 'var(--rtx)' : 'var(--btx)', flexShrink: 0 }} />
        ) : (
          <IconAt size={14} style={{ color: 'var(--btx)', flexShrink: 0 }} />
        )}
        <button
          type="button"
          className="btn-reset"
          style={{ flex: 1, textAlign: 'left', cursor: 'pointer', color: current.urgent ? 'var(--rtx)' : 'var(--btx)' }}
          onClick={current.onClick}
        >
          {current.text}
        </button>
        {items.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--t3)' }}>
            <button
              type="button"
              className="btn-reset"
              style={{ cursor: 'pointer', display: 'flex' }}
              onClick={() => setIndex((i) => (i - 1 + items.length) % items.length)}
            >
              <IconChevronLeft size={14} />
            </button>
            <span style={{ fontSize: 11 }}>
              {(index % items.length) + 1} / {items.length}
            </span>
            <button
              type="button"
              className="btn-reset"
              style={{ cursor: 'pointer', display: 'flex' }}
              onClick={() => setIndex((i) => (i + 1) % items.length)}
            >
              <IconChevronRight size={14} />
            </button>
          </div>
        )}
        <button type="button" className="btn-reset" style={{ cursor: 'pointer', display: 'flex', color: 'var(--t3)' }} onClick={() => setDismissed(true)}>
          <IconX size={14} />
        </button>
      </div>
      {openTaskId && <DashboardTaskDrawer taskId={openTaskId} onClose={() => setOpenTaskId(null)} />}
    </>
  );
}
