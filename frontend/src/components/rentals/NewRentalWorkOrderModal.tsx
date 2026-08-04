import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import type { RentalProperty, RentalWorkOrder } from '../../types';

export function NewRentalWorkOrderModal({
  properties,
  defaultPropertyId,
  onClose,
  onSaved,
}: {
  properties: RentalProperty[];
  defaultPropertyId?: string;
  onClose: () => void;
  onSaved: (wo: RentalWorkOrder) => void;
}) {
  const [propertyId, setPropertyId] = useState(defaultPropertyId || properties[0]?.id || '');
  const [unitId, setUnitId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('normal');
  const [assignedTo, setAssignedTo] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const units = properties.find((p) => p.id === propertyId)?.units || [];

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!propertyId || !title.trim()) {
      setError('Property and title are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const created = await api.post<RentalWorkOrder>('/rental-work-orders', {
        property_id: propertyId,
        unit_id: unitId || null,
        title: title.trim(),
        description: description.trim() || null,
        priority,
        assigned_to: assignedTo.trim() || null,
      });
      onSaved(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save work order');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New work order" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div className="merr">{error}</div>}
        <div className="fr">
          <div className="fg">
            <label className="fl">Property</label>
            <select
              className="fi"
              value={propertyId}
              onChange={(e) => {
                setPropertyId(e.target.value);
                setUnitId('');
              }}
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.address}
                </option>
              ))}
            </select>
          </div>
          <div className="fg">
            <label className="fl">Unit (optional)</label>
            <select className="fi" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              <option value="">— Whole property —</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.unit_label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="fg">
          <label className="fl">Title</label>
          <input className="fi" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>
        <div className="fg">
          <label className="fl">Description</label>
          <textarea className="fi" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="fr">
          <div className="fg">
            <label className="fl">Priority</label>
            <select className="fi" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div className="fg">
            <label className="fl">Assigned to</label>
            <input className="fi" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} />
          </div>
        </div>
        <div className="ma">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-p" disabled={saving}>
            {saving ? 'Saving…' : 'Create work order'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
