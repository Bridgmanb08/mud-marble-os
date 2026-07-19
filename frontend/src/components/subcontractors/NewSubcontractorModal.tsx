import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import type { Subcontractor } from '../../types';

interface NewSubcontractorModalProps {
  onClose: () => void;
  onSaved: () => void;
  sub?: Subcontractor;
}

export function NewSubcontractorModal({ onClose, onSaved, sub }: NewSubcontractorModalProps) {
  const [companyName, setCompanyName] = useState(sub?.company_name || '');
  const [trade, setTrade] = useState(sub?.trade || '');
  const [contactName, setContactName] = useState(sub?.contact_name || '');
  const [phone, setPhone] = useState(sub?.phone || '');
  const [email, setEmail] = useState(sub?.email || '');
  const [insuranceExpiry, setInsuranceExpiry] = useState(sub?.insurance_expiry?.slice(0, 10) || '');
  const [licenseNumber, setLicenseNumber] = useState(sub?.license_number || '');
  const [rating, setRating] = useState(sub?.rating ? String(sub.rating) : '');
  const [preferred, setPreferred] = useState(sub?.preferred || false);
  const [w9OnFile, setW9OnFile] = useState(sub?.w9_on_file || false);
  const [notes, setNotes] = useState(sub?.notes || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!companyName.trim()) {
      setError('Company name is required.');
      return;
    }
    setSaving(true);
    setError('');
    const payload = {
      company_name: companyName.trim(),
      trade: trade.trim() || null,
      contact_name: contactName.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      insurance_expiry: insuranceExpiry || null,
      license_number: licenseNumber.trim() || null,
      rating: rating ? parseInt(rating, 10) : null,
      preferred,
      w9_on_file: w9OnFile,
      notes: notes.trim() || null,
    };
    try {
      if (sub) {
        await api.patch(`/subcontractors/${sub.id}`, payload);
      } else {
        await api.post('/subcontractors', payload);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save subcontractor');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={sub ? 'Edit subcontractor' : 'Add subcontractor'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div className="merr">{error}</div>}
        <div className="fg">
          <label className="fl">Company name</label>
          <input className="fi" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
        </div>
        <div className="fr">
          <div className="fg">
            <label className="fl">Trade</label>
            <input className="fi" value={trade} onChange={(e) => setTrade(e.target.value)} placeholder="Electrical" />
          </div>
          <div className="fg">
            <label className="fl">Contact name</label>
            <input className="fi" value={contactName} onChange={(e) => setContactName(e.target.value)} />
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
        <div className="fr3">
          <div className="fg">
            <label className="fl">Insurance expiry</label>
            <input className="fi" type="date" value={insuranceExpiry} onChange={(e) => setInsuranceExpiry(e.target.value)} />
          </div>
          <div className="fg">
            <label className="fl">License #</label>
            <input className="fi" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} />
          </div>
          <div className="fg">
            <label className="fl">Rating (1-5)</label>
            <input className="fi" type="number" min={1} max={5} value={rating} onChange={(e) => setRating(e.target.value)} />
          </div>
        </div>
        <div className="fg">
          <label className="fl">Notes</label>
          <textarea className="fi" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 20, marginBottom: 14 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={preferred} onChange={(e) => setPreferred(e.target.checked)} /> Preferred
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={w9OnFile} onChange={(e) => setW9OnFile(e.target.checked)} /> W9 on file
          </label>
        </div>
        <div className="ma">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-p" disabled={saving}>
            {saving ? 'Saving…' : sub ? 'Save changes' : 'Add sub'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
