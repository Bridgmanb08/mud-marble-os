import { useState } from 'react';
import { IconGripVertical, IconPlus, IconTrash } from '@tabler/icons-react';
import { api, ApiError } from '../../api/client';
import { useToast } from '../ui/Toast';
import { Modal } from '../ui/Modal';
import type { LeadStage } from '../../types';

interface Props {
  stages: LeadStage[];
  onClose: () => void;
  onChanged: () => void;
}

// Admin-only editor for the sales pipeline itself -- rename a stage's
// label, reorder the pipeline, mark a stage as the "won"/"lost" terminal
// state, or add a brand new stage. Reached from the "✎ Edit stages..."
// option at the bottom of every row's Sales stage dropdown (Leads.tsx).
export function LeadStagesModal({ stages, onClose, onChanged }: Props) {
  const toast = useToast();
  const [rows, setRows] = useState(stages);
  const [newLabel, setNewLabel] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  async function saveLabel(stage: LeadStage, label: string) {
    if (label.trim() === stage.label) return;
    if (!label.trim()) {
      toast('Label cannot be blank', true);
      return;
    }
    setSavingId(stage.id);
    try {
      await api.patch(`/lead-stages/${stage.id}`, { label: label.trim() });
      onChanged();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to save', true);
    } finally {
      setSavingId(null);
    }
  }

  async function setFlag(stage: LeadStage, field: 'is_won' | 'is_lost', value: boolean) {
    try {
      // Won and lost are mutually exclusive terminal states -- flipping one
      // on clears the other, matching how the pipeline's badge coloring
      // (Leads.tsx) treats them as a single choice, not two independent
      // toggles.
      await api.patch(`/lead-stages/${stage.id}`, {
        [field]: value,
        ...(value ? { [field === 'is_won' ? 'is_lost' : 'is_won']: false } : {}),
        is_open: !value,
      });
      onChanged();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to save', true);
    }
  }

  async function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= rows.length) return;
    const reordered = [...rows];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setRows(reordered);
    try {
      await Promise.all(reordered.map((s, i) => api.patch(`/lead-stages/${s.id}`, { sort_order: i })));
      onChanged();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to reorder', true);
      setRows(stages);
    }
  }

  async function addStage() {
    if (!newLabel.trim()) return;
    try {
      await api.post('/lead-stages', { label: newLabel.trim() });
      setNewLabel('');
      toast('Stage added');
      onChanged();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to add stage', true);
    }
  }

  async function remove(stage: LeadStage) {
    if (!confirm(`Delete "${stage.label}"? This only works if no lead is currently on this stage.`)) return;
    try {
      await api.delete(`/lead-stages/${stage.id}`);
      toast('Stage deleted');
      onChanged();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to delete stage', true);
    }
  }

  return (
    <Modal title="Edit sales stages" onClose={onClose} wide>
      <p style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 14 }}>
        Rename a stage, reorder the pipeline, or mark one as the Won/Lost outcome. Changes apply everywhere the
        pipeline is shown -- everyone's dropdown, filters, and badges.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {rows.map((s, i) => (
          <div
            key={s.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 8px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r)',
              opacity: savingId === s.id ? 0.6 : 1,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <button
                type="button"
                className="btn-reset"
                disabled={i === 0}
                onClick={() => move(i, -1)}
                style={{ color: 'var(--t3)', cursor: i === 0 ? 'default' : 'pointer', lineHeight: '10px' }}
                title="Move up"
              >
                ▲
              </button>
              <button
                type="button"
                className="btn-reset"
                disabled={i === rows.length - 1}
                onClick={() => move(i, 1)}
                style={{ color: 'var(--t3)', cursor: i === rows.length - 1 ? 'default' : 'pointer', lineHeight: '10px' }}
                title="Move down"
              >
                ▼
              </button>
            </div>
            <IconGripVertical size={14} color="var(--t3)" />
            <input
              className="fi"
              defaultValue={s.label}
              style={{ flex: 1 }}
              onBlur={(e) => saveLabel(s, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
            />
            <code style={{ fontSize: 11, color: 'var(--t3)', minWidth: 90 }}>{s.key}</code>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--green)' }}>
              <input type="checkbox" checked={s.is_won} onChange={(e) => setFlag(s, 'is_won', e.target.checked)} /> Won
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--red)' }}>
              <input type="checkbox" checked={s.is_lost} onChange={(e) => setFlag(s, 'is_lost', e.target.checked)} /> Lost
            </label>
            <button type="button" className="btn-reset" onClick={() => remove(s)} style={{ color: 'var(--t3)' }} title="Delete stage">
              <IconTrash size={14} />
            </button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="fi"
          placeholder="New stage name..."
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addStage()}
          style={{ flex: 1 }}
        />
        <button type="button" className="btn btn-p btn-sm" onClick={addStage} disabled={!newLabel.trim()}>
          <IconPlus size={14} /> Add stage
        </button>
      </div>
      <div className="ma">
        <button type="button" className="btn btn-sm" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
