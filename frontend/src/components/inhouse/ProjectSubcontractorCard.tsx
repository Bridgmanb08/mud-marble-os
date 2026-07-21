import { useState } from 'react';
import { IconTrash, IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { api, ApiError } from '../../api/client';
import { useToast } from '../ui/Toast';
import { fmt } from '../../lib/format';
import type { EstimateLineItem, ProjectSubItem, Subcontractor } from '../../types';

interface ProjectSubcontractorCardProps {
  projectId: string;
  subcontractor: Subcontractor;
  items: ProjectSubItem[];
  lineItems: EstimateLineItem[];
  paid: number;
  onChanged: () => void;
}

function AmountInput({ item, onSaved }: { item: ProjectSubItem; onSaved: () => void }) {
  const toast = useToast();
  const [value, setValue] = useState(String(item.amount));

  async function commit() {
    const amt = parseFloat(value);
    if (!amt || amt === item.amount) {
      setValue(String(item.amount));
      return;
    }
    try {
      await api.patch(`/subcontractor-items/${item.id}`, { amount: amt });
      onSaved();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to update amount', true);
      setValue(String(item.amount));
    }
  }

  return (
    <input
      className="fi"
      type="number"
      style={{ width: 110, fontSize: 13, fontWeight: 500, textAlign: 'right' }}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

export function ProjectSubcontractorCard({ projectId, subcontractor, items, lineItems, paid, onChanged }: ProjectSubcontractorCardProps) {
  const toast = useToast();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const contracted = items.reduce((s, i) => s + (i.amount || 0), 0);
  const remaining = contracted - paid;
  const linkedLineItemIds = new Set(items.map((i) => i.source_line_item_id).filter(Boolean));

  async function addItem() {
    const amt = parseFloat(amount);
    if (!amt) return;
    setSaving(true);
    try {
      await api.post(`/projects/${projectId}/subcontractor-items`, {
        subcontractor_id: subcontractor.id,
        description: description.trim() || null,
        amount: amt,
        sort_order: items.length,
      });
      setDescription('');
      setAmount('');
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to add contract item', true);
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(id: string) {
    try {
      await api.delete(`/subcontractor-items/${id}`);
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to remove item', true);
    }
  }

  async function toggleLineItem(li: EstimateLineItem) {
    const existing = items.find((i) => i.source_line_item_id === li.id);
    try {
      if (existing) {
        await api.delete(`/subcontractor-items/${existing.id}`);
      } else {
        await api.post(`/projects/${projectId}/subcontractor-items`, {
          subcontractor_id: subcontractor.id,
          description: li.title,
          amount: li.builder_cost,
          builder_cost: li.builder_cost,
          source_line_item_id: li.id,
          sort_order: items.length,
        });
      }
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to update line item', true);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>
          {subcontractor.company_name}
          {subcontractor.trade && <span style={{ fontWeight: 400, color: 'var(--t2)', fontSize: 12 }}> — {subcontractor.trade}</span>}
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
          <span>
            Contract: <strong>{fmt(contracted)}</strong>
          </span>
          <span style={{ color: 'var(--green)' }}>
            Paid: <strong>{fmt(paid)}</strong>
          </span>
          <span style={{ color: remaining > 0 ? 'var(--atx)' : 'var(--t2)' }}>
            Remaining: <strong>{fmt(remaining)}</strong>
          </span>
        </div>
      </div>
      <div style={{ padding: '8px 16px' }}>
        {items.map((item) => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13 }}>{item.description || '—'}</div>
              {item.builder_cost != null && (
                <div style={{ fontSize: 11, color: 'var(--t2)' }}>Est. builder cost: {fmt(item.builder_cost)}</div>
              )}
            </div>
            <AmountInput item={item} onSaved={onChanged} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => deleteItem(item.id)}>
              <IconTrash size={13} />
            </button>
          </div>
        ))}

        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setShowPicker((v) => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          >
            {showPicker ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}
            Add from estimate
          </button>
          {showPicker && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 6, marginTop: 6, maxHeight: 220, overflowY: 'auto' }}>
              {lineItems.length === 0 ? (
                <div style={{ padding: 10, fontSize: 12, color: 'var(--t2)' }}>No estimate line items on this job yet.</div>
              ) : (
                lineItems.map((li) => (
                  <label
                    key={li.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                  >
                    <input type="checkbox" checked={linkedLineItemIds.has(li.id)} onChange={() => toggleLineItem(li)} />
                    <span style={{ flex: 1, fontSize: 12 }}>{li.title}</span>
                    <span style={{ fontSize: 12, color: 'var(--t2)' }}>{fmt(li.builder_cost)}</span>
                  </label>
                ))
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input
            className="fi"
            placeholder="Line item (e.g. Run new electrical)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <input
            className="fi"
            type="number"
            placeholder="Amount"
            style={{ maxWidth: 140 }}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <button type="button" className="btn btn-sm" onClick={addItem} disabled={saving || !amount}>
            Add
          </button>
        </div>
      </div>

      {items.length > 0 && (
        <div style={{ background: 'var(--gray-bg)', borderTop: '1px solid var(--border)', borderRadius: '0 0 8px 8px', padding: '14px 16px' }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
            {subcontractor.company_name}
            {subcontractor.trade && <span style={{ fontWeight: 400 }}> — {subcontractor.trade}</span>}
          </div>
          {items.map((item) => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
              <span>{item.description || '—'}</span>
              <span>{fmt(item.amount)}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
            <span>Total Contract</span>
            <span>{fmt(contracted)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
