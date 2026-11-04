import { IconCheck } from '@tabler/icons-react';
import { RowMenu } from '../ui/RowMenu';
import type { Foreman } from '../../types';

// The project page's "..." menu: pick who runs the job. Just the foremen in
// the list (Alex, Manuel) plus a way to clear it -- saved as soon as you pick.
export function ForemanMenu({
  foremen,
  value,
  onChange,
}: {
  foremen: Foreman[];
  value: string | null;
  onChange: (foremanId: string | null) => void;
}) {
  const item = { width: '100%', justifyContent: 'flex-start' } as const;
  return (
    <RowMenu minWidth={170}>
      {(close) => (
        <>
          <div style={{ fontSize: 11, color: 'var(--t3)', padding: '4px 10px' }}>Foreman</div>
          {foremen.map((f) => (
            <button
              key={f.id}
              type="button"
              className="btn btn-ghost btn-sm"
              style={item}
              onClick={() => {
                close();
                if (f.id !== value) onChange(f.id);
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: f.color, display: 'inline-block' }} />
              {f.name}
              {f.id === value && <IconCheck size={14} style={{ marginLeft: 'auto' }} />}
            </button>
          ))}
          {value && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ ...item, color: 'var(--t3)' }}
              onClick={() => {
                close();
                onChange(null);
              }}
            >
              No foreman
            </button>
          )}
        </>
      )}
    </RowMenu>
  );
}
