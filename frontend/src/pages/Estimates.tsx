import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconFileDollar } from '@tabler/icons-react';
import { api, ApiError } from '../api/client';
import { useToast } from '../components/ui/Toast';
import { fmt } from '../lib/format';
import { PROJECT_STATUS_OPTIONS as PROJECT_STATUS_ORDER, projectStatusLabel } from '../lib/projectStatuses';
import { EstimateRowMenu } from '../components/estimates/EstimateRowMenu';
import type { Estimate } from '../types';

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray',
  sent_to_client: 'bg-blue',
  approved: 'bg-green',
  rejected: 'bg-red',
};

export default function Estimates() {
  const [estimates, setEstimates] = useState<Estimate[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  function load() {
    api
      .get<Estimate[]>('/estimates')
      .then(setEstimates)
      .catch((e) => toast(e instanceof Error ? e.message : 'Failed to load estimates', true));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function setArchived(id: string, archived: boolean) {
    // Optimistic -- flip it locally first so the row moves/disappears
    // immediately, then reconcile with the server; roll back on failure.
    setEstimates((prev) => (prev ? prev.map((e) => (e.id === id ? { ...e, is_archived: archived } : e)) : prev));
    try {
      await api.patch(`/estimates/${id}`, { is_archived: archived });
      toast(archived ? 'Archived' : 'Unarchived');
    } catch (e) {
      setEstimates((prev) => (prev ? prev.map((es) => (es.id === id ? { ...es, is_archived: !archived } : es)) : prev));
      toast(e instanceof ApiError ? e.message : 'Failed to update', true);
    }
  }

  async function deleteEstimate(e: Estimate) {
    const label = `${e.projects?.name || e.title || 'this estimate'} v${e.version}`;
    const extra =
      e.status === 'approved' || e.status === 'sent_to_client'
        ? ` This version is marked "${e.status.replace(/_/g, ' ')}" -- deleting it removes that record entirely.`
        : '';
    if (!window.confirm(`Permanently delete ${label}? This can't be undone.${extra}`)) return;
    try {
      await api.delete(`/estimates/${e.id}`);
      setEstimates((prev) => (prev ? prev.filter((es) => es.id !== e.id) : prev));
      toast('Estimate deleted');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to delete estimate', true);
    }
  }

  const visible = useMemo(() => (estimates ?? []).filter((e) => showArchived || !e.is_archived), [estimates, showArchived]);
  const archivedCount = useMemo(() => (estimates ?? []).filter((e) => e.is_archived).length, [estimates]);

  const draft = visible.filter((e) => e.status === 'draft').length;
  const sent = visible.filter((e) => e.status === 'sent_to_client').length;
  const approved = visible.filter((e) => e.status === 'approved');
  const approvedValue = approved.reduce((s, e) => s + (e.grand_total_owner_price || 0), 0);

  // Grouped by the linked project's status -- a project without a status on
  // record (shouldn't normally happen, but real data is real data) falls
  // into its own "Uncategorized" bucket rather than silently vanishing from
  // the page.
  const groups = useMemo(() => {
    const map = new Map<string, Estimate[]>();
    for (const e of visible) {
      const status = e.projects?.status || 'uncategorized';
      if (!map.has(status)) map.set(status, []);
      map.get(status)!.push(e);
    }
    const known = PROJECT_STATUS_ORDER.filter((s) => map.has(s));
    const rest = [...map.keys()].filter((s) => !(PROJECT_STATUS_ORDER as readonly string[]).includes(s)).sort();
    return [...known, ...rest].map((status) => ({ status, items: map.get(status)! }));
  }, [visible]);

  return (
    <>
      <div className="ph">
        <div>
          <h1>Estimates</h1>
          <p>All estimates across all projects, grouped by project status</p>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 16, justifyContent: 'space-between', display: 'flex' }}>
        <div style={{ display: 'flex' }}>
          <button className="tab on">All Estimates</button>
          <button className="tab" onClick={() => navigate('/estimates/templates')}>
            Templates
          </button>
        </div>
        {archivedCount > 0 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--t2)', cursor: 'pointer', paddingRight: 4 }}>
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Show archived ({archivedCount})
          </label>
        )}
      </div>

      <div className="metrics">
        <div className="metric">
          <div className="m-label">Draft</div>
          <div className="m-val">{draft}</div>
        </div>
        <div className="metric">
          <div className="m-label">Sent to client</div>
          <div className="m-val">{sent}</div>
        </div>
        <div className="metric">
          <div className="m-label">Approved</div>
          <div className="m-val">{approved.length}</div>
        </div>
        <div className="metric">
          <div className="m-label">Approved value</div>
          <div className="m-val" style={{ fontSize: 17 }}>
            {fmt(approvedValue)}
          </div>
        </div>
      </div>

      {estimates === null ? (
        <div className="card">
          <div className="empty">
            <div className="empty-t">Loading…</div>
          </div>
        </div>
      ) : estimates.length === 0 ? (
        <div className="card">
          <div className="empty" style={{ padding: 40 }}>
            <IconFileDollar size={32} color="var(--t3)" style={{ display: 'block', margin: '0 auto 12px' }} />
            <div className="empty-t">No estimates yet</div>
            <div className="empty-s">Open a project and start an estimate from the Estimate tab.</div>
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div className="card">
          <div className="empty" style={{ padding: 40 }}>
            <div className="empty-t">Everything's archived</div>
            <div className="empty-s">Check "Show archived" above to see it again.</div>
          </div>
        </div>
      ) : (
        groups.map(({ status, items }) => (
          <div key={status} style={{ marginBottom: 20 }}>
            <div className="sh">
              <div className="st">
                {status === 'uncategorized' ? 'Uncategorized' : projectStatusLabel(status)} ({items.length})
              </div>
            </div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="tbl-scroll">
                <table className="tbl tbl-zebra">
                  <thead>
                    <tr>
                      <th className="sticky-col">Project</th>
                      <th>Version</th>
                      <th>PM fee</th>
                      <th>Construction</th>
                      <th>Allowances</th>
                      <th>Grand total</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((e) => (
                      <tr
                        key={e.id}
                        onClick={() => navigate(`/estimates/${e.id}`)}
                        style={{ cursor: 'pointer', opacity: e.is_archived ? 0.55 : 1 }}
                      >
                        <td className="sticky-col" style={{ fontWeight: 500 }}>{e.title || e.projects?.name || '—'}</td>
                        <td>v{e.version}</td>
                        <td>{fmt(e.pm_fee_total)}</td>
                        <td>{fmt(e.construction_total_owner_price)}</td>
                        <td>{fmt(e.allowance_total)}</td>
                        <td style={{ fontWeight: 600 }}>{fmt(e.grand_total_owner_price)}</td>
                        <td>
                          <span className={`badge ${STATUS_BADGE[e.status] || 'bg-gray'}`}>{e.status.replace(/_/g, ' ')}</span>
                          {e.is_archived && (
                            <span className="badge bg-gray" style={{ marginLeft: 6 }}>
                              archived
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <EstimateRowMenu
                            isArchived={!!e.is_archived}
                            onArchive={() => setArchived(e.id, true)}
                            onUnarchive={() => setArchived(e.id, false)}
                            onDelete={() => deleteEstimate(e)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ))
      )}
    </>
  );
}
