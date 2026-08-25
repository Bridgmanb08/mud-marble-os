import { useNavigate } from 'react-router-dom';
import { IconHome2 } from '@tabler/icons-react';
import { RadialProgress, StatusDot, useCountUp } from '../../rentals/RentalVisuals';
import { useRentRoll } from '../../../rentals/useRentRoll';
import { Skeleton } from '../../ui/Skeleton';

// Occupied vs vacant units, portfolio-wide -- an animated ring for the rate
// plus a per-unit ticker strip (green = occupied, gray = vacant) so the
// whole portfolio reads as one image, with a text list of vacant units
// underneath so a vacancy never sits unnoticed. Shares the rent-roll fetch
// (via useRentRoll) with the other four rental dashboard widgets instead of
// each independently re-fetching it.
export function RentalOccupancyWidget() {
  const navigate = useNavigate();
  const { rows, error } = useRentRoll();

  const all = rows ?? [];
  const occupied = all.filter((r) => r.lease_id).length;
  const rate = all.length > 0 ? (occupied / all.length) * 100 : 0;
  const animatedRate = useCountUp(rate);
  const ringColor = rate >= 90 ? 'var(--green)' : rate >= 70 ? 'var(--amber)' : 'var(--red)';

  if (error) return <div style={{ fontSize: 13, color: 'var(--t2)' }}>Occupancy data unavailable.</div>;
  if (!rows) return <Skeleton height={90} />;
  if (all.length === 0) return <div style={{ fontSize: 13, color: 'var(--t2)' }}>No units yet.</div>;

  const vacant = all.filter((r) => !r.lease_id);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
        <RadialProgress pct={rate} color={ringColor}>
          <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.1 }}>{Math.round(animatedRate)}%</div>
          <div style={{ fontSize: 9, color: 'var(--t3)' }}>occupied</div>
        </RadialProgress>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <IconHome2 size={16} color="var(--brand-brown)" />
            <span style={{ fontSize: 20, fontWeight: 600 }}>
              {occupied}/{all.length}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--t2)' }}>units occupied</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
        {all.map((r, i) => (
          <StatusDot
            key={r.unit_id}
            color={r.lease_id ? 'var(--green)' : 'var(--t3)'}
            delayMs={i * 40}
            title={`${r.property_address} — ${r.unit_label}: ${r.lease_id ? r.tenant_name || 'Occupied' : 'Vacant'}`}
          />
        ))}
      </div>

      {vacant.length > 0 ? (
        <>
          <div style={{ fontSize: 11.5, color: 'var(--amber)', fontWeight: 500, marginBottom: 4 }}>Vacant:</div>
          {vacant.slice(0, 4).map((r) => (
            <div key={r.unit_id} style={{ fontSize: 12.5, padding: '3px 0', borderBottom: '1px solid var(--border)' }}>
              {r.property_address} — {r.unit_label}
            </div>
          ))}
        </>
      ) : (
        <div style={{ fontSize: 12.5, color: 'var(--green)' }}>Fully occupied</div>
      )}
      <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => navigate('/rentals')}>
        View properties
      </button>
    </div>
  );
}
