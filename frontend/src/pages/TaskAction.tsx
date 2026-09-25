import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';

interface Info {
  action: 'complete' | 'snooze';
  title: string;
  project: string | null;
  already_complete: boolean;
}

// The landing page for the "Mark complete" / "Move to tomorrow" buttons in
// digest emails. Public on purpose (the signed token in the link is the
// credential) and it only changes anything when the person presses the
// button -- opening the link, or a mail scanner following it, does nothing.
export default function TaskAction() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<Info>(`/notifications/task-action-info?token=${encodeURIComponent(token)}`)
      .then(setInfo)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'This link could not be opened.'));
  }, [token]);

  async function confirm() {
    setBusy(true);
    try {
      const r = await api.post<{ message: string }>('/notifications/task-action', { token });
      setResult(r.message);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const verb = info?.action === 'complete' ? 'Mark complete' : 'Move to tomorrow';

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1 style={{ fontSize: 18, marginBottom: 6 }}>Mud &amp; Marble OS</h1>
        {error && <p style={{ color: 'var(--rtx)' }}>{error}</p>}
        {!error && !info && <p style={{ color: 'var(--t2)' }}>Loading…</p>}
        {!error && info && !result && (
          <>
            <p style={{ marginBottom: 4 }}>
              <b>{info.title}</b>
            </p>
            {info.project && <p style={{ color: 'var(--t2)', fontSize: 13, marginBottom: 14 }}>{info.project}</p>}
            {info.already_complete && info.action === 'complete' ? (
              <p>This task is already marked complete.</p>
            ) : (
              <button className="btn btn-p" disabled={busy} onClick={confirm}>
                {verb}
              </button>
            )}
          </>
        )}
        {result && <p>{result}</p>}
        <p style={{ marginTop: 18, fontSize: 13 }}>
          <a href="/tasks">Open the task board</a>
        </p>
      </div>
    </div>
  );
}
