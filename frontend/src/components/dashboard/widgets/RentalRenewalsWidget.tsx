import { useNavigate } from 'react-router-dom';
import { IconCalendarDue } from '@tabler/icons-react';
import { fmtD } from '../../../lib/format';
import { AnimatedBar, useCountUp } from '../../rentals/RentalVisuals';
import { useRentRoll } from '../../../rentals/useRentRoll';
import { Skeleton } from '../../ui/Skeleton';

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
const WINDOW_DAYS = 90;

function urgencyColor(daysLeft: number): string {
  if (daysLeft < 30) return 'var(--red)';
  if (daysLeft < 60) return 'var(--amber)';
  return 'var(--green)';
}

// Leases ending within ~90 days, badged by renewal_status, with an animated
// "runway" bar per lease (how much of the 90-day window is left) so urgency
// reads visually instead of requiring date math. Shares the rent-roll fetch
// (via useRentRoll) with the other four rental dashboard widgets instead of
// each independently re-fetching it.
export function RentalRenewalsWidget() {
  const navigate = useNavigate();
  const { rows, error } = useRentRoll();

  const now = Date.now();
  const soon = (rows ?? [])
    .filter((r) => r.lease_end_date && (new Date(r.lease_end_date).getTime() - now) / 86400000 <= WINDOW_DAYS)
    .sort((a, b) => new Date(a.lease_end_date!).getTime() - new Date(b.lease_end_date!).getTime());
  const animatedCount = useCountUp(soon.length, 600);

  if (error) return <div style={{ fontSize: 13, color: 'var(--t2)' }}>Renewal data unavailable.</div>;
  if (!rows) return <Skeleton height={90} />;

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
        <div style={{ fontSize: 22, fontWeight: 600 }}>{Math.round(animatedCount)}</div>
        <div style={{ fontSize: 12, color: 'var(--t2)' }}>lease{soon.length === 1 ? '' : 's'} ending within 90 days</div>
      </div>
      {soon.slice(0, 5).map((r, i) => {
        const daysLeft = Math.max(0, Math.round((new Date(r.lease_end_date!).getTime() - now) / 86400000));
        const status = r.renewal_status || 'undecided';
        return (
          <div key={r.unit_id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, marginBottom: 4 }}>
              <span>
                {r.property_address} — {fmtD(r.lease_end_date!)}
              </span>
              <span
                className="badge"
                style={{ background: 'transparent', color: STATUS_COLOR[status], border: `1px solid ${STATUS_COLOR[status]}` }}
              >
                {STATUS_LABEL[status]}
              </span>
            </div>
            <AnimatedBar pct={(daysLeft / WINDOW_DAYS) * 100} color={urgencyColor(daysLeft)} delayMs={i * 70} />
          </div>
        );
      })}
      <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => navigate('/rentals')}>
        View rent roll
      </button>
    </div>
  );
}
