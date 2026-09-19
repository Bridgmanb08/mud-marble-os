import { useEffect, useState } from 'react';
import { IconDownload, IconPlus } from '@tabler/icons-react';
import { api, ApiError } from '../../api/client';
import { useToast } from '../ui/Toast';
import { EditableTitle } from '../ui/EditableTitle';
import { fmt } from '../../lib/format';
import { pdfExportFilename, triggerDownload } from '../../lib/download';
import { ChangeOrderLineItemModal } from './ChangeOrderLineItemModal';
import type { ChangeOrder, ChangeOrderLineItem } from '../../types';

const STATUS_OPTIONS = ['pending', 'sent', 'approved', 'rejected'];
const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-gray',
  sent: 'bg-amber',
  approved: 'bg-green',
  rejected: 'bg-red',
};

// The full change-order editor -- every other financial document
// (estimates, invoices) has a real edit view; a CO previously only had an
// inline status dropdown on its list card, with no way to fix a typo'd
// title or price, or add internal notes, after creation.
export function ChangeOrderEditor({ coId, onChanged }: { coId: string; onChanged?: (co: ChangeOrder) => void }) {
  const toast = useToast();

  const [co, setCo] = useState<ChangeOrder | null>(null);
  const [items, setItems] = useState<ChangeOrderLineItem[]>([]);
  const [title, setTitle] = useState('');
  const [coType, setCoType] = useState('client_addition');
  const [discoveredBy, setDiscoveredBy] = useState('');
  const [ownerPrice, setOwnerPrice] = useState('');
  const [builderCost, setBuilderCost] = useState('');
  const [description, setDescription] = useState('');
  const [notesInternal, setNotesInternal] = useState('');
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<ChangeOrderLineItem | undefined>(undefined);

  function load() {
    if (!coId) return;
    api
      .get<ChangeOrder>(`/change-orders/${coId}`)
      .then((row) => {
        setCo(row);
        setTitle(row.title);
        setCoType(row.co_type);
        setDiscoveredBy(row.discovered_by || '');
        setOwnerPrice(String(row.owner_price ?? 0));
        setBuilderCost(row.builder_cost !== null ? String(row.builder_cost) : '');
        setDescription(row.description || '');
        setNotesInternal(row.notes_internal || '');
        onChanged?.(row);
      })
      .catch(() => toast('Failed to load change order', true));
  }

  function loadItems() {
    if (!coId) return;
    api.get<ChangeOrderLineItem[]>(`/change-orders/${coId}/items`).catch(() => []).then((rows) => setItems(rows || []));
  }

  useEffect(() => {
    load();
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coId]);

  async function saveField(field: string, value: unknown) {
    if (!coId) return;
    try {
      await api.patch(`/change-orders/${coId}`, { [field]: value });
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to save', true);
    }
  }

  if (!co) {
    return (
      <div className="empty">
        <div className="empty-t">Loading…</div>
      </div>
    );
  }

  const coNumber = `CO-${String(co.co_number ?? '?').padStart(3, '0')}`;

  return (
    <>
      <div className="ph">
        <div>
          <EditableTitle prefix={coNumber} value={co.title} fallback="Untitled change order" onSave={(v) => saveField('title', v)} />
          <p>{co.projects?.name || ''}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            className="btn btn-sm"
            onClick={() => triggerDownload(`/api/change-orders/${coId}/export/pdf`, pdfExportFilename(co.projects?.address, co.projects?.name, 'CO'))}
          >
            <IconDownload size={14} /> PDF
          </button>
          {/* Plain window.open, same as EstimateWorksheet's own Excel button --
              unlike PDF, there's no client-side filename override trick applied
              here; the server's own Content-Disposition filename is used as-is. */}
          <button className="btn btn-sm" onClick={() => window.open(`/api/change-orders/${coId}/export/excel`, '_blank')}>
            <IconDownload size={14} /> Excel
          </button>
          <span className={`badge ${STATUS_BADGE[co.status] || 'bg-gray'}`} style={{ fontSize: 13 }}>
            {co.status}
          </span>
          {co.sop_breach && <span className="badge bg-red">SOP breach</span>}
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div className="ibt" style={{ fontSize: 13, textTransform: 'none', letterSpacing: 0, border: 'none', padding: 0, marginBottom: 14 }}>
          Change order details
        </div>
        <div className="fg">
          <label className="fl">Title</label>
          <input
            className="fi"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={(e) => e.target.value.trim() && saveField('title', e.target.value.trim())}
          />
        </div>
        <div className="fr3">
          <div className="fg">
            <label className="fl">Type</label>
            <select
              className="fi"
              value={coType}
              onChange={(e) => {
                setCoType(e.target.value);
                saveField('co_type', e.target.value);
              }}
            >
              <option value="client_addition">Client addition</option>
              <option value="oversight">Oversight</option>
              <option value="unforeseen">Unforeseen</option>
            </select>
          </div>
          <div className="fg">
            <label className="fl">Status</label>
            <select className="fi" value={co.status} onChange={(e) => saveField('status', e.target.value)}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="fg">
            <label className="fl">Discovered by</label>
            <select
              className="fi"
              value={discoveredBy}
              onChange={(e) => {
                setDiscoveredBy(e.target.value);
                saveField('discovered_by', e.target.value || null);
              }}
            >
              <option value="">—</option>
              <option value="brent">Brent</option>
              <option value="shannon">Shannon</option>
              <option value="client">Client</option>
              <option value="subcontractor">Subcontractor</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div className="ibt" style={{ fontSize: 13, textTransform: 'none', letterSpacing: 0, border: 'none', padding: 0, margin: 0 }}>
            Line items
          </div>
          <button
            className="btn btn-sm"
            onClick={() => {
              setEditingItem(undefined);
              setShowItemModal(true);
            }}
          >
            <IconPlus size={14} /> Add line item
          </button>
        </div>
        {items.length === 0 ? (
          <div className="m-sub">
            No line items yet -- this change order is a flat amount typed in below. Add a line item to break it down by cost code instead, the
            same way estimates work.
          </div>
        ) : (
          <div className="tbl-scroll">
            <table className="tbl tbl-zebra">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Cost code</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                  <th style={{ textAlign: 'right' }}>Unit cost</th>
                  <th style={{ textAlign: 'right' }}>Price</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr
                    key={it.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      setEditingItem(it);
                      setShowItemModal(true);
                    }}
                  >
                    <td style={{ fontWeight: 500 }}>{it.title}</td>
                    <td>{it.cost_codes ? `${it.cost_codes.code} - ${it.cost_codes.name}` : '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      {it.quantity}
                      {it.unit ? ` ${it.unit}` : ''}
                    </td>
                    <td style={{ textAlign: 'right' }}>{fmt(it.unit_cost)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(it.owner_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div className="ibt" style={{ fontSize: 13, textTransform: 'none', letterSpacing: 0, border: 'none', padding: 0, marginBottom: 14 }}>
          Financials
        </div>
        {items.length > 0 ? (
          // Once real line items exist, owner_price/builder_cost are always
          // the sum of those items (recomputed server-side after every
          // add/edit/delete) -- shown read-only here instead of editable
          // inputs a save would just get silently overwritten on, the same
          // way an estimate's grand total isn't a free-typed field either.
          <div className="fr" style={{ marginBottom: 14 }}>
            <div>
              <label className="fl">Builder cost</label>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{fmt(co.builder_cost)}</div>
            </div>
            <div>
              <label className="fl">Owner price</label>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{fmt(co.owner_price)}</div>
            </div>
          </div>
        ) : (
          <div className="fr">
            <div className="fg">
              <label className="fl">Builder cost ($)</label>
              <input
                className="fi"
                type="number"
                value={builderCost}
                onChange={(e) => setBuilderCost(e.target.value)}
                onBlur={(e) => saveField('builder_cost', e.target.value.trim() === '' ? null : parseFloat(e.target.value))}
              />
            </div>
            <div className="fg">
              <label className="fl">Owner price ($)</label>
              <input
                className="fi"
                type="number"
                value={ownerPrice}
                onChange={(e) => setOwnerPrice(e.target.value)}
                onBlur={(e) => saveField('owner_price', parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>
        )}
        <div className="fg">
          <label className="fl">Description</label>
          <textarea
            className="fi"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={(e) => saveField('description', e.target.value.trim() || null)}
          />
        </div>
        <div className="fg">
          <label className="fl">Internal notes</label>
          <textarea
            className="fi"
            value={notesInternal}
            onChange={(e) => setNotesInternal(e.target.value)}
            onBlur={(e) => saveField('notes_internal', e.target.value.trim() || null)}
          />
          <div className="m-sub">For the team only -- not shown to the client, including on the PDF export.</div>
        </div>
      </div>

      <div className="card" style={{ padding: '14px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10, alignItems: 'center' }}>
        <span style={{ color: 'var(--t2)', fontSize: 13 }}>Owner price</span>
        <strong style={{ fontSize: 16 }}>{fmt(co.owner_price)}</strong>
      </div>

      {showItemModal && (
        <ChangeOrderLineItemModal
          coId={coId}
          item={editingItem}
          onClose={() => setShowItemModal(false)}
          onSaved={() => {
            setShowItemModal(false);
            loadItems();
            load();
          }}
          onDeleted={() => {
            setShowItemModal(false);
            toast('Line item removed');
            loadItems();
            load();
          }}
        />
      )}
    </>
  );
}
