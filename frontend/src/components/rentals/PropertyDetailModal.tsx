import { useState } from 'react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { openDatePicker } from '../../lib/datePicker';
import type { RentalPropertyDetail } from '../../types';

// A handful of common "house facts" categories, offered as suggestions (not
// a fixed enum) via a <datalist> -- same free-text-with-suggestions
// convention already used for estimate cost-code groups elsewhere in this
// app. Anything else can still be typed in.
const CATEGORY_SUGGESTIONS = [
  'Paint — exterior',
  'Paint — interior',
  'Roof',
  'Appliances',
  'Landscaping',
  'Flooring',
  'HVAC',
  'Water heater',
];

interface PropertyDetailModalProps {
  propertyId: string;
  detail?: RentalPropertyDetail;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}

export function PropertyDetailModal({ propertyId, detail, onClose, onSaved, onDeleted }: PropertyDetailModalProps) {
  const toast = useToast();
  const [category, setCategory] = useState(detail?.category || '');
  const [detailText, setDetailText] = useState(detail?.detail || '');
  const [detailDate, setDetailDate] = useState(detail?.detail_date || '');
  const [notes, setNotes] = useState(detail?.notes || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!category.trim() || !detailText.trim()) {
      setError('Category and detail are both required.');
      return;
    }
    setSaving(true);
    setError('');
    const payload = {
      category: category.trim(),
      detail: detailText.trim(),
      detail_date: detailDate || null,
      notes: notes.trim() || null,
    };
    try {
      if (detail) {
        await api.patch(`/rental-properties/details/${detail.id}`, payload);
      } else {
        await api.post(`/rental-properties/${propertyId}/details`, payload);
      }
      toast(detail ? 'Detail updated' : 'Detail added');
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!detail || !confirm('Delete this detail?')) return;
    await api.delete(`/rental-properties/details/${detail.id}`);
    toast('Detail removed');
    onDeleted?.();
  }

  return (
    <Modal title={detail ? 'Edit property detail' : 'Add property detail'} onClose={onClose}>
      {error && <div className="merr">{error}</div>}
      <div className="fg">
        <label className="fl">Category</label>
        <input
          className="fi"
          list="property-detail-category-options"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="e.g. Roof, Paint — exterior, Appliances"
        />
        <datalist id="property-detail-category-options">
          {CATEGORY_SUGGESTIONS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
      <div className="fg">
        <label className="fl">Detail</label>
        <textarea
          className="fi"
          rows={3}
          value={detailText}
          onChange={(e) => setDetailText(e.target.value)}
          placeholder="e.g. Sherwin Williams 'Agreeable Gray' SW 7029, trim in 'Extra White'"
        />
      </div>
      <div className="fg">
        <label className="fl">Date</label>
        <input className="fi" type="date" value={detailDate} onClick={openDatePicker} onChange={(e) => setDetailDate(e.target.value)} />
        <div className="m-sub">When this was done, installed, or last confirmed — optional if unknown.</div>
      </div>
      <div className="fg">
        <label className="fl">Notes</label>
        <textarea className="fi" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional — vendor, warranty info, etc." />
      </div>
      <div className="ma">
        {detail && (
          <button type="button" className="btn" style={{ color: 'var(--red)' }} onClick={handleDelete}>
            Delete
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-p" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  );
}
