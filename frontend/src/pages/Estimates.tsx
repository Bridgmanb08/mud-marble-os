import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconFileDollar } from '@tabler/icons-react';
import { api } from '../api/client';
import { useToast } from '../components/ui/Toast';
import { fmt } from '../lib/format';
import type { Estimate } from '../types';

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray',
  sent_to_client: 'bg-blue',
  approved: 'bg-green',
  rejected: 'bg-red',
};

// Same pipeline order and status set as Projects.tsx's own STATUS_OPTIONS --
// groups estimates by where their project actually is (active, pre
// construction, closed, etc.), not by the estimate's own draft/sent/
// approved status, which is a different axis shown per-row below.
const PROJECT_STATUS_ORDER = [
  'lead',
  'vetting',
  'estimating',
  'proposed',
  'pre_construction',
  'active',
  'punch_list',
  'warranty',
  'on_hold',
  'closed',
  'lost',
];
const PROJECT_STATUS_LABEL: Record<string, string> = {
  lead: 'Lead',
  vetting: 'Vetting',
  estimating: 'Estimating',
  proposed: 'Proposed',
  pre_construction: 'Pre Construction',
  active: 'Active',
  punch_list: 'Punch List',
  warranty: 'Warranty',
  on_hold: 'On Hold',
  closed: 'Closed',
  lost: 'Lost',
};

function projectStatusLabel(status: string): string {
  return PROJECT_STATUS_LABEL[status] || status.replace(/_/g, ' ');
}

export default function Estimates() {
  const [estimates, setEstimates] = useState<Estimate[] | null>(null);
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    api
      .get<Estimate[]>('/estimates')
      .then(setEstimates)
      .catch((e) => toast(e instanceof Error ? e.message : 'Failed to load estimates', true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const draft = estimates?.filter((e) => e.status === 'draft').length ?? 0;
  const sent = estimates?.filter((e) => e.status === 'sent_to_client').length ?? 0;
  const approved = estimates?.filter((e) => e.status === 'approved') ?? [];
  const approvedValue = approved.reduce((s, e) => s + (e.grand_total_owner_price || 0), 0);

  // Grouped by the linked project's status -- a project without a status on
  // record (shouldn't normally happen, but real data is real data) falls
  // into its own "Uncategorized" bucket rather than silently vanishing from
  // the page.
  const groups = useMemo(() => {
    const map = new Map<string, Estimate[]>();
    for (const e of estimates ?? []) {
      const status = e.projects?.status || 'uncategorized';
      if (!map.has(status)) map.set(status, []);
      map.get(status)!.push(e);
    }
    const known = PROJECT_STATUS_ORDER.filter((s) => map.has(s));
    const rest = [...map.keys()].filter((s) => !PROJECT_STATUS_ORDER.includes(s)).sort();
    return [...known, ...rest].map((status) => ({ status, items: map.get(status)! }));
  }, [estimates]);

  return (
    <>
      <div className="ph">
        <div>
          <h1>Estimates</h1>
          <p>All estimates across all projects, grouped by project status</p>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 16 }}>
        <button className="tab on">All Estimates</button>
        <button className="tab" onClick={() => navigate('/estimates/templates')}>
          Templates
        </button>
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
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((e) => (
                      <tr key={e.id} onClick={() => navigate(`/estimates/${e.id}`)} style={{ cursor: 'pointer' }}>
                        <td className="sticky-col" style={{ fontWeight: 500 }}>{e.title || e.projects?.name || '—'}</td>
                        <td>v{e.version}</td>
                        <td>{fmt(e.pm_fee_total)}</td>
                        <td>{fmt(e.construction_total_owner_price)}</td>
                        <td>{fmt(e.allowance_total)}</td>
                        <td style={{ fontWeight: 600 }}>{fmt(e.grand_total_owner_price)}</td>
                        <td>
                          <span className={`badge ${STATUS_BADGE[e.status] || 'bg-gray'}`}>{e.status.replace(/_/g, ' ')}</span>
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
