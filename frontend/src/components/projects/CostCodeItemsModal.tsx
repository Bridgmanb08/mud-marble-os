import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { api } from '../../api/client';
import { fmt } from '../../lib/format';
import type { CostCodeItem } from '../../types';

// A read-only preview of what's actually behind one Budget-vs-actual row --
// the real line item(s) (from the estimate and/or an approved change
// order) that rolled up into that row's aggregated numbers, same detail
// you'd see editing the item on the estimate/change order itself (builder
// cost, markup, internal notes...), just not editable from here. More than
// one item can share a cost code, so this can show several.
export function CostCodeItemsModal({
  projectId,
  costCodeId,
  costCodeLabel,
  onClose,
}: {
  projectId: string;
  costCodeId: string | null;
  costCodeLabel: string;
  onClose: () => void;
}) {
  const [items, setItems] = useState<CostCodeItem[] | null>(null);

  useEffect(() => {
    const query = costCodeId ? `?cost_code_id=${costCodeId}` : '';
    api
      .get<CostCodeItem[]>(`/projects/${projectId}/cost-code-items${query}`)
      .then(setItems)
      .catch(() => setItems([]));
  }, [projectId, costCodeId]);

  return (
    <Modal title={costCodeLabel} onClose={onClose} wide>
      {items === null ? (
        <div className="empty">
          <div className="empty-t">Loading…</div>
        </div>
      ) : items.length === 0 ? (
        <div className="empty">
          <div className="empty-t">No line items found</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {items.map((item) => (
            <div key={item.id} className="card" style={{ padding: 16, background: 'var(--bg)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{item.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 2 }}>
                    {item.quantity}
                    {item.unit ? ` ${item.unit}` : ''} @ {fmt(item.unit_cost)} · {item.cost_type === 'none' ? 'No cost type' : item.cost_type}
                  </div>
                </div>
                <span className="badge bg-gray" style={{ flexShrink: 0 }}>
                  {item.source_label}
                </span>
              </div>

              <div className="fr3" style={{ marginBottom: item.notes_external || item.notes_internal ? 14 : 0 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--t2)', textTransform: 'uppercase' }}>Builder cost</div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{fmt(item.builder_cost)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--t2)', textTransform: 'uppercase' }}>Client price</div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{fmt(item.owner_price)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--t2)', textTransform: 'uppercase' }}>Markup</div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {item.markup_type === 'flat' ? fmt(item.markup_value) : `${item.markup_value}%`}
                  </div>
                </div>
              </div>

              {item.notes_external && (
                <div style={{ marginBottom: item.notes_internal ? 10 : 0 }}>
                  <div style={{ fontSize: 11, color: 'var(--t2)', textTransform: 'uppercase', marginBottom: 3 }}>Description (client-facing)</div>
                  <div style={{ fontSize: 13 }}>{item.notes_external}</div>
                </div>
              )}
              {item.notes_internal && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--t2)', textTransform: 'uppercase', marginBottom: 3 }}>Internal notes</div>
                  <div style={{ fontSize: 13, color: 'var(--t2)' }}>{item.notes_internal}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
