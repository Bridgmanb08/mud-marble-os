import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import { ReferralPicker } from './ReferralPicker';
import type { Client } from '../../types';

interface NewClientModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export function NewClientModal({ onClose, onCreated }: NewClientModalProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [wasReferred, setWasReferred] = useState(false);
  const [referredByClientId, setReferredByClientId] = useState<string | null>(null);
  const [referralName, setReferralName] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<Client[]>('/clients').then(setClients).catch(() => {});
  }, []);

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
        address: address.trim() || null,
        referred_by_client_id: wasReferred ? referredByClientId : null,
        referral_name: wasReferred ? referralName : null,
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
          <label className="fl">Address</label>
          <input className="fi" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="fg">
          <label className="fl" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={wasReferred} onChange={(e) => setWasReferred(e.target.checked)} />
            This client was referred by someone
          </label>
        </div>
        {wasReferred && (
          <div className="fg">
            <label className="fl">Referred by</label>
            <ReferralPicker
              clients={clients}
              referredByClientId={referredByClientId}
              referralName={referralName}
              onChange={(next) => {
                setReferredByClientId(next.referredByClientId);
                setReferralName(next.referralName);
              }}
              listId="new-client-referral-options"
            />
          </div>
        )}
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
