import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import { useReferenceData } from '../../reference-data/ReferenceDataContext';
import type { InvoiceLineItem } from '../../types';

interface InvoiceLineItemModalProps {
  invoiceId: string;
  item?: InvoiceLineItem;
  onClose: () => void;
  onSaved: () => void;
}

// The manual "add one line item by hand" path -- a plain, free-typed row
// with no estimate reference. The BuilderTrend-style bulk picker (Add from
// Estimate) is the other, richer way to add rows and lives in its own
// component since its shape (checkbox list + %/$ sync + progress bars) has
// nothing in common with a single-row form.
export function InvoiceLineItemModal({ invoiceId, item, onClose, onSaved }: InvoiceLineItemModalProps) {
  const { costCodes } = useReferenceData();
  const [title, setTitle] = useState(item?.title || '');
  const [costCodeId, setCostCodeId] = useState(item?.cost_code_id || '');
  const [description, setDescription] = useState(item?.description || '');
  const [amount, setAmount] = useState(item ? String(item.amount) : '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    setSaving(true);
    setError('');
    const data = {
      title: title.trim(),
      cost_code_id: costCodeId || null,
      description: description.trim() || null,
      amount: parseFloat(amount) || 0,
    };
    try {
      if (item) {
        await api.patch(`/invoices/${invoiceId}/items/${item.id}`, data);
      } else {
        await api.post(`/invoices/${invoiceId}/items`, data);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save line item');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={item ? 'Edit line item' : 'Add line item'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div className="merr">{error}</div>}
        <div className="fg">
          <label className="fl">Title</label>
          <input className="fi" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>
        <div className="fr">
          <div className="fg">
            <label className="fl">Cost code</label>
            <select className="fi" value={costCodeId} onChange={(e) => setCostCodeId(e.target.value)}>
              <option value="">— None —</option>
              {(costCodes || [])
                .filter((c) => c.is_active)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} - {c.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="fg">
            <label className="fl">Amount ($)</label>
            <input className="fi" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        </div>
        <div className="fg">
          <label className="fl">Description</label>
          <textarea className="fi" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="ma">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-p" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
