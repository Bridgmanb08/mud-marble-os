import { useEffect, useState } from 'react';
import { IconDownload } from '@tabler/icons-react';
import { api, ApiError } from '../../api/client';
import { useToast } from '../ui/Toast';
import { fmt } from '../../lib/format';
import { pdfExportFilename, triggerDownload } from '../../lib/download';
import type { ChangeOrder } from '../../types';

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
  const [title, setTitle] = useState('');
  const [coType, setCoType] = useState('client_addition');
  const [discoveredBy, setDiscoveredBy] = useState('');
  const [ownerPrice, setOwnerPrice] = useState('');
  const [builderCost, setBuilderCost] = useState('');
  const [description, setDescription] = useState('');
  const [notesInternal, setNotesInternal] = useState('');

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

  useEffect(() => {
    load();
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
          <h1>{coNumber}</h1>
          <p>{co.projects?.name || ''}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            className="btn btn-sm"
            onClick={() => triggerDownload(`/api/change-orders/${coId}/export/pdf`, pdfExportFilename(co.projects?.address, co.projects?.name, 'CO'))}
          >
            <IconDownload size={14} /> PDF
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
        <div className="ibt" style={{ fontSize: 13, textTransform: 'none', letterSpacing: 0, border: 'none', padding: 0, marginBottom: 14 }}>
          Financials
        </div>
        <div className="fr">
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
        </div>
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
    </>
  );
}
