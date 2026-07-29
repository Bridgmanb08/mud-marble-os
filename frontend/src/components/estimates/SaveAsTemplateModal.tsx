import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import type { EstimateTemplate } from '../../types';

export function SaveAsTemplateModal({
  estimateId,
  onClose,
  onSaved,
}: {
  estimateId: string;
  onClose: () => void;
  onSaved: (template: EstimateTemplate) => void;
}) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const template = await api.post<EstimateTemplate>(`/estimate-templates/from-estimate/${estimateId}`, {
        name: name.trim(),
        category: category.trim() || null,
        description: description.trim() || null,
      });
      onSaved(template);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save as template');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Save as template" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div className="merr">{error}</div>}
        <p style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 14 }}>
          Copies this estimate's current line items into a new reusable template. Changes here won't affect the
          original estimate.
        </p>
        <div className="fg">
          <label className="fl">Name</label>
          <input className="fi" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Bathroom remodel" />
        </div>
        <div className="fg">
          <label className="fl">Category</label>
          <input
            className="fi"
            list="save-template-category-options"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Bathroom, Kitchen, Addition…"
          />
          <datalist id="save-template-category-options">
            <option value="Bathroom" />
            <option value="Kitchen" />
            <option value="Addition" />
            <option value="Full Rehab" />
          </datalist>
        </div>
        <div className="fg">
          <label className="fl">Description</label>
          <textarea className="fi" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional notes about when to use this template…" />
        </div>
        <div className="ma">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-p" disabled={saving}>
            {saving ? 'Saving…' : 'Save as template'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
