import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconHome2 } from '@tabler/icons-react';
import { api } from '../../../api/client';
import type { RentalDashboardSummary } from '../../../types';

// Self-fetches rather than reading off the shared dashboard `data` prop, same
// precedent as WeatherWidget/FathomImportWidget -- this is its own module's
// data, not part of the construction-side /dashboard aggregate.
export function RentalSnapshotWidget() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<RentalDashboardSummary | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .get<RentalDashboardSummary>('/rentals/dashboard-summary')
      .then(setSummary)
      .catch(() => setError(true));
  }, []);

  if (error) return <div style={{ fontSize: 13, color: 'var(--t2)' }}>Rental snapshot unavailable.</div>;
  if (!summary) return <div style={{ fontSize: 13, color: 'var(--t2)' }}>Loading…</div>;

  const onTime = summary.on_time_rate_30;

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 600, color: onTime === null ? 'var(--t3)' : onTime >= 90 ? 'var(--green)' : onTime >= 75 ? 'var(--amber)' : 'var(--red)' }}>
            {onTime === null ? '—' : `${onTime}%`}
          </div>
          <div style={{ fontSize: 11, color: 'var(--t2)' }}>On-time rent (30d)</div>
        </div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 600, color: summary.leases_expiring_60d ? 'var(--amber)' : undefined }}>
            {summary.leases_expiring_60d}
          </div>
          <div style={{ fontSize: 11, color: 'var(--t2)' }}>Leases expiring (60d)</div>
        </div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 600, color: summary.open_work_orders ? 'var(--amber)' : undefined }}>
            {summary.open_work_orders}
          </div>
          <div style={{ fontSize: 11, color: 'var(--t2)' }}>Open work orders</div>
        </div>
      </div>
      <button className="btn btn-sm" onClick={() => navigate('/rentals')}>
        <IconHome2 size={14} /> View rental properties
      </button>
    </div>
  );
}
