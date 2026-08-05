import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconCalendarDue } from '@tabler/icons-react';
import { api } from '../../../api/client';
import { fmtD } from '../../../lib/format';
import type { RentRollRow } from '../../../types';

const STATUS_LABEL: Record<string, string> = {
  undecided: 'Undecided',
  renewing: 'Renewing',
  not_renewing: 'Not renewing',
};
const STATUS_COLOR: Record<string, string> = {
  undecided: 'var(--amber)',
  renewing: 'var(--green)',
  not_renewing: 'var(--red)',
};

// Leases ending within ~90 days, badged by renewal_status so nothing lapses
// unnoticed. Self-fetches off the shared rent-roll endpoint.
export function RentalRenewalsWidget() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<RentRollRow[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .get<RentRollRow[]>('/rentals/rent-roll')
      .then(setRows)
      .catch(() => setError(true));
  }, []);

  if (error) return <div style={{ fontSize: 13, color: 'var(--t2)' }}>Renewal data unavailable.</div>;
  if (!rows) return <div style={{ fontSize: 13, color: 'var(--t2)' }}>Loading…</div>;

  const now = Date.now();
  const soon = rows
    .filter((r) => r.lease_end_date && (new Date(r.lease_end_date).getTime() - now) / 86400000 <= 90)
    .sort((a, b) => new Date(a.lease_end_date!).getTime() - new Date(b.lease_end_date!).getTime());

  if (soon.length === 0) {
    return (
      <div>
        <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--green)' }}>None soon</div>
        <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 2 }}>No leases expiring in the next 90 days.</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
        <IconCalendarDue size={18} color="var(--amber)" />
        <div style={{ fontSize: 22, fontWeight: 600 }}>{soon.length}</div>
        <div style={{ fontSize: 12, color: 'var(--t2)' }}>lease{soon.length === 1 ? '' : 's'} ending within 90 days</div>
      </div>
      {soon.slice(0, 5).map((r) => (
        <div
          key={r.unit_id}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12.5 }}
        >
          <span>
            {r.property_address} — {fmtD(r.lease_end_date!)}
          </span>
          <span className="badge" style={{ background: 'transparent', color: STATUS_COLOR[r.renewal_status || 'undecided'], border: `1px solid ${STATUS_COLOR[r.renewal_status || 'undecided']}` }}>
            {STATUS_LABEL[r.renewal_status || 'undecided']}
          </span>
        </div>
      ))}
      <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => navigate('/rentals')}>
        View rent roll
      </button>
    </div>
  );
}
