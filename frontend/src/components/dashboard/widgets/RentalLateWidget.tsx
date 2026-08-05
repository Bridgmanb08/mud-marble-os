import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconAlertTriangle } from '@tabler/icons-react';
import { api } from '../../../api/client';
import { fmt } from '../../../lib/format';
import type { RentRollRow } from '../../../types';

// The "kicker" widget -- who's behind on rent, right now, sorted worst
// first. Self-fetches off the shared rent-roll endpoint (same precedent as
// WeatherWidget/RentalSnapshotWidget), not the construction /dashboard
// aggregate.
export function RentalLateWidget() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<RentRollRow[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .get<RentRollRow[]>('/rentals/rent-roll')
      .then(setRows)
      .catch(() => setError(true));
  }, []);

  if (error) return <div style={{ fontSize: 13, color: 'var(--t2)' }}>Late rent data unavailable.</div>;
  if (!rows) return <div style={{ fontSize: 13, color: 'var(--t2)' }}>Loading…</div>;

  const late = rows.filter((r) => r.past_due_total > 0).sort((a, b) => b.past_due_total - a.past_due_total);
  const totalLate = late.reduce((sum, r) => sum + r.past_due_total, 0);

  if (late.length === 0) {
    return (
      <div>
        <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--green)' }}>All caught up</div>
        <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 2 }}>No tenants are behind on rent right now.</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
        <IconAlertTriangle size={18} color="var(--red)" />
        <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--red)' }}>{fmt(totalLate)}</div>
        <div style={{ fontSize: 12, color: 'var(--t2)' }}>
          past due across {late.length} unit{late.length === 1 ? '' : 's'}
        </div>
      </div>
      {late.slice(0, 5).map((r) => (
        <div
          key={r.unit_id}
          style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12.5 }}
        >
          <span>
            {r.tenant_name || 'Unknown'} — {r.property_address}
          </span>
          <span style={{ color: 'var(--red)', fontWeight: 500 }}>{fmt(r.past_due_total)}</span>
        </div>
      ))}
      <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => navigate('/rentals')}>
        View rent roll
      </button>
    </div>
  );
}
