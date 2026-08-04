import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import type { RentalUnit } from '../../types';

export function NewRentalUnitModal({
  propertyId,
  onClose,
  onSaved,
}: {
  propertyId: string;
  onClose: () => void;
  onSaved: (u: RentalUnit) => void;
}) {
  const [label, setLabel] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [squareFeet, setSquareFeet] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const created = await api.post<RentalUnit>(`/rental-properties/${propertyId}/units`, {
        unit_label: label.trim() || 'Main',
        bedrooms: bedrooms ? parseFloat(bedrooms) : null,
        bathrooms: bathrooms ? parseFloat(bathrooms) : null,
        square_feet: squareFeet ? parseFloat(squareFeet) : null,
      });
      onSaved(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save unit');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New unit" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div className="merr">{error}</div>}
        <div className="fg">
          <label className="fl">Unit label</label>
          <input className="fi" placeholder="Main, Unit A, Upstairs…" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
        </div>
        <div className="fr">
          <div className="fg">
            <label className="fl">Bedrooms</label>
            <input className="fi" type="number" value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} />
          </div>
          <div className="fg">
            <label className="fl">Bathrooms</label>
            <input className="fi" type="number" value={bathrooms} onChange={(e) => setBathrooms(e.target.value)} />
          </div>
          <div className="fg">
            <label className="fl">Square feet</label>
            <input className="fi" type="number" value={squareFeet} onChange={(e) => setSquareFeet(e.target.value)} />
          </div>
        </div>
        <div className="ma">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-p" disabled={saving}>
            {saving ? 'Saving…' : 'Add unit'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
