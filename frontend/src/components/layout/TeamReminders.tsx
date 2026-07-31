import { useEffect, useRef, useState } from 'react';
import { IconFlame, IconTarget, IconRocket, IconX } from '@tabler/icons-react';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { DashboardTaskDrawer } from '../dashboard/DashboardTaskDrawer';
import type { Task } from '../../types';

/**
 * Proactive, personality-driven reminders for the current user's own tasks
 * and schedule -- distinct from the passive NotificationBell (mentions) and
 * the manual QuickReminderWidget (ad hoc checklist). Polls /tasks, figures
 * out what's overdue/due today/starting today, and slides a toast in from
 * the bottom right that fades away on its own. Each task+category only ever
 * fires once per day (tracked in localStorage) so it nudges without nagging.
 */

type Category = 'overdue' | 'due_today' | 'starting_today';

interface ReminderToast {
  id: string;
  key: string;
  category: Category;
  message: string;
  taskId: string;
  phase: 'enter' | 'shown' | 'leave';
}

const STORAGE_KEY = 'mm_team_reminders_shown_v1';
const POLL_MS = 5 * 60 * 1000;
const AUTO_DISMISS_MS = 9000;
const LEAVE_MS = 350;
const STAGGER_MS = 450;

const OVERDUE_MESSAGES = [
  (t: string) => `"${t}" snuck past its deadline. Let's go rescue it!`,
  (t: string) => `"${t}" is overdue -- no drama, just knock it out.`,
  (t: string) => `Psst -- "${t}" has been waiting on you. Show it some love!`,
  (t: string) => `"${t}" wants attention. You know what to do.`,
];
const DUE_TODAY_MESSAGES = [
  (t: string) => `"${t}" is due today. You've totally got this.`,
  (t: string) => `Reminder: "${t}" wraps up today -- let's close it out!`,
  (t: string) => `Today's the day for "${t}". Go be a legend.`,
  (t: string) => `"${t}" is on the docket for today. Let's make it happen.`,
];
const STARTING_TODAY_MESSAGES = [
  (t: string) => `"${t}" kicks off today -- let's make it count.`,
  (t: string) => `Heads up: "${t}" is on the schedule for today.`,
  (t: string) => `Today's the day "${t}" gets going. Places, everyone!`,
];

const CATEGORY_META: Record<Category, { Icon: typeof IconFlame; color: string }> = {
  overdue: { Icon: IconFlame, color: 'var(--red)' },
  due_today: { Icon: IconTarget, color: 'var(--amber)' },
  starting_today: { Icon: IconRocket, color: 'var(--blue)' },
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function messageFor(category: Category, title: string): string {
  if (category === 'overdue') return pick(OVERDUE_MESSAGES)(title);
  if (category === 'due_today') return pick(DUE_TODAY_MESSAGES)(title);
  return pick(STARTING_TODAY_MESSAGES)(title);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadShown(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: string[] = JSON.parse(raw);
    return new Set(parsed.filter((k) => k.startsWith(todayStr())));
  } catch {
    return new Set();
  }
}

function saveShown(set: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // localStorage unavailable (private mode etc.) -- reminders just repeat on reload, not worth failing over
  }
}

interface Candidate {
  key: string;
  category: Category;
  task: Task;
}

function findCandidates(tasks: Task[], userName: string, shown: Set<string>): Candidate[] {
  const today = todayStr();
  const mine = tasks.filter(
    (t) => t.status !== 'complete' && (t.assigned_to === userName || t.assignees?.includes(userName))
  );

  const out: Candidate[] = [];
  for (const t of mine) {
    let category: Category | null = null;
    if (t.overdue) {
      category = 'overdue';
    } else if (t.scheduled_start && t.scheduled_start.slice(0, 10) === today) {
      category = 'starting_today';
    } else if (t.scheduled_end && t.scheduled_end.slice(0, 10) === today) {
      category = 'due_today';
    }
    if (!category) continue;
    const key = `${today}:${t.id}:${category}`;
    if (shown.has(key)) continue;
    out.push({ key, category, task: t });
  }
  return out;
}

export function TeamReminders() {
  const { user } = useAuth();
  const [toasts, setToasts] = useState<ReminderToast[]>([]);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const shownRef = useRef<Set<string>>(loadShown());
  const nextIdRef = useRef(1);

  function queueToast(candidate: Candidate) {
    const id = `tr-${nextIdRef.current++}`;
    const toast: ReminderToast = {
      id,
      key: candidate.key,
      category: candidate.category,
      message: messageFor(candidate.category, candidate.task.title),
      taskId: candidate.task.id,
      phase: 'enter',
    };
    setToasts((prev) => [...prev, toast]);

    // Flip to 'shown' on the next frame so the enter transition actually animates
    // instead of the toast just appearing already in its resting position.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setToasts((prev) => prev.map((x) => (x.id === id ? { ...x, phase: 'shown' } : x)));
      });
    });

    setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
  }

  function dismiss(id: string) {
    setToasts((prev) => prev.map((x) => (x.id === id ? { ...x, phase: 'leave' } : x)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, LEAVE_MS);
  }

  async function poll() {
    if (!user) return;
    const tasks = await api.get<Task[]>('/tasks').catch(() => []);
    const candidates = findCandidates(tasks, user.name, shownRef.current);
    if (!candidates.length) return;
    // Mark as shown immediately (synchronously), not inside the staggered
    // callback below -- React StrictMode (and any other near-simultaneous
    // poll) double-invokes effects in dev, and if the dedupe write were
    // deferred, a second poll() could run findCandidates() before the first
    // one's setTimeout had fired, seeing the same "new" candidates twice.
    candidates.forEach((c) => shownRef.current.add(c.key));
    saveShown(shownRef.current);
    candidates.forEach((c, i) => setTimeout(() => queueToast(c), i * STAGGER_MS));
  }

  useEffect(() => {
    if (!user) return;
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!user) return null;

  return (
    <>
      <div className="tr-stack">
        {toasts.map((t) => {
          const { Icon, color } = CATEGORY_META[t.category];
          return (
            <div
              key={t.id}
              className={`tr-toast tr-${t.phase}`}
              onClick={() => setOpenTaskId(t.taskId)}
            >
              <Icon size={16} style={{ color, flexShrink: 0, marginTop: 1 }} />
              <span style={{ flex: 1 }}>{t.message}</span>
              <button
                type="button"
                className="btn-reset tr-toast-close"
                onClick={(e) => {
                  e.stopPropagation();
                  dismiss(t.id);
                }}
              >
                <IconX size={13} />
              </button>
            </div>
          );
        })}
      </div>
      {openTaskId && <DashboardTaskDrawer taskId={openTaskId} onClose={() => setOpenTaskId(null)} />}
    </>
  );
}
