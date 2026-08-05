import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import type { RentalProperty } from '../../types';

const PROPERTY_TYPES = ['single_family', 'duplex', 'triplex', 'fourplex', 'multi_family', 'condo', 'other'];

export function NewRentalPropertyModal({ onClose, onSaved }: { onClose: () => void; onSaved: (p: RentalProperty) => void }) {
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('IN');
  const [zip, setZip] = useState('');
  const [propertyType, setPropertyType] = useState('single_family');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!address.trim()) {
      setError('Address is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const created = await api.post<RentalProperty>('/rental-properties', {
        address: address.trim(),
        city: city.trim() || null,
        state: state.trim() || null,
        zip: zip.trim() || null,
        property_type: propertyType,
        notes: notes.trim() || null,
      });
      onSaved(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save property');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New rental property" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div className="merr">{error}</div>}
        <div className="fg">
          <label className="fl">Address</label>
          <input className="fi" value={address} onChange={(e) => setAddress(e.target.value)} autoFocus />
        </div>
        <div className="fr">
          <div className="fg">
            <label className="fl">City</label>
            <input className="fi" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className="fg">
            <label className="fl">State</label>
            <input className="fi" value={state} onChange={(e) => setState(e.target.value)} />
          </div>
          <div className="fg">
            <label className="fl">Zip</label>
            <input className="fi" value={zip} onChange={(e) => setZip(e.target.value)} />
          </div>
        </div>
        <div className="fg">
          <label className="fl">Property type</label>
          <select className="fi" value={propertyType} onChange={(e) => setPropertyType(e.target.value)}>
            {PROPERTY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
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
            {saving ? 'Saving…' : 'Add property'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
