import { useEffect, useRef, useState } from 'react';
import { IconFlame, IconTarget, IconRocket, IconX, IconHeartHandshake } from '@tabler/icons-react';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { DashboardTaskDrawer } from '../dashboard/DashboardTaskDrawer';
import { PulseCheckinModal } from '../dashboard/PulseCheckinModal';
import type { Task, PulseCheckinOut } from '../../types';

/**
 * Proactive, personality-driven reminders for the current user's own tasks
 * and schedule -- distinct from the passive NotificationBell (mentions) and
 * the manual QuickReminderWidget (ad hoc checklist). Polls /tasks, figures
 * out what's overdue/due today/starting today, and slides a toast in from
 * the bottom right that fades away on its own. Each task+category only ever
 * fires once per day (tracked in localStorage) so it nudges without nagging.
 */

type Category = 'overdue' | 'due_today' | 'starting_today' | 'pulse_nudge';

interface ReminderToast {
  id: string;
  key: string;
  category: Category;
  message: string;
  taskId?: string;
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
const PULSE_NUDGE_MESSAGES = [
  () => `Got a sec? Share a quick pulse check-in -- how's the week treating you?`,
  () => `Weekly gut-check: workload, wins, and anything you're stuck on. 30 seconds, tops.`,
  () => `How's the week going? Drop a quick pulse check-in when you get a moment.`,
  () => `A quick pulse check-in helps leadership have your back. Got a beat?`,
];

const CATEGORY_META: Record<Category, { Icon: typeof IconFlame; color: string }> = {
  overdue: { Icon: IconFlame, color: 'var(--red)' },
  due_today: { Icon: IconTarget, color: 'var(--amber)' },
  starting_today: { Icon: IconRocket, color: 'var(--blue)' },
  pulse_nudge: { Icon: IconHeartHandshake, color: 'var(--accent)' },
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function messageFor(category: Category, title: string): string {
  if (category === 'overdue') return pick(OVERDUE_MESSAGES)(title);
  if (category === 'due_today') return pick(DUE_TODAY_MESSAGES)(title);
  if (category === 'pulse_nudge') return pick(PULSE_NUDGE_MESSAGES)();
  return pick(STARTING_TODAY_MESSAGES)(title);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ISO 8601 week identifier (e.g. "2026-W31"), used as the pulse nudge's dedupe
// scope since check-ins are weekly, not daily like the task reminders above.
function isoWeekStr(date: Date = new Date()): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNo = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function loadShown(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: string[] = JSON.parse(raw);
    const today = todayStr();
    const week = isoWeekStr();
    return new Set(parsed.filter((k) => k.startsWith(today) || k.startsWith(`wk:${week}`)));
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
  const [showPulseCheckin, setShowPulseCheckin] = useState(false);
  const shownRef = useRef<Set<string>>(loadShown());
  const nextIdRef = useRef(1);

  function queueToast(category: Category, message: string, key: string, taskId?: string) {
    const id = `tr-${nextIdRef.current++}`;
    const toast: ReminderToast = { id, key, category, message, taskId, phase: 'enter' };
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
    if (candidates.length) {
      // Mark as shown immediately (synchronously), not inside the staggered
      // callback below -- React StrictMode (and any other near-simultaneous
      // poll) double-invokes effects in dev, and if the dedupe write were
      // deferred, a second poll() could run findCandidates() before the first
      // one's setTimeout had fired, seeing the same "new" candidates twice.
      candidates.forEach((c) => shownRef.current.add(c.key));
      saveShown(shownRef.current);
      candidates.forEach((c, i) =>
        setTimeout(() => queueToast(c.category, messageFor(c.category, c.task.title), c.key, c.task.id), i * STAGGER_MS)
      );
    }
    await pollPulse();
  }

  async function pollPulse() {
    if (!user) return;
    const week = isoWeekStr();
    const key = `wk:${week}:pulse_nudge`;
    if (shownRef.current.has(key)) return;
    const recent = await api.get<PulseCheckinOut[]>('/pulse/checkins/me?limit=1').catch(() => []);
    if (recent.length && isoWeekStr(new Date(recent[0].created_at)) === week) return;
    shownRef.current.add(key);
    saveShown(shownRef.current);
    queueToast('pulse_nudge', messageFor('pulse_nudge', ''), key);
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
              onClick={() => (t.category === 'pulse_nudge' ? setShowPulseCheckin(true) : setOpenTaskId(t.taskId!))}
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
      {showPulseCheckin && <PulseCheckinModal onClose={() => setShowPulseCheckin(false)} />}
    </>
  );
}
