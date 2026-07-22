import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';

interface ResetPasswordModalProps {
  userId: string;
  userName: string;
  onClose: () => void;
  onReset: () => void;
}

export function ResetPasswordModal({ userId, userName, onClose, onReset }: ResetPasswordModalProps) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.patch(`/users/${userId}/password`, { password });
      onReset();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to reset password');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Reset password for ${userName}`} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div className="merr">{error}</div>}
        <div className="fr">
          <div className="fg">
            <label className="fl">New password</label>
            <input className="fi" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          </div>
          <div className="fg">
            <label className="fl">Confirm password</label>
            <input className="fi" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
        </div>
        <div className="ma">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-p" disabled={saving}>
            {saving ? 'Saving…' : 'Reset password'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
