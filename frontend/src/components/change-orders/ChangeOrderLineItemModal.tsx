import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import { useReferenceData } from '../../reference-data/ReferenceDataContext';
import type { ChangeOrderLineItem } from '../../types';

const COST_TYPES = [
  { value: 'none', label: 'None' },
  { value: 'labor', label: 'Labor' },
  { value: 'material', label: 'Material' },
  { value: 'subcontractor', label: 'Subcontractor' },
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// A change order's line items, built with cost codes and computed
// pricing -- the same "refer to a cost code, don't just type a number in"
// shape estimate line items already use, just without the grouping/bucket
// complexity a full estimate needs and a change order almost never does.
export function ChangeOrderLineItemModal({
  coId,
  item,
  onClose,
  onSaved,
  onDeleted,
}: {
  coId: string;
  item?: ChangeOrderLineItem;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}) {
  const { costCodes: costCodesData } = useReferenceData();
  const costCodes = costCodesData ?? [];
  const [costCodeId, setCostCodeId] = useState(item?.cost_code_id || '');
  const [title, setTitle] = useState(item?.title || '');
  const [description, setDescription] = useState(item?.description || '');
  const [quantity, setQuantity] = useState(String(item?.quantity ?? 1));
  const [unit, setUnit] = useState(item?.unit || '');
  const [unitCost, setUnitCost] = useState(String(item?.unit_cost ?? 0));
  const [costType, setCostType] = useState(item?.cost_type || 'none');
  const [markupType, setMarkupType] = useState(item?.markup_type || 'percent');
  const [markupValue, setMarkupValue] = useState(String(item?.markup_value ?? 0));
  const [notesInternal, setNotesInternal] = useState(item?.notes_internal || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const qty = parseFloat(quantity) || 0;
  const cost = parseFloat(unitCost) || 0;
  const markup = parseFloat(markupValue) || 0;
  const builderCost = qty * cost;
  const ownerPrice = markupType === 'flat' ? builderCost + markup : builderCost * (1 + markup / 100);

  function handleMarkupTypeChange(newType: string) {
    if (newType === markupType) return;
    // Converting between percent/flat keeps the resulting dollar markup the
    // same instead of reinterpreting the same number under the new type --
    // the same conversion LineItemModal already does for estimate items.
    if (builderCost > 0) {
      if (newType === 'flat') {
        setMarkupValue(String(round2(builderCost * (markup / 100))));
      } else {
        setMarkupValue(String(round2((markup / builderCost) * 100)));
      }
    }
    setMarkupType(newType);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Item name is required.');
      return;
    }
    setSaving(true);
    setError('');
    const payload = {
      cost_code_id: costCodeId || null,
      title: title.trim(),
      description: description.trim() || null,
      quantity: qty,
      unit: unit.trim() || null,
      unit_cost: cost,
      cost_type: costType,
      markup_type: markupType,
      markup_value: markup,
      notes_internal: notesInternal.trim() || null,
    };
    try {
      if (item) {
        await api.patch(`/change-orders/${coId}/items/${item.id}`, payload);
      } else {
        await api.post(`/change-orders/${coId}/items`, payload);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save line item');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!item || !confirm('Delete this line item?')) return;
    setDeleting(true);
    try {
      await api.delete(`/change-orders/${coId}/items/${item.id}`);
      onDeleted?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete line item');
      setDeleting(false);
    }
  }

  return (
    <Modal title={item ? 'Edit line item' : 'Add line item'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div className="merr">{error}</div>}
        <div className="fg">
          <label className="fl">Item name</label>
          <input className="fi" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Relocate stairwell framing" />
        </div>
        <div className="fr">
          <div className="fg">
            <label className="fl">Cost code</label>
            <select className="fi" value={costCodeId} onChange={(e) => setCostCodeId(e.target.value)}>
              <option value="">— None —</option>
              {costCodes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} - {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="fg">
            <label className="fl">Cost type</label>
            <select className="fi" value={costType} onChange={(e) => setCostType(e.target.value)}>
              {COST_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="fr3">
          <div className="fg">
            <label className="fl">Quantity</label>
            <input className="fi" type="number" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="fg">
            <label className="fl">Unit</label>
            <input className="fi" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. sf, LS" />
          </div>
          <div className="fg">
            <label className="fl">Unit cost ($)</label>
            <input className="fi" type="number" step="any" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
          </div>
        </div>
        <div className="fr">
          <div className="fg">
            <label className="fl">Markup type</label>
            <select className="fi" value={markupType} onChange={(e) => handleMarkupTypeChange(e.target.value)}>
              <option value="percent">Percent</option>
              <option value="flat">Flat $</option>
            </select>
          </div>
          <div className="fg">
            <label className="fl">Markup value {markupType === 'flat' ? '($)' : '(%)'}</label>
            <input className="fi" type="number" step="any" value={markupValue} onChange={(e) => setMarkupValue(e.target.value)} />
          </div>
        </div>
        <div className="fg">
          <label className="fl">Description (client-facing)</label>
          <textarea className="fi" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="fg">
          <label className="fl">Internal notes</label>
          <textarea className="fi" value={notesInternal} onChange={(e) => setNotesInternal(e.target.value)} />
          <div className="m-sub">For the team only -- not shown to the client, including on the PDF/Excel export.</div>
        </div>

        <div className="card" style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', marginBottom: 14, background: 'var(--bg)' }}>
          <span style={{ fontSize: 12, color: 'var(--t2)' }}>Builder cost: ${builderCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          <strong style={{ fontSize: 14 }}>Price: ${ownerPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
        </div>

        <div className="ma" style={{ justifyContent: item ? 'space-between' : 'flex-end' }}>
          {item && (
            <button type="button" className="btn btn-sm" style={{ color: 'var(--rtx)' }} onClick={handleDelete} disabled={deleting || saving}>
              Delete
            </button>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-sm" onClick={onClose} disabled={saving || deleting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-p btn-sm" disabled={saving || deleting}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
