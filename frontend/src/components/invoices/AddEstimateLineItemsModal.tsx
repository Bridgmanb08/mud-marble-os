import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { fmt } from '../../lib/format';
import { AnimatedBar } from '../rentals/RentalVisuals';
import type { EstimateItemForInvoice } from '../../types';

interface AddEstimateLineItemsModalProps {
  invoiceId: string;
  projectId: string;
  onClose: () => void;
  onAdded: () => void;
}

interface RowState {
  checked: boolean;
  pct: string;
  amount: string;
}

// BuilderTrend's "Add from Estimates" picker: check the line items to bill,
// dial in a percentage or a dollar amount per row (they stay in sync both
// ways), see how much of each has already been invoiced (across every
// invoice for this project, not just the one being built), and commit
// everything checked in one request. The over-invoicing guard lives here at
// the input layer (clamped to what's left) as well as on the server (the
// invoiced/remaining numbers themselves are always computed live).
export function AddEstimateLineItemsModal({ invoiceId, projectId, onClose, onAdded }: AddEstimateLineItemsModalProps) {
  const toast = useToast();
  const [items, setItems] = useState<EstimateItemForInvoice[] | null>(null);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [includeDescriptions, setIncludeDescriptions] = useState(true);
  const [adjustPct, setAdjustPct] = useState('100');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get<EstimateItemForInvoice[]>(`/projects/${projectId}/estimate-items-for-invoice`)
      .then((data) => {
        setItems(data);
        setRows(Object.fromEntries(data.map((i) => [i.id, { checked: false, pct: '0', amount: '0.00' }])));
      })
      .catch(() => toast('Failed to load estimate line items', true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  function itemById(id: string) {
    return items?.find((i) => i.id === id);
  }

  function setPct(id: string, rawPct: number) {
    const item = itemById(id);
    if (!item) return;
    // Cap at what's actually left to invoice -- the input-layer half of the
    // "don't overcharge this line item" guarantee (the server-computed
    // remaining_amount is the other, authoritative half).
    const maxPct = item.owner_price > 0 ? Math.max(0, (item.remaining_amount / item.owner_price) * 100) : 0;
    const clamped = Math.min(Math.max(rawPct, 0), maxPct);
    if (rawPct > maxPct + 0.01) {
      toast(`Capped at ${maxPct.toFixed(1)}% — that's all that's left to invoice on "${item.title}".`);
    }
    const amount = round2((clamped / 100) * item.owner_price);
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], pct: String(round2(clamped)), amount: amount.toFixed(2) } }));
  }

  function setAmount(id: string, rawAmount: number) {
    const item = itemById(id);
    if (!item) return;
    const clamped = Math.min(Math.max(rawAmount, 0), item.remaining_amount);
    if (rawAmount > item.remaining_amount + 0.01) {
      toast(`Capped at ${fmt(item.remaining_amount)} — that's all that's left to invoice on "${item.title}".`);
    }
    const pct = item.owner_price > 0 ? round2((clamped / item.owner_price) * 100) : 0;
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], pct: String(pct), amount: clamped.toFixed(2) } }));
  }

  function toggleChecked(id: string) {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], checked: !prev[id].checked } }));
  }

  function applyAll() {
    const pct = parseFloat(adjustPct) || 0;
    if (!items) return;
    for (const item of items) {
      if (rows[item.id]?.checked) setPct(item.id, pct);
    }
  }

  const subtotal = useMemo(() => {
    if (!items) return 0;
    return items.reduce((sum, item) => sum + (rows[item.id]?.checked ? parseFloat(rows[item.id].amount) || 0 : 0), 0);
  }, [items, rows]);

  async function handleCommit() {
    if (!items) return;
    const toAdd = items
      .filter((i) => rows[i.id]?.checked && (parseFloat(rows[i.id].amount) || 0) > 0)
      .map((i, idx) => ({
        source_line_item_id: i.id,
        cost_code_id: i.cost_code_id,
        title: i.title,
        description: includeDescriptions ? i.notes_external : null,
        pct_of_line_item: parseFloat(rows[i.id].pct) || 0,
        amount: parseFloat(rows[i.id].amount) || 0,
        sort_order: idx,
      }));
    if (toAdd.length === 0) {
      toast('Check at least one line item with an amount greater than $0.', true);
      return;
    }
    setSaving(true);
    try {
      await api.post(`/invoices/${invoiceId}/items/bulk`, { items: toAdd });
      onAdded();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to add line items', true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Add line items to invoice" onClose={onClose} xl>
      <div className="ibt" style={{ fontSize: 13, textTransform: 'none', letterSpacing: 0, border: 'none', padding: 0, marginBottom: 6 }}>
        Estimate line items
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--t2)', marginTop: 0, marginBottom: 12 }}>
        Select any line items to add to the invoice and indicate the percentage or amount to invoice.
      </p>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
          <input type="checkbox" checked={includeDescriptions} onChange={(e) => setIncludeDescriptions(e.target.checked)} />
          Include line item descriptions &amp; notes
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label className="fl" style={{ margin: 0 }}>
            Adjust invoice %
          </label>
          <input
            className="fi"
            style={{ width: 80 }}
            type="number"
            value={adjustPct}
            onChange={(e) => setAdjustPct(e.target.value)}
          />
          <button type="button" className="btn btn-sm" onClick={applyAll}>
            Apply all
          </button>
        </div>
      </div>

      {items === null ? (
        <div className="empty">
          <div className="empty-t">Loading…</div>
        </div>
      ) : items.length === 0 ? (
        <div className="empty">
          <div className="empty-t">No estimate line items found for this project.</div>
          <div className="empty-s">Build out an estimate first, then come back to invoice against it.</div>
        </div>
      ) : (
        <div className="tbl-scroll">
          <table className="tbl tbl-zebra">
            <thead>
              <tr>
                <th></th>
                <th>Title</th>
                <th>Cost code</th>
                <th>Cost type</th>
                <th>Client price</th>
                <th style={{ minWidth: 140 }}>Invoice overview</th>
                <th>New invoice %</th>
                <th>New invoice amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const row = rows[item.id] || { checked: false, pct: '0', amount: '0.00' };
                return (
                  <tr key={item.id}>
                    <td>
                      <input type="checkbox" checked={row.checked} onChange={() => toggleChecked(item.id)} />
                    </td>
                    <td>{item.title}</td>
                    <td>{item.cost_codes ? `${item.cost_codes.code} - ${item.cost_codes.name}` : '—'}</td>
                    <td style={{ textTransform: 'capitalize' }}>{item.cost_type === 'none' ? 'None' : item.cost_type}</td>
                    <td>{fmt(item.owner_price)}</td>
                    <td>
                      <AnimatedBar pct={item.invoiced_pct} color="var(--brand-brown)" height={7} />
                      <div style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 3 }}>
                        {item.invoiced_pct}% invoiced · {fmt(item.remaining_amount)} left
                      </div>
                    </td>
                    <td>
                      <input
                        className="fi"
                        style={{ width: 70 }}
                        type="number"
                        value={row.pct}
                        onChange={(e) => setPct(item.id, parseFloat(e.target.value) || 0)}
                      />
                      %
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        $
                        <input
                          className="fi"
                          style={{ width: 90 }}
                          type="number"
                          step="0.01"
                          value={row.amount}
                          onChange={(e) => setAmount(item.id, parseFloat(e.target.value) || 0)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, padding: '14px 0', fontSize: 15 }}>
        <span style={{ color: 'var(--t2)' }}>Invoice subtotal</span>
        <strong>{fmt(subtotal)}</strong>
      </div>

      <div className="ma">
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-p" onClick={handleCommit} disabled={saving || items === null}>
          {saving ? 'Adding…' : 'Add line items to invoice'}
        </button>
      </div>
    </Modal>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
