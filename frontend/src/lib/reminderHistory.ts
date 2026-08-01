// Shared localStorage-backed record of today's slide-in reminder toasts
// (TeamReminders.tsx), so the notification bell (NotificationBell.tsx) can show
// a "what fired today" list independent of TeamReminders' own dedupe-key set --
// clearing an entry here only hides it from this list; it never re-enables a
// toast to fire again today (that's governed separately by
// mm_team_reminders_shown_v1) and never touches the underlying task.

export interface ReminderHistoryEntry {
  key: string;
  category: string;
  message: string;
  taskId?: string;
  projectId?: string;
  firedAt: string;
}

const STORAGE_KEY = 'mm_reminder_history_v1';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function loadReminderHistory(): ReminderHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: ReminderHistoryEntry[] = JSON.parse(raw);
    const today = todayStr();
    // Self-prunes anything from a prior day, same convention as
    // TeamReminders.tsx's own loadShown().
    return parsed.filter((e) => e.firedAt.slice(0, 10) === today);
  } catch {
    return [];
  }
}

function save(entries: ReminderHistoryEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // localStorage unavailable (private mode etc.) -- history just won't persist, not worth failing over
  }
}

export function addReminderHistoryEntry(entry: Omit<ReminderHistoryEntry, 'firedAt'>) {
  const entries = loadReminderHistory();
  entries.push({ ...entry, firedAt: new Date().toISOString() });
  save(entries);
}

export function removeReminderHistoryEntry(key: string) {
  save(loadReminderHistory().filter((e) => e.key !== key));
}
