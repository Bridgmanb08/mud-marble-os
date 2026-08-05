import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconReceipt2 } from '@tabler/icons-react';
import { api } from '../../../api/client';
import { fmt } from '../../../lib/format';
import { RadialProgress, StatusDot, useCountUp } from '../../rentals/RentalVisuals';
import type { RentRollRow } from '../../../types';

// "Rent Collected This Month" -- an animated radial ring for the headline
// %, plus a row of per-unit "ticker" chips (paid/partial/none) so the whole
// portfolio's collection status reads as one glanceable image, not just a
// number. Self-fetches off the shared rent-roll endpoint, same precedent as
// RentalSnapshotWidget/WeatherWidget.
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

  const leased = (rows ?? []).filter((r) => r.lease_id);
  const due = leased.reduce((sum, r) => sum + r.current_month_due, 0);
  const paid = leased.reduce((sum, r) => sum + r.current_month_paid, 0);
  const pct = due > 0 ? Math.min(100, (paid / due) * 100) : 0;
  const animatedPaid = useCountUp(paid);
  const ringColor = pct >= 100 ? 'var(--green)' : pct >= 70 ? 'var(--amber)' : 'var(--red)';

  if (error) return <div style={{ fontSize: 13, color: 'var(--t2)' }}>Rent collection data unavailable.</div>;
  if (!rows) return <div style={{ fontSize: 13, color: 'var(--t2)' }}>Loading…</div>;
  if (leased.length === 0) return <div style={{ fontSize: 13, color: 'var(--t2)' }}>No active leases yet.</div>;

  const paidCount = leased.filter((r) => r.current_month_paid >= r.current_month_due && r.current_month_due > 0).length;
  const partialCount = leased.filter((r) => r.current_month_paid > 0 && r.current_month_paid < r.current_month_due).length;
  const noneCount = leased.filter((r) => r.current_month_paid <= 0 && r.current_month_due > 0).length;

  function tickerColor(r: RentRollRow): string {
    if (r.current_month_due <= 0) return 'var(--t3)';
    if (r.current_month_paid >= r.current_month_due) return 'var(--green)';
    if (r.current_month_paid > 0) return 'var(--amber)';
    return 'var(--red)';
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
        <RadialProgress pct={pct} color={ringColor}>
          <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.1 }}>{Math.round(pct)}%</div>
          <div style={{ fontSize: 9, color: 'var(--t3)' }}>collected</div>
        </RadialProgress>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <IconReceipt2 size={16} color="var(--brand-brown)" />
            <span style={{ fontSize: 20, fontWeight: 600 }}>{fmt(animatedPaid)}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--t2)' }}>of {fmt(due)} due this month</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
        {leased.map((r, i) => (
          <StatusDot
            key={r.unit_id}
            color={tickerColor(r)}
            delayMs={i * 40}
            title={`${r.property_address} — ${r.tenant_name || 'Unknown'}: ${fmt(r.current_month_paid)} of ${fmt(r.current_month_due)}`}
          />
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--t2)' }}>
        {paidCount} paid in full · {partialCount} partial · {noneCount} not paid
      </div>

      <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => navigate('/rentals')}>
        View rent roll
      </button>
    </div>
  );
}
