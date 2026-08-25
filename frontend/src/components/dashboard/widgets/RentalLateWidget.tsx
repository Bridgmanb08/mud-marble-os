import { useNavigate } from 'react-router-dom';
import { IconAlertTriangle } from '@tabler/icons-react';
import { fmt } from '../../../lib/format';
import { AnimatedBar, useCountUp } from '../../rentals/RentalVisuals';
import { useRentRoll } from '../../../rentals/useRentRoll';
import { Skeleton } from '../../ui/Skeleton';

// The "kicker" widget -- who's behind on rent, right now, sorted worst
// first, with an animated bar per tenant so the worst offenders visually
// jump out instead of just being a number in a list. Shares the rent-roll
// fetch (via useRentRoll) with the other four rental dashboard widgets
// instead of each independently re-fetching it.
export function RentalLateWidget() {
  const navigate = useNavigate();
  const { rows, error } = useRentRoll();

  const late = (rows ?? []).filter((r) => r.past_due_total > 0).sort((a, b) => b.past_due_total - a.past_due_total);
  const totalLate = late.reduce((sum, r) => sum + r.past_due_total, 0);
  const animatedTotal = useCountUp(totalLate);
  const maxLate = Math.max(...late.map((r) => r.past_due_total), 1);

  if (error) return <div style={{ fontSize: 13, color: 'var(--t2)' }}>Late rent data unavailable.</div>;
  if (!rows) return <Skeleton height={90} />;

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
        <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--red)' }}>{fmt(animatedTotal)}</div>
        <div style={{ fontSize: 12, color: 'var(--t2)' }}>
          past due across {late.length} unit{late.length === 1 ? '' : 's'}
        </div>
      </div>
      {late.slice(0, 5).map((r, i) => {
        // One hue (red), varying intensity to encode relative severity --
        // how far past due this tenant is relative to their own rent --
        // rather than a second categorical color that would need its own
        // legend.
        const severity = Math.max(0.5, Math.min(1, r.past_due_total / (r.monthly_rent || r.past_due_total)));
        return (
          <div key={r.unit_id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
              <span>
                {r.tenant_name || 'Unknown'} — {r.property_address}
              </span>
              <span style={{ color: 'var(--red)', fontWeight: 500 }}>{fmt(r.past_due_total)}</span>
            </div>
            <div style={{ opacity: severity }}>
              <AnimatedBar pct={(r.past_due_total / maxLate) * 100} color="var(--red)" delayMs={i * 70} />
            </div>
          </div>
        );
      })}
      <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => navigate('/rentals')}>
        View rent roll
      </button>
    </div>
  );
}
