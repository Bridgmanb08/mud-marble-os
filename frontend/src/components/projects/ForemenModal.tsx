import { useState } from 'react';
import { IconTrash } from '@tabler/icons-react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import type { Foreman } from '../../types';

const PRESETS = ['#E24B4A', '#EF9F27', '#F2D74B', '#1D9E75', '#378ADD', '#534AB7', '#B74B97', '#7B4B34', '#5F5E5A', '#111111'];

// Add, rename, recolor and remove foremen. Colors are set here to match the CFO
// spreadsheet's color coding.
export function ForemenModal({ foremen, onClose, onChanged }: { foremen: Foreman[]; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESETS[0]);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>, okMessage?: string) {
    setBusy(true);
    try {
      await fn();
      if (okMessage) toast(okMessage);
      onChanged();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'That didn\'t save', true);
    } finally {
      setBusy(false);
    }
  }

  const add = () =>
    newName.trim() &&
    run(async () => {
      await api.post('/foremen', { name: newName.trim(), color: newColor });
      setNewName('');
      setNewColor(PRESETS[(foremen.length + 1) % PRESETS.length]);
    }, 'Foreman added');

  return (
    <Modal title="Foremen & colors" onClose={onClose}>
      <p style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 12 }}>
        Each job can have a foreman. Pick the same color the CFO spreadsheet uses for them and it shows on their jobs everywhere.
      </p>
      {foremen.length === 0 && <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 12 }}>No foremen yet -- add the first one below.</div>}
      {foremen.map((f) => (
        <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
          <input
            type="color"
            value={f.color}
            title="Color"
            disabled={busy}
            onChange={(e) => run(() => api.patch(`/foremen/${f.id}`, { color: e.target.value }))}
            style={{ width: 34, height: 28, padding: 0, border: '1px solid var(--border-md)', borderRadius: 6, background: 'none', cursor: 'pointer' }}
          />
          <input
            className="fi"
            defaultValue={f.name}
            style={{ flex: 1 }}
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (name && name !== f.name) run(() => api.patch(`/foremen/${f.id}`, { name }), 'Renamed');
              else e.target.value = f.name;
            }}
          />
          <button
            type="button"
            className="btn-reset"
            title="Remove (their jobs just won't have a foreman)"
            disabled={busy}
            style={{ color: 'var(--red)', cursor: 'pointer' }}
            onClick={() => {
              if (window.confirm(`Remove ${f.name}? Their jobs will have no foreman.`)) run(() => api.delete(`/foremen/${f.id}`), 'Removed');
            }}
          >
            <IconTrash size={14} />
          </button>
        </div>
      ))}
      <div className="fg" style={{ marginTop: 14 }}>
        <label className="fl">Add a foreman</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="color"
            value={newColor}
            title="Color"
            onChange={(e) => setNewColor(e.target.value)}
            style={{ width: 34, height: 28, padding: 0, border: '1px solid var(--border-md)', borderRadius: 6, background: 'none', cursor: 'pointer' }}
          />
          <input
            className="fi"
            style={{ flex: 1 }}
            value={newName}
            placeholder="Name"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void add();
              }
            }}
          />
          <button type="button" className="btn btn-p btn-sm" disabled={busy || !newName.trim()} onClick={() => void add()}>
            Add
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              title={c}
              onClick={() => setNewColor(c)}
              style={{ width: 20, height: 20, borderRadius: '50%', background: c, border: newColor === c ? '2px solid var(--text)' : '1px solid rgba(0,0,0,.15)', cursor: 'pointer', padding: 0 }}
            />
          ))}
        </div>
      </div>
      <div className="ma">
        <button className="btn btn-p" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
