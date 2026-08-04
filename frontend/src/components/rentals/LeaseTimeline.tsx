import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RentalLease } from '../../types';

// Same date-math as ProjectTimelineWidget.tsx (dayWidth=32, range =
// earliest-minus-2-days to max(14, spanDays+5), per-row absolute-positioned
// bars, a vertical "today" line) -- proven pattern, just fed lease dates
// instead of project dates.
const DAY_MS = 86400000;

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / DAY_MS);
}

function barColor(endDate: string): string {
  const d = daysUntil(endDate);
  if (d < 30) return 'var(--red)';
  if (d < 90) return 'var(--amber)';
  return 'var(--green)';
}

export function LeaseTimeline({ leases }: { leases: RentalLease[] }) {
  const navigate = useNavigate();

  const dated = useMemo(() => leases.filter((l) => l.lease_status !== 'ended'), [leases]);

  const { rangeStart, rangeDays } = useMemo(() => {
    if (dated.length === 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return { rangeStart: today, rangeDays: 30 };
    }
    let min = Infinity;
    let max = -Infinity;
    for (const l of dated) {
      const start = new Date(l.start_date).getTime();
      const end = new Date(l.end_date).getTime();
      if (start < min) min = start;
      if (end > max) max = end;
    }
    const start = new Date(min);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 2);
    const days = Math.max(14, Math.ceil((max - min) / DAY_MS) + 5);
    return { rangeStart: start, rangeDays: days };
  }, [dated]);

  const todayOffset = Math.floor((Date.now() - rangeStart.getTime()) / DAY_MS);
  const dayWidth = 32;

  if (dated.length === 0) {
    return <div style={{ fontSize: 13, color: 'var(--t2)' }}>No active or upcoming leases with dates set yet.</div>;
  }

  const months: { label: string; days: number }[] = [];
  for (let i = 0; i < rangeDays; i++) {
    const d = new Date(rangeStart);
    d.setDate(d.getDate() + i);
    const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    if (months.length > 0 && months[months.length - 1].label === label) months[months.length - 1].days++;
    else months.push({ label, days: 1 });
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 220 + rangeDays * dayWidth }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          <div style={{ width: 220, flexShrink: 0, padding: '8px 12px', fontSize: 11, fontWeight: 600, color: 'var(--t2)', textTransform: 'uppercase' }}>
            Tenant · Unit
          </div>
          {months.map((m, i) => (
            <div
              key={i}
              style={{ width: m.days * dayWidth, flexShrink: 0, padding: '8px 6px', fontSize: 11, fontWeight: 600, color: 'var(--t2)', borderLeft: '1px solid var(--border)' }}
            >
              {m.label}
            </div>
          ))}
        </div>
        {dated.map((l) => {
          const start = new Date(l.start_date);
          const end = new Date(l.end_date);
          const startOffset = Math.floor((start.getTime() - rangeStart.getTime()) / DAY_MS);
          const spanDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1);
          const displayName = `${l.tenants?.name || 'Unknown'} · ${l.rental_units?.unit_label || 'Unit'}`;
          const propertyId = l.rental_units?.property_id;
          const color = barColor(l.end_date);
          return (
            <div key={l.id} style={{ display: 'flex', borderBottom: '1px solid var(--border)', position: 'relative' }}>
              <button
                type="button"
                className="btn-reset"
                style={{ width: 220, flexShrink: 0, padding: '10px 12px', fontSize: 13, textAlign: 'left', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                onClick={() => propertyId && navigate(`/rentals/${propertyId}`)}
              >
                {displayName}
              </button>
              <div style={{ position: 'relative', width: rangeDays * dayWidth, flexShrink: 0 }}>
                {todayOffset >= 0 && todayOffset < rangeDays && (
                  <div style={{ position: 'absolute', left: todayOffset * dayWidth, top: 0, bottom: 0, width: 1, background: 'var(--accent)' }} />
                )}
                <button
                  type="button"
                  className="btn-reset"
                  onClick={() => propertyId && navigate(`/rentals/${propertyId}`)}
                  title={`${displayName} — lease ends ${l.end_date}`}
                  style={{
                    position: 'absolute',
                    left: startOffset * dayWidth + 4,
                    top: 8,
                    width: spanDays * dayWidth - 8,
                    height: 20,
                    borderRadius: 4,
                    cursor: 'pointer',
                    background: color,
                    opacity: 0.85,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--t2)', padding: '8px 12px' }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--red)', marginRight: 4, verticalAlign: -1 }} />Expires &lt;30 days</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--amber)', marginRight: 4, verticalAlign: -1 }} />&lt;90 days</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--green)', marginRight: 4, verticalAlign: -1 }} />90+ days</span>
      </div>
    </div>
  );
}
