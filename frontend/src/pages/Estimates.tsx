import { useEffect, useState } from 'react';
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

export default function Estimates() {
  const [estimates, setEstimates] = useState<Estimate[] | null>(null);
  const toast = useToast();

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

  return (
    <>
      <div className="ph">
        <div>
          <h1>Estimates</h1>
          <p>All estimates across all projects</p>
        </div>
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

      <div className="card">
        {estimates === null ? (
          <div className="empty">
            <div className="empty-t">Loading…</div>
          </div>
        ) : estimates.length === 0 ? (
          <div className="empty" style={{ padding: 40 }}>
            <IconFileDollar size={32} color="var(--t3)" style={{ display: 'block', margin: '0 auto 12px' }} />
            <div className="empty-t">No estimates yet</div>
            <div className="empty-s">Open a project and start an estimate from the Estimate tab.</div>
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Project</th>
                <th>Version</th>
                <th>PM fee</th>
                <th>Construction</th>
                <th>Allowances</th>
                <th>Grand total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {estimates.map((e) => (
                <tr key={e.id}>
                  <td style={{ fontWeight: 500 }}>{e.projects?.name || '—'}</td>
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
        )}
      </div>
    </>
  );
}
