import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';

interface PulseCheckinModalProps {
  onClose: () => void;
  onSaved?: () => void;
}

const WORKLOAD_LABELS: Record<number, string> = {
  1: 'Light',
  2: 'Steady',
  3: 'Busy',
  4: 'Heavy',
  5: 'Underwater',
};

export function PulseCheckinModal({ onClose, onSaved }: PulseCheckinModalProps) {
  const toast = useToast();
  const [workloadRating, setWorkloadRating] = useState(0);
  const [feelingStuck, setFeelingStuck] = useState(false);
  const [stuckNote, setStuckNote] = useState('');
  const [gratefulFor, setGratefulFor] = useState('');
  const [win, setWin] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!workloadRating) {
      setError('Give us a workload number so we know where you stand.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post('/pulse/checkins', {
        workload_rating: workloadRating,
        feeling_stuck: feelingStuck,
        stuck_note: feelingStuck ? stuckNote.trim() || null : null,
        grateful_for: gratefulFor.trim() || null,
        win: win.trim() || null,
      });
      toast('Thanks for checking in!');
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to submit check-in');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="How's the week going?" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div className="merr">{error}</div>}
        <div className="fg">
          <label className="fl">Workload — 1 (light) to 5 (underwater)</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className={`btn btn-sm${workloadRating === n ? ' btn-p' : ''}`}
                style={{ flex: 1, flexDirection: 'column', gap: 2, height: 52 }}
                onClick={() => setWorkloadRating(n)}
              >
                <span style={{ fontSize: 15, fontWeight: 600 }}>{n}</span>
                <span style={{ fontSize: 10, opacity: 0.8 }}>{WORKLOAD_LABELS[n]}</span>
              </button>
            ))}
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', margin: '10px 0' }}>
          <input type="checkbox" checked={feelingStuck} onChange={(e) => setFeelingStuck(e.target.checked)} />
          I'm feeling stuck on something
        </label>
        {feelingStuck && (
          <div className="fg">
            <label className="fl">What's got you stuck? (optional)</label>
            <textarea className="fi" value={stuckNote} onChange={(e) => setStuckNote(e.target.value)} placeholder="Waiting on approval, unclear scope, blocked by..." />
          </div>
        )}
        <div className="fg">
          <label className="fl">Something you're grateful for (optional)</label>
          <input className="fi" value={gratefulFor} onChange={(e) => setGratefulFor(e.target.value)} placeholder="A good conversation, a win, the weather..." />
        </div>
        <div className="fg">
          <label className="fl">A win to share (optional)</label>
          <input className="fi" value={win} onChange={(e) => setWin(e.target.value)} placeholder="Closed out the inspection, landed a bid..." />
        </div>
        <div className="ma">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-p" disabled={saving}>
            {saving ? 'Sending…' : 'Send check-in'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
