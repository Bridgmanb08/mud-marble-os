import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';

interface NewClientModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export function NewClientModal({ onClose, onCreated }: NewClientModalProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [referralName, setReferralName] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!firstName.trim()) {
      setError('First name is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post('/clients', {
        first_name: firstName.trim(),
        last_name: lastName.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        referral_name: referralName.trim() || null,
        notes: notes.trim() || null,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create client');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New client" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div className="merr">{error}</div>}
        <div className="fr">
          <div className="fg">
            <label className="fl">First name</label>
            <input className="fi" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div className="fg">
            <label className="fl">Last name</label>
            <input className="fi" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        </div>
        <div className="fr">
          <div className="fg">
            <label className="fl">Phone</label>
            <input className="fi" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="fg">
            <label className="fl">Email</label>
            <input className="fi" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <div className="fg">
          <label className="fl">Referred by</label>
          <input className="fi" value={referralName} onChange={(e) => setReferralName(e.target.value)} />
        </div>
        <div className="fg">
          <label className="fl">Notes</label>
          <textarea className="fi" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="ma">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-p" disabled={saving}>
            {saving ? 'Saving…' : 'Add client'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
