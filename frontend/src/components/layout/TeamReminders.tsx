import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IconFlame,
  IconTarget,
  IconRocket,
  IconX,
  IconHeartHandshake,
  IconAlertTriangle,
  IconSunrise,
  IconBriefcase,
  IconClockHour3,
  IconSparkles,
  IconHome2,
  IconUserPlus,
} from '@tabler/icons-react';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { DashboardTaskDrawer } from '../dashboard/DashboardTaskDrawer';
import { PulseCheckinModal } from '../dashboard/PulseCheckinModal';
import { RYAN_HOLIDAY_QUOTES } from '../../data/ryanHolidayQuotes';
import { addReminderHistoryEntry } from '../../lib/reminderHistory';
import type { Task, PulseCheckinOut, DashboardSummary, RentalProperty, AppNotification } from '../../types';

/**
 * Proactive, personality-driven reminders for the current user's own tasks
 * and schedule -- distinct from the passive NotificationBell (mentions) and
 * the manual QuickReminderWidget (ad hoc checklist). Polls /tasks, figures
 * out what's overdue/due today/starting today, and slides a toast in from
 * the bottom right that fades away on its own. Each task+category only ever
 * fires once per day (tracked in localStorage) so it nudges without nagging.
 */

export type Category =
  | 'overdue'
  | 'due_today'
  | 'starting_today'
  | 'pulse_nudge'
  | 'risk_nudge'
  | 'morning_briefing'
  | 'job_context'
  | 'closeout_briefing'
  | 'greeting'
  | 'visit_overdue'
  | 'task_assigned';

interface ReminderToast {
  id: string;
  key: string;
  category: Category;
  message: string;
  taskId?: string;
  projectId?: string;
  propertyId?: string;
  phase: 'enter' | 'shown' | 'leave';
}

const STORAGE_KEY = 'mm_team_reminders_shown_v1';
const POLL_MS = 5 * 60 * 1000;
const AUTO_DISMISS_MS = 9000;
const LEAVE_MS = 350;
const STAGGER_MS = 450;

// The greeting/quote toast used to be gated on a once-per-calendar-day key,
// which in practice meant "once at first load" since everyone stays logged in
// and rarely reloads -- most people just never saw it. It now recurs on a
// rolling elapsed-time window instead, gated separately on the tab actually
// being visible and someone having interacted with the page recently, so it
// never fires into an empty room just because a background tab sat open
// overnight.
const GREETING_INTERVAL_MS = 4 * 60 * 60 * 1000;
const GREETING_ACTIVITY_WINDOW_MS = 5 * 60 * 1000;
const GREETING_STORAGE_KEY = 'mm_greeting_last_shown_v1';

