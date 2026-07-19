import { useState } from 'react';
import { IconWand } from '@tabler/icons-react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import { WIDGET_REGISTRY } from './widgetRegistry';
import type { CustomWidget, WidgetId } from '../../types';

interface AddWidgetModalProps {
  onClose: () => void;
  existingIds: string[];
  customWidgets: CustomWidget[];
  onAddBuiltIn: (id: WidgetId) => void;
  onCustomWidgetCreated: (widget: CustomWidget) => void;
  onAddCustom: (id: string) => void;
}

export function AddWidgetModal({
  onClose,
  existingIds,
  customWidgets,
  onAddBuiltIn,
  onCustomWidgetCreated,
  onAddCustom,
}: AddWidgetModalProps) {
  const [prompt, setPrompt] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const availableBuiltIns = (Object.keys(WIDGET_REGISTRY) as WidgetId[]).filter((id) => !existingIds.includes(id));
  const availableCustom = customWidgets.filter((w) => !existingIds.includes(`custom:${w.id}`));

  async function handleCreate() {
    if (!prompt.trim()) return;
    setCreating(true);
    setError('');
    try {
      const widget = await api.post<CustomWidget>('/dashboard/custom-widgets', { prompt });
      onCustomWidgetCreated(widget);
      setPrompt('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to create widget');
    } finally {
      setCreating(false);
    }
  }

  return (
    <Modal title="Add a widget" onClose={onClose} wide>
      <div className="fg">
        <label className="fl">Create a new widget with Claude</label>
        <textarea
          className="fi"
          style={{ minHeight: 70 }}
          placeholder='e.g. "total outstanding AR over 60 days" or "count of at-risk design projects"'
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        {error && <div className="merr" style={{ marginTop: 8 }}>{error}</div>}
        <button className="btn btn-p" style={{ marginTop: 8 }} onClick={handleCreate} disabled={creating}>
          <IconWand size={14} /> {creating ? 'Creating…' : 'Create widget'}
        </button>
      </div>

      {availableCustom.length > 0 && (
        <div className="fg">
          <label className="fl">Your custom widgets</label>
          {availableCustom.map((w) => (
            <button key={w.id} type="button" className="btn" style={{ width: '100%', justifyContent: 'space-between', marginBottom: 6 }} onClick={() => onAddCustom(w.id)}>
              {w.title}
              <span style={{ color: 'var(--t3)', fontSize: 11 }}>Add +</span>
            </button>
          ))}
        </div>
      )}

      <div className="fg">
        <label className="fl">Built-in widgets</label>
        {availableBuiltIns.length ? (
          availableBuiltIns.map((id) => (
            <button key={id} type="button" className="btn" style={{ width: '100%', justifyContent: 'space-between', marginBottom: 6 }} onClick={() => onAddBuiltIn(id)}>
              {WIDGET_REGISTRY[id].title}
              <span style={{ color: 'var(--t3)', fontSize: 11 }}>Add +</span>
            </button>
          ))
        ) : (
          <div style={{ fontSize: 12, color: 'var(--t2)' }}>All built-in widgets are already on your dashboard.</div>
        )}
      </div>

      <div className="ma">
        <button className="btn" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
