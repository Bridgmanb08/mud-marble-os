import { useMemo } from 'react';
import type { Task } from '../../types';

const STATUS_COLOR: Record<string, string> = {
  upcoming: 'var(--border-md)',
  in_progress: 'var(--amber)',
  delayed: 'var(--red)',
  blocked: 'var(--red)',
  complete: 'var(--green)',
};

const DAY_MS = 86400000;

export function TimelineView({ tasks, onTaskClick }: { tasks: Task[]; onTaskClick: (id: string) => void }) {
  const dated = useMemo(() => tasks.filter((t) => t.scheduled_start || t.scheduled_end), [tasks]);

  const { rangeStart, rangeDays } = useMemo(() => {
    if (dated.length === 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return { rangeStart: today, rangeDays: 30 };
    }
    let min = Infinity;
    let max = -Infinity;
    for (const t of dated) {
      const s = t.scheduled_start ? new Date(t.scheduled_start).getTime() : undefined;
      const e = t.scheduled_end ? new Date(t.scheduled_end).getTime() : undefined;
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
    return (
      <div className="empty">
        <div className="empty-t">No dated tasks</div>
        <div className="empty-s">Tasks need a start or due date to appear on the timeline.</div>
      </div>
    );
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
    <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
      <div style={{ minWidth: 220 + rangeDays * dayWidth }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          <div style={{ width: 220, flexShrink: 0, padding: '8px 12px', fontSize: 11, fontWeight: 600, color: 'var(--t2)', textTransform: 'uppercase' }}>
            Task
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
        {dated.map((t) => {
          const start = t.scheduled_start ? new Date(t.scheduled_start) : new Date(t.scheduled_end!);
          const end = t.scheduled_end ? new Date(t.scheduled_end) : new Date(t.scheduled_start!);
          const startOffset = Math.floor((start.getTime() - rangeStart.getTime()) / DAY_MS);
          const spanDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1);
          return (
            <div key={t.id} style={{ display: 'flex', borderBottom: '1px solid var(--border)', position: 'relative' }}>
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
                onClick={() => onTaskClick(t.id)}
              >
                {t.title}
              </button>
              <div style={{ position: 'relative', width: rangeDays * dayWidth, flexShrink: 0 }}>
                {todayOffset >= 0 && todayOffset < rangeDays && (
                  <div style={{ position: 'absolute', left: todayOffset * dayWidth, top: 0, bottom: 0, width: 1, background: 'var(--accent)' }} />
                )}
                <button
                  type="button"
                  className="btn-reset"
                  onClick={() => onTaskClick(t.id)}
                  style={{
                    position: 'absolute',
                    left: startOffset * dayWidth + 4,
                    top: 8,
                    width: spanDays * dayWidth - 8,
                    height: 20,
                    borderRadius: 4,
                    background: STATUS_COLOR[t.status] || 'var(--border-md)',
                    cursor: 'pointer',
                    opacity: t.status === 'complete' ? 0.6 : 1,
                  }}
                  title={t.title}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