function loadGreetingLastShown(): number {
  try {
    return Number(localStorage.getItem(GREETING_STORAGE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveGreetingLastShown(ts: number) {
  try {
    localStorage.setItem(GREETING_STORAGE_KEY, String(ts));
  } catch {
    // localStorage unavailable (private mode etc.) -- greeting just re-fires more often, not worth failing over
  }
}

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

export const CATEGORY_META: Record<Category, { Icon: typeof IconFlame; color: string }> = {
  overdue: { Icon: IconFlame, color: 'var(--red)' },
  due_today: { Icon: IconTarget, color: 'var(--amber)' },
  starting_today: { Icon: IconRocket, color: 'var(--blue)' },
  pulse_nudge: { Icon: IconHeartHandshake, color: 'var(--accent)' },
  risk_nudge: { Icon: IconAlertTriangle, color: 'var(--red)' },
  morning_briefing: { Icon: IconSunrise, color: 'var(--amber)' },
  job_context: { Icon: IconBriefcase, color: 'var(--blue)' },
  closeout_briefing: { Icon: IconClockHour3, color: 'var(--accent)' },
  greeting: { Icon: IconSparkles, color: 'var(--accent)' },
  visit_overdue: { Icon: IconHome2, color: 'var(--amber)' },
  task_assigned: { Icon: IconUserPlus, color: 'var(--blue)' },
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

// Turns the dashboard's already-computed risk signals (sub compliance, CO SOP
// breaches, seriously-overdue AR) into one plain-English sentence -- these are
// otherwise only visible if an admin happens to open the Dashboard/Sub
// Intelligence page. Returns null when nothing is worth flagging.
function buildRiskMessage(summary: DashboardSummary): string | null {
  const parts: string[] = [];
  const risk = summary.subcontractor_risk;
  if (risk.insurance_expired > 0) {
    parts.push(`${risk.insurance_expired} sub${risk.insurance_expired > 1 ? 's have' : ' has'} expired insurance`);
  }
  if (risk.insurance_expiring_soon > 0) {
    parts.push(`${risk.insurance_expiring_soon} expiring soon`);
  }
  const breaches = summary.change_orders_action.filter((c) => c.sop_breach);
  if (breaches.length > 0) {
    parts.push(`${breaches.length} change order${breaches.length > 1 ? 's are' : ' is'} past SOP without a response`);
  }
  const seriouslyOverdue = summary.ar_aging_detail.filter((a) => a.days_overdue >= 90);
  if (seriouslyOverdue.length > 0) {
    const total = seriouslyOverdue.reduce((s, a) => s + a.amount_outstanding, 0);
    parts.push(
      `$${Math.round(total).toLocaleString()} is 90+ days overdue across ${seriouslyOverdue.length} invoice${seriouslyOverdue.length > 1 ? 's' : ''}`
    );
  }
  if (!parts.length) return null;
  return `Weekly risk check: ${parts.join('; ')}.`;
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

// Trimmed + case-insensitive so a stray space or casing difference between
// how a name was typed on a task (manual entry, an older import) and the
// account's own name doesn't silently zero out every reminder for that
// person -- exact-match was the original implementation and is the more
// likely culprit if reminders never fire at all for someone.
function sameName(a: string | null | undefined, b: string): boolean {
  return !!a && a.trim().toLowerCase() === b.trim().toLowerCase();
}

function findCandidates(tasks: Task[], userName: string, shown: Set<string>): Candidate[] {
  const today = todayStr();
  const mine = tasks.filter(
    (t) =>
      t.status !== 'complete' &&
      (sameName(t.assigned_to, userName) || t.assignees?.some((a) => sameName(a, userName)))
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
  const navigate = useNavigate();
  const [toasts, setToasts] = useState<ReminderToast[]>([]);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [showPulseCheckin, setShowPulseCheckin] = useState(false);
  const shownRef = useRef<Set<string>>(loadShown());
  // In-flight guard for the AI-backed polls (pollRisks/pollMorningBriefing/
  // pollJobContext/pollCloseoutBriefing) -- these used to mark a key as
  // "shown" in shownRef *before* their network call resolved, then silently
  // swallow a failed fetch. That permanently and invisibly lost that day's
  // (or week's) nudge on a single transient network blip, since shownRef is
  // what gets persisted to localStorage. Now those four only add to
  // shownRef on a *successful* response; this ref exists purely to block a
  // second near-simultaneous call (StrictMode's double-effect-invoke, or a
  // fast reconnect) from racing the first one while it's still in flight --
  // never persisted, cleared on failure so the next 5-minute poll retries.
  const pendingRef = useRef<Set<string>>(new Set());
  const nextIdRef = useRef(1);
  const smartLearningEnabledRef = useRef(false);
  const visitReminderDaysRef = useRef(30);
  const lastActivityRef = useRef<number>(Date.now());

  function queueToast(
    category: Category,
    message: string,
    key: string,
    taskId?: string,
    projectId?: string,
    propertyId?: string
  ) {
    const id = `tr-${nextIdRef.current++}`;
    const toast: ReminderToast = { id, key, category, message, taskId, projectId, propertyId, phase: 'enter' };
    setToasts((prev) => [...prev, toast]);
    // Recorded separately from the shownRef dedupe-key set so the bell can show
    // "what fired today" -- clearing an entry there never affects this toast's
    // own once-per-day dedupe, and never touches the underlying task.
    addReminderHistoryEntry({ key, category, message, taskId, projectId });

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
    pollGreeting();
    await pollPulse();
    await pollRisks();
    await pollMorningBriefing();
    await pollJobContext(tasks);
    await pollCloseoutBriefing();
    await pollVisitOverdue();
    await pollTaskAssigned();
  }

  // Surfaces the notifications.task_assigned rows tasks.py now creates the
  // moment someone is newly added to a task's assignees -- same data the
  // NotificationBell already lists, this just also pops it as an on-screen
  // toast so an assignment feels like it actually just happened instead of
  // sitting quietly until someone thinks to check the bell.
  async function pollTaskAssigned() {
    if (!user) return;
    const today = todayStr();
    const notifs = await api.get<AppNotification[]>('/notifications').catch(() => []);
    const assigned = notifs.filter((n) => n.type === 'task_assigned');
    for (const n of assigned) {
      const key = `${today}:task_assigned:${n.id}`;
      if (shownRef.current.has(key)) continue;
      // Marked synchronously up front for the same StrictMode-double-invoke
      // reason as every other poll function in this file -- see pollPulse
      // below.
      shownRef.current.add(key);
      saveShown(shownRef.current);
      queueToast('task_assigned', n.message, key, n.source_id || undefined, n.project_id || undefined);
    }
  }

  async function pollPulse() {
    if (!user) return;
    const week = isoWeekStr();
    const key = `wk:${week}:pulse_nudge`;
    if (shownRef.current.has(key)) return;
    // Marked synchronously, before the async fetch below -- otherwise two
    // near-simultaneous polls (React StrictMode double-invokes effects in
    // dev, but a fast reconnect could do the same in prod) both see the key
    // as unset and both queue a toast. See the identical fix's reasoning on
    // the task-reminder dedupe path above.
    shownRef.current.add(key);
    saveShown(shownRef.current);
    const recent = await api.get<PulseCheckinOut[]>('/pulse/checkins/me?limit=1').catch(() => []);
    if (recent.length && isoWeekStr(new Date(recent[0].created_at)) === week) return;
    queueToast('pulse_nudge', messageFor('pulse_nudge', ''), key);
  }

  async function pollRisks() {
    if (!user?.is_admin) return;
    const week = isoWeekStr();
    const key = `wk:${week}:risk_nudge`;
    if (shownRef.current.has(key) || pendingRef.current.has(key)) return;
    // Marked pending synchronously up front -- same StrictMode-double-invoke
    // reason as every other poll function in this file -- but NOT persisted
    // to shownRef yet: a fetch failure must be retried on the next poll, not
    // silently and permanently lose this week's nudge. Only a quiet week
    // (fetch succeeded, nothing to flag) gets the permanent "don't ask again
    // this week" treatment, via the explicit shownRef.add below.
    pendingRef.current.add(key);
    const summary = await api.get<DashboardSummary>('/dashboard').catch(() => null);
    if (!summary) {
      pendingRef.current.delete(key);
      return;
    }
    shownRef.current.add(key);
    saveShown(shownRef.current);
    pendingRef.current.delete(key);
    const message = buildRiskMessage(summary);
    if (!message) return;
    queueToast('risk_nudge', message, key);
  }

  function pollGreeting() {
    if (!user) return;
    // Only pop into a tab someone's actually looking at right now -- a
    // background tab or an idle machine shouldn't burn the interval just
    // because it happened to be open when the timer ticked.
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - lastActivityRef.current > GREETING_ACTIVITY_WINDOW_MS) return;
    if (Date.now() - loadGreetingLastShown() < GREETING_INTERVAL_MS) return;
    // Marked synchronously (before anything else) for the same StrictMode-
    // double-invoke reason as every other poll function in this file -- see
    // pollPulse above.
    saveGreetingLastShown(Date.now());
    const firstName = user.name.split(' ')[0] || user.name;
    const quote = pick(RYAN_HOLIDAY_QUOTES);
    queueToast('greeting', `Hi ${firstName}! "${quote.text}" — Ryan Holiday, ${quote.source}`, `greeting:${Date.now()}`);
  }

  async function pollVisitOverdue() {
    if (!user) return;
    const today = todayStr();
    const properties = await api.get<RentalProperty[]>('/rental-properties').catch(() => []);
    const threshold = visitReminderDaysRef.current;
    for (const p of properties) {
      const isStale = p.days_since_visit === null || p.days_since_visit >= threshold;
      if (!isStale) continue;
      const key = `${today}:visit:${p.id}`;
      if (shownRef.current.has(key)) continue;
      // Marked synchronously up front for the same StrictMode-double-invoke
      // reason as every other poll function in this file -- see pollPulse
      // above. Once-per-day (not the greeting's 4-hour recurrence) since
      // this is informational staleness, not something that needs repeat
      // visibility the same day it first fires.
      shownRef.current.add(key);
      saveShown(shownRef.current);
      const message =
        p.days_since_visit === null
          ? `"${p.address}" has no recorded visits yet.`
          : `"${p.address}" hasn't had a visit in ${p.days_since_visit} days -- might be time to swing by.`;
      queueToast('visit_overdue', message, key, undefined, undefined, p.id);
    }
  }

  async function pollMorningBriefing() {
    if (!user || !smartLearningEnabledRef.current) return;
    const key = `${todayStr()}:morning_briefing`;
    if (shownRef.current.has(key) || pendingRef.current.has(key)) return;
    // Pending-guard, not an immediate shownRef write -- see pollRisks above
    // for why: a transient network failure here must not permanently lose
    // the day's morning briefing with no retry.
    pendingRef.current.add(key);
    const res = await api
      .post<{ message: string | null }>('/smart-nudges/generate', { kind: 'morning_briefing' })
      .catch(() => null);
    if (res === null) {
      pendingRef.current.delete(key);
      return;
    }
    shownRef.current.add(key);
    saveShown(shownRef.current);
    pendingRef.current.delete(key);
    if (!res.message) return;
    queueToast('morning_briefing', res.message, key);
  }

  async function pollJobContext(tasks: Task[]) {
    if (!user || !smartLearningEnabledRef.current) return;
    const today = todayStr();
    const mine = tasks.filter(
      (t) =>
        t.status !== 'complete' &&
        (sameName(t.assigned_to, user.name) || t.assignees?.some((a) => sameName(a, user.name)))
    );
    const projectIds = new Set(
      mine
        .filter((t) => {
          const start = (t.scheduled_start || t.scheduled_end || '').slice(0, 10);
          const end = (t.scheduled_end || t.scheduled_start || '').slice(0, 10);
          return start && end && start <= today && today <= end && t.project_id;
        })
        .map((t) => t.project_id!)
    );
    for (const projectId of projectIds) {
      const key = `${today}:job_context:${projectId}`;
      if (shownRef.current.has(key) || pendingRef.current.has(key)) continue;
      // Pending-guard, not an immediate shownRef write -- see pollRisks
      // above for why: a transient network failure here must not
      // permanently lose that job's nudge for the day with no retry.
      pendingRef.current.add(key);
      const res = await api
        .post<{ message: string | null }>('/smart-nudges/generate', { kind: 'job_context', project_id: projectId })
        .catch(() => null);
      if (res === null) {
        pendingRef.current.delete(key);
        continue;
      }
      shownRef.current.add(key);
      saveShown(shownRef.current);
      pendingRef.current.delete(key);
      if (res.message) queueToast('job_context', res.message, key, undefined, projectId);
    }
  }

  async function pollCloseoutBriefing() {
    if (!user || !smartLearningEnabledRef.current) return;
    if (new Date().getHours() < 15) return; // client-side wall-clock gate -- see Phase 13 design notes
    const key = `${todayStr()}:closeout_briefing`;
    if (shownRef.current.has(key) || pendingRef.current.has(key)) return;
    // Pending-guard, not an immediate shownRef write -- see pollRisks above
    // for why: a transient network failure here must not permanently lose
    // the day's closeout briefing with no retry.
    pendingRef.current.add(key);
    const res = await api
      .post<{ message: string | null }>('/smart-nudges/generate', { kind: 'closeout_briefing' })
      .catch(() => null);
    if (res === null) {
      pendingRef.current.delete(key);
      return;
    }
    shownRef.current.add(key);
    saveShown(shownRef.current);
    pendingRef.current.delete(key);
    if (!res.message) return;
    queueToast('closeout_briefing', res.message, key);
  }

  // Tracks real page activity (mouse/keyboard/scroll/touch) so pollGreeting
  // can tell "tab open in the background all day" apart from "someone's
  // actually here right now" -- independent of auth state, mounted once.
  useEffect(() => {
    const markActive = () => {
      lastActivityRef.current = Date.now();
    };
    const events: Array<keyof WindowEventMap> = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, markActive, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, markActive));
  }, []);

  useEffect(() => {
    if (!user) return;
    // Fetched once per mount (not every 5-minute poll cycle) -- these are
    // rarely-changed, admin-controlled company-wide settings, so a full page
    // reload picking up a flip is an acceptable trade-off for not adding an
    // extra request to every poll tick.
    api
      .get<{ smart_learning_enabled: boolean; visit_reminder_days: number }>('/notification-settings')
      .then((s) => {
        smartLearningEnabledRef.current = s.smart_learning_enabled;
        visitReminderDaysRef.current = s.visit_reminder_days;
      })
      .catch(() => {
        smartLearningEnabledRef.current = false;
      });
    poll();
    const interval = setInterval(poll, POLL_MS);
    // Returning to a background tab counts as "interacting" and re-checks
    // right away instead of waiting up to 5 minutes for the next tick --
    // this is the common case for the greeting (tab was open, unattended,
    // for hours; someone just tabbed back in).
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        lastActivityRef.current = Date.now();
        poll();
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
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
              onClick={() => {
                if (t.category === 'pulse_nudge') setShowPulseCheckin(true);
                else if (t.category === 'risk_nudge') navigate('/');
                else if (t.category === 'morning_briefing' || t.category === 'closeout_briefing') navigate('/tasks');
                else if (t.category === 'job_context') navigate(`/projects/${t.projectId}`);
                else if (t.category === 'visit_overdue') navigate(`/rentals/${t.propertyId}`);
                else if (t.category === 'greeting') dismiss(t.id);
                else setOpenTaskId(t.taskId!);
              }}
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
