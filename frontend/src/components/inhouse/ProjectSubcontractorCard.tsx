import { useState } from 'react';
import { IconTrash } from '@tabler/icons-react';
import { api, ApiError } from '../../api/client';
import { useToast } from '../ui/Toast';
import { fmt } from '../../lib/format';
import type { ProjectSubItem, Subcontractor } from '../../types';

interface ProjectSubcontractorCardProps {
  projectId: string;
  subcontractor: Subcontractor;
  items: ProjectSubItem[];
  paid: number;
  onChanged: () => void;
}

export function ProjectSubcontractorCard({ projectId, subcontractor, items, paid, onChanged }: ProjectSubcontractorCardProps) {
  const toast = useToast();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const contracted = items.reduce((s, i) => s + (i.amount || 0), 0);
  const remaining = contracted - paid;

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
            <span style={{ flex: 1, fontSize: 13 }}>{item.description || '—'}</span>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{fmt(item.amount)}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => deleteItem(item.id)}>
              <IconTrash size={13} />
            </button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
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
    </div>
  );
}
