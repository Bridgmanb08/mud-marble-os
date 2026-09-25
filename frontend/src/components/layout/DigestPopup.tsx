import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import { useToast } from '../ui/Toast';
import { Modal } from '../ui/Modal';

interface PopupItem {
  task_id: string;
  title: string;
  project: string;
  meta: string;
}
interface PopupSection {
  heading: string;
  tone: 'bad' | 'warn' | 'info';
  actions: boolean;
  items: PopupItem[];
}
interface PopupData {
  title: string;
  sections: PopupSection[];
}
type PopupResponse =
  | ({ show: true } & PopupData)
  | { show: false; reason: 'disabled' | 'before_time' | 'dismissed' | 'snoozed' | 'empty'; snoozed_until?: string };

const START_DELAY_MS = 60_000;
const TONE_COLOR = { bad: 'var(--red)', warn: 'var(--amber)', info: 'var(--blue)' };
const localDay = () => new Date().toLocaleDateString('en-CA');

// The morning brief, shown in the app itself. It appears 60 seconds after
// the person starts interacting (a click, key press, tap or scroll) -- not
// after login -- so it works the same whether they just signed in or have
// been signed in for days, and a tab left open overnight shows it the next
// morning. The server decides whether it is time (after their morning time),
// whether it was already dismissed or snoozed today, and whether there is
// anything to show at all.
export function DigestPopup() {
  const toast = useToast();
  const [data, setData] = useState<PopupData | null>(null);
  const [busyTask, setBusyTask] = useState<string | null>(null);
  const startTimer = useRef<number | null>(null);
  const snoozeTimer = useRef<number | null>(null);
  const settledDay = useRef<string | null>(null);
  const snoozedUntil = useRef(0);
  const openRef = useRef(false);
  openRef.current = data !== null;

  async function check() {
    startTimer.current = null;
    if (openRef.current) return;
    try {
      const r = await api.get<PopupResponse>('/notification-prefs/me/popup');
      if (r.show) {
        settledDay.current = localDay();
        setData({ title: r.title, sections: r.sections });
      } else if (r.reason === 'snoozed' && r.snoozed_until) {
        scheduleRecheck(new Date(r.snoozed_until).getTime());
      } else if (r.reason !== 'before_time') {
        // dismissed, disabled or nothing due: nothing more to ask today.
        settledDay.current = localDay();
      }
    } catch {
      // A failed check is not worth interrupting anyone; the next interaction tries again.
    }
  }

  function scheduleRecheck(atMs: number) {
    snoozedUntil.current = atMs;
    if (snoozeTimer.current) window.clearTimeout(snoozeTimer.current);
    snoozeTimer.current = window.setTimeout(check, Math.max(atMs - Date.now(), 0) + 500);
  }

  useEffect(() => {
    function onInteraction() {
      if (startTimer.current || openRef.current) return;
      if (settledDay.current === localDay() || Date.now() < snoozedUntil.current) return;
      startTimer.current = window.setTimeout(check, START_DELAY_MS);
    }
    const events = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const;
    events.forEach((e) => window.addEventListener(e, onInteraction, { capture: true, passive: true }));
    return () => {
      events.forEach((e) => window.removeEventListener(e, onInteraction, { capture: true }));
      if (startTimer.current) window.clearTimeout(startTimer.current);
      if (snoozeTimer.current) window.clearTimeout(snoozeTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function dismiss() {
    setData(null);
    settledDay.current = localDay();
    try {
      await api.post('/notification-prefs/me/popup/dismiss');
    } catch {
      // Already closed on screen; worst case it shows once more on another device.
    }
  }

  async function snooze(minutes: 60 | 180) {
    setData(null);
    try {
      const r = await api.post<{ snoozed_until: string }>('/notification-prefs/me/popup/snooze', { minutes });
      scheduleRecheck(new Date(r.snoozed_until).getTime());
      toast(`Snoozed for ${minutes === 60 ? 'an hour' : '3 hours'}`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to snooze', true);
    }
  }

  async function act(taskId: string, action: 'complete' | 'snooze') {
    setBusyTask(taskId);
    try {
      const r = await api.post<{ message: string }>('/notification-prefs/me/task-action', { task_id: taskId, action });
      toast(r.message);
      const sections = (data?.sections ?? [])
        .map((s) => ({ ...s, items: s.items.filter((i) => i.task_id !== taskId) }))
        .filter((s) => s.items.length > 0);
      if (sections.length === 0) dismiss();
      else setData((d) => (d ? { ...d, sections } : d));
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to update the task', true);
    } finally {
      setBusyTask(null);
    }
  }

  if (!data) return null;

  return (
    <Modal title={data.title} onClose={dismiss}>
      <p style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 14 }}>Here is where things stand for today.</p>
      {data.sections.map((s) => (
        <div key={s.heading} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: TONE_COLOR[s.tone], marginBottom: 6 }}>
            {s.heading} ({s.items.length})
          </div>
          {s.items.map((i) => (
            <div key={i.task_id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', marginBottom: 6 }}>
              <div style={{ fontWeight: 600 }}>{i.title}</div>
              <div style={{ fontSize: 12, color: 'var(--t2)' }}>
                {i.meta}
                {i.project ? ` · ${i.project}` : ''}
              </div>
              {s.actions && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="btn btn-p btn-sm" disabled={busyTask === i.task_id} onClick={() => act(i.task_id, 'complete')}>
                    Mark complete
                  </button>
                  <button className="btn btn-sm" disabled={busyTask === i.task_id} onClick={() => act(i.task_id, 'snooze')}>
                    Move to tomorrow
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
      <div className="ma" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Link to="/tasks" className="btn btn-sm" onClick={dismiss}>
          Open task board
        </Link>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-sm" onClick={() => snooze(60)}>
            Snooze 1 hour
          </button>
          <button className="btn btn-sm" onClick={() => snooze(180)}>
            Snooze 3 hours
          </button>
          <button className="btn btn-p btn-sm" onClick={dismiss}>
            Got it
          </button>
        </div>
      </div>
    </Modal>
  );
}
