import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import { fmt } from '../../lib/format';
import type { Estimate, EstimateLineItem, EstimateTemplate, EstimateTemplateItem } from '../../types';

// A pullable-item shape shared by real job line items and formal template
// items -- the two schemas are otherwise identical (both just have a
// different parent FK: estimate_id vs template_id), so the checkbox list
// below works against either without caring which kind it's showing.
type ImportableItem = EstimateLineItem | EstimateTemplateItem;

interface Source {
  id: string;
  kind: 'template' | 'job';
  label: string;
}

export function InsertFromTemplateModal({
  currentEstimateId,
  onClose,
  onInsert,
}: {
  currentEstimateId?: string;
  onClose: () => void;
  onInsert: (items: ImportableItem[]) => Promise<void>;
}) {
  const [sources, setSources] = useState<Source[]>([]);
  const [sourceId, setSourceId] = useState('');
  const [items, setItems] = useState<ImportableItem[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [loadingItems, setLoadingItems] = useState(false);
  const [inserting, setInserting] = useState(false);
  const [error, setError] = useState('');
  const [lastInserted, setLastInserted] = useState<{ count: number; from: string } | null>(null);

  // Every saved estimate is a pullable source, not just the formal
  // curated templates -- Brent's own ask: reuse scope from a past real job
  // the same way you'd reuse a template, no separate "save as template"
  // step required first.
  useEffect(() => {
    Promise.all([
      api.get<EstimateTemplate[]>('/estimate-templates').catch(() => []),
      api.get<Estimate[]>('/estimates').catch(() => []),
    ]).then(([templates, estimates]) => {
      const templateSources: Source[] = templates.map((t) => ({
        id: t.id,
        kind: 'template',
        label: t.name + (t.category ? ` (${t.category})` : ''),
      }));
      const jobSources: Source[] = estimates
        .filter((e) => e.id !== currentEstimateId)
        .map((e) => ({
          id: e.id,
          kind: 'job',
          label: `${(e.projects?.name || 'Unknown job').split('|')[0].trim()} — v${e.version} (${e.status.replace(/_/g, ' ')})`,
        }));
      setSources([...templateSources, ...jobSources]);
    });
  }, [currentEstimateId]);

  useEffect(() => {
    if (!sourceId) {
      setItems([]);
      return;
    }
    const source = sources.find((s) => s.id === sourceId);
    if (!source) return;
    setLoadingItems(true);
    const path = source.kind === 'template' ? `/estimate-templates/${sourceId}/items` : `/estimates/${sourceId}/items`;
    api
      .get<ImportableItem[]>(path)
      .then((rows) => {
        setItems(rows);
        setChecked(Object.fromEntries(rows.map((r) => [r.id, true])));
      })
      .catch(() => setItems([]))
      .finally(() => setLoadingItems(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId]);

  async function handleInsert() {
    const selected = items.filter((i) => checked[i.id]);
    if (selected.length === 0) return;
    const source = sources.find((s) => s.id === sourceId);
    setInserting(true);
    setError('');
    try {
      await onInsert(selected);
      // Reset back to "pick a source" instead of closing -- the whole
      // point of this ask was pulling from more than one job in the same
      // sitting, not one-and-done.
      setLastInserted({ count: selected.length, from: source?.label || 'that source' });
      setSourceId('');
      setItems([]);
      setChecked({});
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to insert items');
    } finally {
      setInserting(false);
    }
  }

  const checkedCount = items.filter((i) => checked[i.id]).length;
  const templateSources = sources.filter((s) => s.kind === 'template');
  const jobSources = sources.filter((s) => s.kind === 'job');

  return (
    <Modal title="Insert from template or past job" onClose={onClose} wide>
      {error && <div className="merr">{error}</div>}
      {lastInserted && (
        <div className="merr" style={{ background: 'var(--gbg)', color: 'var(--gtx)', marginBottom: 10 }}>
          Inserted {lastInserted.count} item{lastInserted.count !== 1 ? 's' : ''} from {lastInserted.from}. Pick
          another job or template below to keep going, or click Done.
        </div>
      )}
      <div className="fg">
        <label className="fl">Source</label>
        <select className="fi" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
          <option value="">— Select a template or job —</option>
          {templateSources.length > 0 && (
            <optgroup label="Templates">
              {templateSources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </optgroup>
          )}
          {jobSources.length > 0 && (
            <optgroup label="Past jobs">
              {jobSources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>

      {loadingItems && <div style={{ fontSize: 12, color: 'var(--t2)' }}>Loading items…</div>}

      {!loadingItems && sourceId && items.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--t2)' }}>This source has no line items yet.</div>
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
          Done
        </button>
        <button type="button" className="btn btn-p" onClick={handleInsert} disabled={inserting || checkedCount === 0}>
          {inserting ? 'Inserting…' : `Insert ${checkedCount || ''} item${checkedCount !== 1 ? 's' : ''}`}
        </button>
      </div>
    </Modal>
  );
}
