import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import { fmt } from '../../lib/format';
import type { EstimateTemplate, EstimateTemplateItem } from '../../types';

export function InsertFromTemplateModal({
  onClose,
  onInsert,
}: {
  onClose: () => void;
  onInsert: (items: EstimateTemplateItem[]) => Promise<void>;
}) {
  const [templates, setTemplates] = useState<EstimateTemplate[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [items, setItems] = useState<EstimateTemplateItem[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [loadingItems, setLoadingItems] = useState(false);
  const [inserting, setInserting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<EstimateTemplate[]>('/estimate-templates').then(setTemplates).catch(() => {});
  }, []);

  useEffect(() => {
    if (!templateId) {
      setItems([]);
      return;
    }
    setLoadingItems(true);
    api
      .get<EstimateTemplateItem[]>(`/estimate-templates/${templateId}/items`)
      .then((rows) => {
        setItems(rows);
        setChecked(Object.fromEntries(rows.map((r) => [r.id, true])));
      })
      .catch(() => setItems([]))
      .finally(() => setLoadingItems(false));
  }, [templateId]);

  async function handleInsert() {
    const selected = items.filter((i) => checked[i.id]);
    if (selected.length === 0) return;
    setInserting(true);
    setError('');
    try {
      await onInsert(selected);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to insert items');
    } finally {
      setInserting(false);
    }
  }

  const checkedCount = items.filter((i) => checked[i.id]).length;

  return (
    <Modal title="Insert from template" onClose={onClose} wide>
      {error && <div className="merr">{error}</div>}
      <div className="fg">
        <label className="fl">Template</label>
        <select className="fi" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          <option value="">— Select a template —</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.category ? ` (${t.category})` : ''}
            </option>
          ))}
        </select>
      </div>

      {loadingItems && <div style={{ fontSize: 12, color: 'var(--t2)' }}>Loading items…</div>}

      {!loadingItems && templateId && items.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--t2)' }}>This template has no line items yet.</div>
      )}

      {items.length > 0 && (
        <div style={{ maxHeight: 320, overflowY: 'auto', marginTop: 8 }}>
          {items.map((item) => (
            <label
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 0',
                borderBottom: '1px solid var(--border)',
                fontSize: 13,
              }}
            >
              <input
                type="checkbox"
                checked={checked[item.id] ?? true}
                onChange={(e) => setChecked((prev) => ({ ...prev, [item.id]: e.target.checked }))}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500 }}>{item.title}</div>
                {item.cost_codes && (
                  <div style={{ fontSize: 11, color: 'var(--t2)' }}>
                    {item.cost_codes.code} - {item.cost_codes.name}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--t2)' }}>{fmt(item.owner_price)}</div>
            </label>
          ))}
        </div>
      )}

      <div className="ma" style={{ marginTop: 16 }}>
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-p" onClick={handleInsert} disabled={inserting || checkedCount === 0}>
          {inserting ? 'Inserting…' : `Insert ${checkedCount || ''} item${checkedCount !== 1 ? 's' : ''}`}
        </button>
      </div>
    </Modal>
  );
}
