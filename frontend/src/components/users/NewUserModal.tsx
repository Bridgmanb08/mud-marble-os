import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';

interface NewUserModalProps {
  onClose: () => void;
  onCreated: () => void;
}

const ROLES = ['owner', 'ops', 'cfo', 'assistant', 'design', 'member'];

export function NewUserModal({ onClose, onCreated }: NewUserModalProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [isAdmin, setIsAdmin] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setError('Name and email are required.');
      return;
    }
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
      await api.post('/users', {
        name: name.trim(),
        email: email.trim(),
        password,
        role,
        is_admin: isAdmin,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create user');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New user" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div className="merr">{error}</div>}
        <div className="fr">
          <div className="fg">
            <label className="fl">Name</label>
            <input className="fi" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="fg">
            <label className="fl">Email</label>
            <input className="fi" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <div className="fr">
          <div className="fg">
            <label className="fl">Role</label>
            <select className="fi" value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="fg" style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
              Admin access
            </label>
          </div>
        </div>
        <div className="fr">
          <div className="fg">
            <label className="fl">Password</label>
            <input className="fi" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
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
            {saving ? 'Saving…' : 'Add user'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
