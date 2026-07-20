import { useEffect, useState, type FormEvent } from 'react';
import { IconSearch, IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import { fmt } from '../../lib/format';
import type { CostCode, EstimateLineItem, LineItemReference } from '../../types';

interface LineItemModalProps {
  estimateId: string;
  item?: EstimateLineItem;
  defaultBucket?: string;
  defaultGroupName?: string;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}

const BUCKETS = [
  { value: 'pm_fee', label: 'PM Fee' },
  { value: 'construction', label: 'Construction' },
  { value: 'allowance', label: 'Allowance' },
];

const COST_TYPES = [
  { value: 'none', label: 'None' },
  { value: 'labor', label: 'Labor' },
  { value: 'material', label: 'Material' },
  { value: 'subcontractor', label: 'Subcontractor' },
];

export function LineItemModal({ estimateId, item, defaultBucket, defaultGroupName, onClose, onSaved, onDeleted }: LineItemModalProps) {
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [costCodeId, setCostCodeId] = useState(item?.cost_code_id || '');
  const [groupName, setGroupName] = useState(item?.group_name || defaultGroupName || '');
  const [bucket, setBucket] = useState(item?.bucket || defaultBucket || 'construction');
  const [title, setTitle] = useState(item?.title || '');
  const [description, setDescription] = useState(item?.description || '');
  const [quantity, setQuantity] = useState(String(item?.quantity ?? 1));
  const [unit, setUnit] = useState(item?.unit || '');
  const [unitCost, setUnitCost] = useState(String(item?.unit_cost ?? 0));
  const [costType, setCostType] = useState(item?.cost_type || 'none');
  const [markupType, setMarkupType] = useState(item?.markup_type || 'percent');
  const [markupValue, setMarkupValue] = useState(String(item?.markup_value ?? 0));
  const [estimatedHours, setEstimatedHours] = useState(item?.estimated_hours != null ? String(item.estimated_hours) : '');
  const [notesInternal, setNotesInternal] = useState(item?.notes_internal || '');
  const [notesExternal, setNotesExternal] = useState(item?.notes_external || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [showReference, setShowReference] = useState(!item);
  const [refQuery, setRefQuery] = useState('');
  const [refResults, setRefResults] = useState<LineItemReference[]>([]);
  const [refLoading, setRefLoading] = useState(false);
  const [refSearched, setRefSearched] = useState(false);
  const [expandedRefId, setExpandedRefId] = useState<string | null>(null);

  useEffect(() => {
    api.get<CostCode[]>('/transactions/cost-codes').then(setCostCodes).catch(() => {});
  }, []);

  useEffect(() => {
    if (showReference && costCodeId) {
      searchReferences();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showReference, costCodeId]);

  async function searchReferences() {
    if (!costCodeId && !refQuery.trim()) return;
    setRefLoading(true);
    setRefSearched(true);
    try {
      const params = new URLSearchParams();
      if (costCodeId) params.set('cost_code_id', costCodeId);
      if (refQuery.trim()) params.set('q', refQuery.trim());
      params.set('exclude_estimate_id', estimateId);
      const results = await api.get<LineItemReference[]>(`/estimates/line-items/search?${params.toString()}`);
      setRefResults(results);
    } catch {
      setRefResults([]);
    } finally {
      setRefLoading(false);
    }
  }

  function useReference(ref: LineItemReference) {
    setTitle(ref.title);
    setDescription(ref.description || '');
    setQuantity(String(ref.quantity));
    setUnit(ref.unit || '');
    setUnitCost(String(ref.unit_cost));
    setCostType(ref.cost_type);
    setMarkupType(ref.markup_type);
    setMarkupValue(String(ref.markup_value));
    setEstimatedHours(ref.estimated_hours != null ? String(ref.estimated_hours) : '');
    setNotesInternal(ref.notes_internal || '');
    setNotesExternal(ref.notes_external || '');
  }

  const qty = parseFloat(quantity) || 0;
  const cost = parseFloat(unitCost) || 0;
  const markup = parseFloat(markupValue) || 0;
  const builderCost = qty * cost;
  const ownerPrice = markupType === 'flat' ? builderCost + markup : builderCost * (1 + markup / 100);
  const profit = ownerPrice - builderCost;
  const margin = ownerPrice > 0 ? (profit / ownerPrice) * 100 : 0;

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
      group_name: groupName.trim() || null,
      bucket,
      title: title.trim(),
      description: description.trim() || null,
      quantity: qty,
      unit: unit.trim() || null,
      unit_cost: cost,
      cost_type: costType,
      markup_type: markupType,
      markup_value: markup,
      estimated_hours: estimatedHours.trim() ? parseFloat(estimatedHours) : null,
      notes_internal: notesInternal.trim() || null,
      notes_external: notesExternal.trim() || null,
    };
    try {
      if (item) {
        await api.patch(`/estimates/${estimateId}/items/${item.id}`, payload);
      } else {
        await api.post(`/estimates/${estimateId}/items`, payload);
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
    await api.delete(`/estimates/${estimateId}/items/${item.id}`);
    onDeleted?.();
  }

  return (
    <Modal title={item ? 'Edit line item' : 'Add line item'} onClose={onClose} wide>
      <form onSubmit={handleSubmit}>
        {error && <div className="merr">{error}</div>}

        <div className="card" style={{ padding: 14, marginBottom: 16, background: 'var(--bg)' }}>
          <button
            type="button"
            className="btn-reset"
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
            onClick={() => setShowReference((v) => !v)}
          >
            <IconSearch size={14} />
            Reference from another job
            <div style={{ flex: 1 }} />
            {showReference ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
          </button>
          {showReference && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <input
                  className="fi"
                  placeholder="Search by name, e.g. drywall, tile…"
                  value={refQuery}
                  onChange={(e) => setRefQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      searchReferences();
                    }
                  }}
                />
                <button type="button" className="btn btn-sm" onClick={searchReferences} disabled={refLoading}>
                  {refLoading ? 'Searching…' : 'Search'}
                </button>
              </div>
              {!costCodeId && !refQuery && !refSearched && (
                <div style={{ fontSize: 12, color: 'var(--t2)' }}>Pick a cost code below, or search by name, to see how you've priced similar work on other jobs.</div>
              )}
              {refSearched && refResults.length === 0 && !refLoading && (
                <div style={{ fontSize: 12, color: 'var(--t2)' }}>No matching line items found on other jobs.</div>
              )}
              {refResults.map((r) => {
                const expanded = expandedRefId === r.id;
                return (
                  <div key={r.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginBottom: 6, background: 'var(--surface)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: 'var(--t2)' }}>{r.project_name || 'Unknown project'}</div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{r.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 2 }}>
                          {r.quantity}
                          {r.unit ? ` ${r.unit}` : ''} @ {fmt(r.unit_cost)} · builder {fmt(r.builder_cost)} · client {fmt(r.owner_price)}
                          {r.estimated_hours != null ? ` · ~${r.estimated_hours}h` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setExpandedRefId(expanded ? null : r.id)}>
                          {expanded ? 'Hide' : 'Details'}
                        </button>
                        <button type="button" className="btn btn-p btn-sm" onClick={() => useReference(r)}>
                          Use this
                        </button>
                      </div>
                    </div>
                    {expanded && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 12 }}>
                        {r.description && (
                          <div style={{ marginBottom: 6 }}>
                            <strong>Description:</strong> {r.description}
                          </div>
                        )}
                        {r.notes_internal && (
                          <div style={{ marginBottom: 6 }}>
                            <strong>Internal notes:</strong> {r.notes_internal}
                          </div>
                        )}
                        {r.notes_external && (
                          <div>
                            <strong>Client-facing notes:</strong> {r.notes_external}
                          </div>
                        )}
                        {!r.description && !r.notes_internal && !r.notes_external && (
                          <div style={{ color: 'var(--t2)' }}>No additional notes on this item.</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="fr">
          <div className="fg">
            <label className="fl">Item name</label>
            <input className="fi" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Vanity" />
          </div>
          <div className="fg">
            <label className="fl">Group</label>
            <input className="fi" value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Allowance" />
          </div>
        </div>
        <div className="fg">
          <label className="fl">Description</label>
          <textarea className="fi" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="fr3">
          <div className="fg">
            <label className="fl">Bucket</label>
            <select className="fi" value={bucket} onChange={(e) => setBucket(e.target.value)}>
              {BUCKETS.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
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
            <input className="fi" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="fg">
            <label className="fl">Unit</label>
            <input className="fi" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="EA, SF, LS…" />
          </div>
          <div className="fg">
            <label className="fl">Unit cost ($)</label>
            <input className="fi" type="number" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
          </div>
        </div>
        <div className="fr3">
          <div className="fg">
            <label className="fl">Markup type</label>
            <select className="fi" value={markupType} onChange={(e) => setMarkupType(e.target.value)}>
              <option value="percent">Percent (%)</option>
              <option value="flat">Flat ($)</option>
            </select>
          </div>
          <div className="fg">
            <label className="fl">Markup value</label>
            <input className="fi" type="number" value={markupValue} onChange={(e) => setMarkupValue(e.target.value)} />
          </div>
          <div className="fg">
            <label className="fl">Est. hours</label>
            <input className="fi" type="number" value={estimatedHours} onChange={(e) => setEstimatedHours(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <div className="fr">
          <div className="fg">
            <label className="fl">Internal notes</label>
            <textarea className="fi" value={notesInternal} onChange={(e) => setNotesInternal(e.target.value)} />
          </div>
          <div className="fg">
            <label className="fl">Client-facing notes</label>
            <textarea className="fi" value={notesExternal} onChange={(e) => setNotesExternal(e.target.value)} />
          </div>
        </div>

        <div className="card" style={{ padding: 14, marginBottom: 16, display: 'flex', gap: 20, background: 'var(--bg)' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--t2)', textTransform: 'uppercase' }}>Builder cost</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{fmt(builderCost)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--t2)', textTransform: 'uppercase' }}>Client price</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{fmt(ownerPrice)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--t2)', textTransform: 'uppercase' }}>Profit</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--green)' }}>{fmt(profit)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--t2)', textTransform: 'uppercase' }}>Margin</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{margin.toFixed(0)}%</div>
          </div>
        </div>

        <div className="ma">
          {item && (
            <button type="button" className="btn" style={{ color: 'var(--red)' }} onClick={handleDelete}>
              Delete
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-p" disabled={saving}>
            {saving ? 'Saving…' : 'Save item'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
