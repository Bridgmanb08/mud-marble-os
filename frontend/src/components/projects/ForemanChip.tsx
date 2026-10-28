import type { Foreman } from '../../types';

// A foreman's name next to a dot in their color -- the same color the CFO
// spreadsheet uses for them.
export function ForemanChip({ foreman, size = 12 }: { foreman: Foreman | undefined | null; size?: number }) {
  if (!foreman) return null;
  return (
    <span
      title={`Foreman: ${foreman.name}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: size,
        color: 'var(--t2)',
        padding: '1px 8px 1px 6px',
        borderRadius: 10,
        background: `${foreman.color}22`,
        border: `1px solid ${foreman.color}66`,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: foreman.color, display: 'inline-block' }} />
      {foreman.name}
    </span>
  );
}
