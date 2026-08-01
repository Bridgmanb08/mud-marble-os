import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DashboardSummary } from '../../../types';

const DAY_MS = 86400000;

export function ProjectTimelineWidget({ data }: { data: DashboardSummary }) {
  const navigate = useNavigate();

  const dated = useMemo(
    () => data.active_projects.filter((p) => p.start_date || p.estimated_completion),
    [data.active_projects],
  );

  const { rangeStart, rangeDays } = useMemo(() => {
    if (dated.length === 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return { rangeStart: today, rangeDays: 30 };
    }
    let min = Infinity;
    let max = -Infinity;
    for (const p of dated) {
      const s = p.start_date ? new Date(p.start_date).getTime() : undefined;
      const e = p.estimated_completion ? new Date(p.estimated_completion).getTime() : undefined;
      const start = s ?? e!;
      const end = e ?? s!;
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
    return <div style={{ fontSize: 13, color: 'var(--t2)' }}>No projects with dates set yet.</div>;
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
          <div
            style={{
              width: 220,
              flexShrink: 0,
              padding: '8px 12px',
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--t2)',
              textTransform: 'uppercase',
            }}
          >
            Project
          </div>
          {months.map((m, i) => (
            <div
              key={i}
              style={{
                width: m.days * dayWidth,
                flexShrink: 0,
                padding: '8px 6px',
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--t2)',
                borderLeft: '1px solid var(--border)',
              }}
            >
              {m.label}
            </div>
          ))}
        </div>
        {dated.map((p) => {
          const start = p.start_date ? new Date(p.start_date) : new Date(p.estimated_completion!);
          const end = p.estimated_completion ? new Date(p.estimated_completion) : new Date(p.start_date!);
          const startOffset = Math.floor((start.getTime() - rangeStart.getTime()) / DAY_MS);
          const spanDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1);
          const elapsedDays = Math.min(spanDays, Math.max(0, todayOffset - startOffset));
          const displayName = p.name.replace(/\|.*/, '').trim();
          return (
            <div
              key={p.id}
              style={{ display: 'flex', borderBottom: '1px solid var(--border)', position: 'relative' }}
            >
              <button
                type="button"
                className="btn-reset"
                style={{
                  width: 220,
                  flexShrink: 0,
                  padding: '10px 12px',
                  fontSize: 13,
                  textAlign: 'left',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                onClick={() => navigate(`/projects/${p.id}`)}
              >
                {displayName}
              </button>
              <div style={{ position: 'relative', width: rangeDays * dayWidth, flexShrink: 0 }}>
                {todayOffset >= 0 && todayOffset < rangeDays && (
                  <div
                    style={{
                      position: 'absolute',
                      left: todayOffset * dayWidth,
                      top: 0,
                      bottom: 0,
                      width: 1,
                      background: 'var(--accent)',
                    }}
                  />
                )}
                <button
                  type="button"
                  className="btn-reset"
                  onClick={() => navigate(`/projects/${p.id}`)}
                  title={displayName}
                  style={{
                    position: 'absolute',
                    left: startOffset * dayWidth + 4,
                    top: 8,
                    width: spanDays * dayWidth - 8,
                    height: 20,
                    borderRadius: 4,
                    cursor: 'pointer',
                    overflow: 'hidden',
                    display: 'flex',
                    background: 'var(--border-md)',
                  }}
                >
                  <div style={{ width: elapsedDays * dayWidth, height: '100%', background: 'var(--accent)' }} />
                  <div
                    style={{
                      flex: 1,
                      height: '100%',
                      background: 'var(--accent)',
                      opacity: 0.35,
                    }}
                  />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
