import { useNavigate } from 'react-router-dom';
import { IconMapPin } from '@tabler/icons-react';
import { AnimatedBar, useCountUp } from '../../rentals/RentalVisuals';
import { useRentRoll } from '../../../rentals/useRentRoll';
import { Skeleton } from '../../ui/Skeleton';
import type { RentRollRow } from '../../../types';

const SCALE_DAYS = 60; // a bar fully filled represents 60+ days since the last visit

function stalenessColor(days: number | null): string {
  if (days === null || days > 45) return 'var(--red)';
  if (days > 30) return 'var(--amber)';
  return 'var(--green)';
}

// Properties that haven't been visited in a while (or ever), most-stale
// first, with an animated bar per property (how full = how overdue) so
// staleness reads visually. Shares the rent-roll fetch (via useRentRoll)
// with the other four rental dashboard widgets instead of each
// independently re-fetching it; shows each property's stalest unit since
// rent-roll is one row per unit and visits are logged per unit.
export function RentalVisitsWidget() {
  const navigate = useNavigate();
  const { rows, error } = useRentRoll();

  // Rent roll is one row per unit and visits are per unit too, so a property
  // is represented by its stalest unit (never visited counts as stalest) --
  // it's due for a visit if any one unit is.
  const stalenessOf = (r: RentRollRow) => (r.days_since_visit === null ? Infinity : r.days_since_visit);
  const byProperty = new Map<string, RentRollRow>();
  for (const r of rows ?? []) {
    const existing = byProperty.get(r.property_id);
    if (!existing || stalenessOf(r) > stalenessOf(existing)) byProperty.set(r.property_id, r);
  }
  const multiUnit = new Map<string, number>();
  for (const r of rows ?? []) multiUnit.set(r.property_id, (multiUnit.get(r.property_id) ?? 0) + 1);
  const properties = [...byProperty.values()].sort((a, b) => {
    if (a.days_since_visit === null && b.days_since_visit === null) return 0;
    if (a.days_since_visit === null) return -1;
    if (b.days_since_visit === null) return 1;
    return b.days_since_visit - a.days_since_visit;
  });
  const stale = properties.filter((r) => r.days_since_visit === null || r.days_since_visit > 30);
  const animatedStale = useCountUp(stale.length, 600);

  if (error) return <div style={{ fontSize: 13, color: 'var(--t2)' }}>Visit data unavailable.</div>;
  if (!rows) return <Skeleton height={90} />;
  if (properties.length === 0) return <div style={{ fontSize: 13, color: 'var(--t2)' }}>No properties yet.</div>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
        <IconMapPin size={18} color={stale.length > 0 ? 'var(--amber)' : 'var(--green)'} />
        <div style={{ fontSize: 22, fontWeight: 600 }}>{Math.round(animatedStale)}</div>
        <div style={{ fontSize: 12, color: 'var(--t2)' }}>propert{stale.length === 1 ? 'y' : 'ies'} due for a visit</div>
      </div>
      {properties.slice(0, 5).map((r, i) => {
        const days = r.days_since_visit;
        const pct = days === null ? 100 : Math.min(100, (days / SCALE_DAYS) * 100);
        return (
          <div key={r.property_id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
              <span>
                {r.property_address}
                {(multiUnit.get(r.property_id) ?? 0) > 1 ? ` (${r.unit_label})` : ''}
              </span>
              <span style={{ color: stalenessColor(days) }}>{days === null ? 'Never' : `${days}d ago`}</span>
            </div>
            <AnimatedBar pct={pct} color={stalenessColor(days)} delayMs={i * 70} />
          </div>
        );
      })}
      <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => navigate('/rentals')}>
        View properties
      </button>
    </div>
  );
}
