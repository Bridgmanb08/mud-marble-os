import { api } from '../api/client';
import type { AppNotification } from '../types';

// Shared client-side store for GET /notifications. NotificationBell (its
// own 60s setInterval) and TeamReminders' pollTaskAssigned (as part of its
// own separate 5-minute poll cycle) used to each independently fetch this
// same endpoint -- both are always mounted together in AppLayout on every
// page, so that was two redundant polling loops hitting identical data.
// One shared store: one interval (started while at least one subscriber --
// today, always NotificationBell -- is mounted), one in-flight-deduped
// fetch, one notifications array both components read from.
let notifications: AppNotification[] = [];
const subscribers = new Set<() => void>();
let intervalId: ReturnType<typeof setInterval> | null = null;
let inFlight: Promise<void> | null = null;
const POLL_MS = 60000; // matches NotificationBell's original (shorter, more responsive) cadence

function notify() {
  subscribers.forEach((cb) => cb());
}

function refresh(): Promise<void> {
  // In-flight dedup, same pattern as useRentRoll -- if TeamReminders' 5-
  // minute pollTaskAssigned happens to fire while NotificationBell's own
  // 60s tick is already mid-request, both callers share the one real fetch
  // instead of issuing two.
  if (!inFlight) {
    inFlight = api
      .get<AppNotification[]>('/notifications')
      .then((rows) => {
        notifications = rows;
      })
      .catch(() => {
        // Leave the existing list in place on a transient failure -- same
        // silent-degrade convention as every other ambient poll in this app.
      })
      .finally(() => {
        inFlight = null;
        notify();
      });
  }
  return inFlight;
}

function ensurePolling() {
  if (intervalId) return;
  refresh();
  intervalId = setInterval(refresh, POLL_MS);
}

function stopPolling() {
  if (subscribers.size > 0) return;
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

export function subscribe(callback: () => void): () => void {
  subscribers.add(callback);
  ensurePolling();
  return () => {
    subscribers.delete(callback);
    stopPolling();
  };
}

export function getSnapshot(): AppNotification[] {
  return notifications;
}

// Callable directly (not through the React hook) by non-component code like
// TeamReminders' pollTaskAssigned, so it doesn't depend on some other
// component happening to be mounted to keep the shared list fresh --
// dedupes against a concurrent NotificationBell-triggered refresh via the
// same in-flight promise above.
export function refreshNotifications(): Promise<void> {
  return refresh();
}

export async function markNotificationRead(id: string): Promise<void> {
  await api.post(`/notifications/${id}/read`).catch(() => {});
  notifications = notifications.map((n) => (n.id === id ? { ...n, is_read: true } : n));
  notify();
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.post('/notifications/mark-all-read').catch(() => {});
  notifications = notifications.map((n) => ({ ...n, is_read: true }));
  notify();
}
