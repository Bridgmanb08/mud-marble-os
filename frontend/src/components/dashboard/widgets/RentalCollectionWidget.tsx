import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconReceipt2 } from '@tabler/icons-react';
import { api } from '../../../api/client';
import { fmt } from '../../../lib/format';
import type { RentRollRow } from '../../../types';

// "Rent Collected This Month" -- $ collected vs $ due across every active
// lease, with a progress bar. Self-fetches off the shared rent-roll endpoint,
// same precedent as RentalSnapshotWidget/WeatherWidget.
export function RentalCollectionWidget() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<RentRollRow[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .get<RentRollRow[]>('/rentals/rent-roll')
      .then(setRows)
      .catch(() => setError(true));
  }, []);

  if (error) return <div style={{ fontSize: 13, color: 'var(--t2)' }}>Rent collection data unavailable.</div>;
  if (!rows) return <div style={{ fontSize: 13, color: 'var(--t2)' }}>Loading…</div>;

  const leased = rows.filter((r) => r.lease_id);
  const due = leased.reduce((sum, r) => sum + r.current_month_due, 0);
  const paid = leased.reduce((sum, r) => sum + r.current_month_paid, 0);
  const pct = due > 0 ? Math.min(100, Math.round((paid / due) * 100)) : 0;

  if (leased.length === 0) {
    return <div style={{ fontSize: 13, color: 'var(--t2)' }}>No active leases yet.</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <IconReceipt2 size={18} color="var(--brand-brown)" />
        <div style={{ fontSize: 22, fontWeight: 600 }}>{fmt(paid)}</div>
        <div style={{ fontSize: 12, color: 'var(--t2)' }}>of {fmt(due)} due this month</div>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: 'var(--border)', overflow: 'hidden', marginBottom: 8 }}>
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: pct >= 100 ? 'var(--green)' : pct >= 70 ? 'var(--amber)' : 'var(--red)',
            transition: 'width 0.3s',
          }}
        />
      </div>
      <div style={{ fontSize: 12, color: 'var(--t2)' }}>{pct}% collected across {leased.length} active lease{leased.length === 1 ? '' : 's'}</div>
      <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => navigate('/rentals')}>
        View rent roll
      </button>
    </div>
  );
}
