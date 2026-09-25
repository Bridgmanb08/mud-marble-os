import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import { useToast } from '../ui/Toast';
import { Modal } from '../ui/Modal';

interface Prefs {
  email_enabled: boolean;
  popup_enabled: boolean;
  morning_enabled: boolean;
  morning_time: string;
  wrapup_enabled: boolean;
  wrapup_time: string;
  timezone: string;
  email: string | null;
  email_configured: boolean;
}

type Kind = 'morning' | 'wrapup';

const ZONES = [
  ['America/Indianapolis', 'Eastern (Indiana)'],
  ['America/New_York', 'Eastern'],
  ['America/Chicago', 'Central'],
  ['America/Denver', 'Mountain'],
  ['America/Phoenix', 'Arizona'],
  ['America/Los_Angeles', 'Pacific'],
];

export function EmailDigestSettings() {
  const toast = useToast();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [preview, setPreview] = useState<{ subject: string | null; html: string | null } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<Prefs>('/notification-prefs/me')
      .then(setPrefs)
      .catch(() => toast('Failed to load your email summary settings', true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(patch: Partial<Prefs>) {
    if (!prefs) return;
    setPrefs({ ...prefs, ...patch });
    try {
      setPrefs(await api.patch<Prefs>('/notification-prefs/me', patch));
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to save', true);
      api.get<Prefs>('/notification-prefs/me').then(setPrefs).catch(() => {});
    }
  }

  async function showPreview(kind: Kind) {
    setBusy(true);
    try {
      const r = await api.post<{ empty: boolean; subject: string | null; html: string | null }>('/notification-prefs/me/preview', { kind });
      if (r.empty) toast('Nothing is due for you right now, so you would not get this email.');
      else setPreview({ subject: r.subject, html: r.html });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to build the preview', true);
    } finally {
      setBusy(false);
    }
  }

  async function sendTest(kind: Kind) {
    setBusy(true);
    try {
      const r = await api.post<{ to: string }>('/notification-prefs/me/send-test', { kind });
      toast(`Sent to ${r.to}`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to send', true);
    } finally {
      setBusy(false);
    }
  }

  if (!prefs) {
    return (
      <div className="empty">
        <div className="empty-t">Loading…</div>
      </div>
    );
  }

  const off = !prefs.email_enabled;

  return (
    <>
      <div className="sh">
        <div className="st">Email summaries</div>
      </div>
      <p style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 14 }}>
        A morning brief of what is due and overdue, and an end-of-day wrap-up of what is still open, sent on weekdays to{' '}
        {prefs.email || 'your account email'}. Nothing is sent when there is nothing to say. These are your own settings and do not
        affect anyone else.
      </p>
      {!prefs.email_configured && (
        <p style={{ fontSize: 12, color: 'var(--amber)', marginBottom: 14 }}>
          Email sending is not switched on yet. You can still preview exactly what your summaries would say.
        </p>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 14 }}>
        <input type="checkbox" checked={prefs.email_enabled} onChange={() => save({ email_enabled: !prefs.email_enabled })} />
        Send me email summaries
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 14 }}>
        <input type="checkbox" checked={prefs.popup_enabled} onChange={() => save({ popup_enabled: !prefs.popup_enabled })} />
        Also show my morning brief in the app, about a minute after I start working (you can snooze it)
      </label>

      {(['morning', 'wrapup'] as Kind[]).map((kind) => {
        const enabledKey = `${kind}_enabled` as const;
        const timeKey = `${kind}_time` as const;
        return (
          <div key={kind} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10, opacity: off ? 0.5 : 1 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', minWidth: 190 }}>
              <input type="checkbox" checked={prefs[enabledKey]} disabled={off} onChange={() => save({ [enabledKey]: !prefs[enabledKey] })} />
              {kind === 'morning' ? 'Morning brief' : 'End-of-day wrap-up'}
            </label>
            <input
              className="fi"
              type="time"
              style={{ width: 130 }}
              value={prefs[timeKey]}
              disabled={off || !prefs[enabledKey]}
              onChange={(e) => e.target.value && save({ [timeKey]: e.target.value })}
            />
            <button className="btn btn-sm" disabled={busy} onClick={() => showPreview(kind)}>
              Preview
            </button>
            <button className="btn btn-sm" disabled={busy || !prefs.email_configured} onClick={() => sendTest(kind)}>
              Email me a test
            </button>
          </div>
        );
      })}

      <div className="fg" style={{ maxWidth: 260, marginTop: 14 }}>
        <label className="fl">Time zone</label>
        <select className="fi" value={prefs.timezone} onChange={(e) => save({ timezone: e.target.value })}>
          {ZONES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {preview && (
        <Modal title={preview.subject || 'Preview'} onClose={() => setPreview(null)} wide>
          <iframe
            title="Email preview"
            sandbox=""
            srcDoc={preview.html || ''}
            style={{ width: '100%', height: 460, border: '1px solid var(--border)', borderRadius: 8, background: '#fff' }}
          />
        </Modal>
      )}
    </>
  );
}
