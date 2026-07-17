import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';

interface NewLeadModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export function NewLeadModal({ onClose, onCreated }: NewLeadModalProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [projectType, setProjectType] = useState('');
  const [revenueMin, setRevenueMin] = useState('');
  const [revenueMax, setRevenueMax] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!firstName.trim() && !lastName.trim()) {
      setError('First or last name is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post('/leads', {
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        project_address: address.trim() || null,
        project_type: projectType.trim() || null,
        estimated_revenue_min: revenueMin ? Number(revenueMin) : null,
        estimated_revenue_max: revenueMax ? Number(revenueMax) : null,
        status: 'new',
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create lead');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New lead opportunity" onClose={onClose} wide>
      <form onSubmit={handleSubmit}>
        {error && <div className="merr">{error}</div>}
        <div className="fr">
          <div className="fg">
            <label className="fl">First name</label>
            <input className="fi" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" />
          </div>
          <div className="fg">
            <label className="fl">Last name</label>
            <input className="fi" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Smith" />
          </div>
        </div>
        <div className="fr">
          <div className="fg">
            <label className="fl">Phone</label>
            <input className="fi" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(317) 555-0100" />
          </div>
          <div className="fg">
            <label className="fl">Email</label>
            <input className="fi" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@email.com" />
          </div>
        </div>
        <div className="fg">
          <label className="fl">Project address</label>
          <input className="fi" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St, Indianapolis IN" />
        </div>
        <div className="fr">
          <div className="fg">
            <label className="fl">Project type</label>
            <input className="fi" value={projectType} onChange={(e) => setProjectType(e.target.value)} placeholder="kitchen, addition…" />
          </div>
        </div>
        <div className="fr">
          <div className="fg">
            <label className="fl">Estimated revenue min ($)</label>
            <input className="fi" type="number" value={revenueMin} onChange={(e) => setRevenueMin(e.target.value)} placeholder="50000" />
          </div>
          <div className="fg">
            <label className="fl">Estimated revenue max ($)</label>
            <input className="fi" type="number" value={revenueMax} onChange={(e) => setRevenueMax(e.target.value)} placeholder="100000" />
          </div>
        </div>
        <div className="ma">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-p" disabled={saving}>
            {saving ? 'Saving…' : 'Add lead'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
