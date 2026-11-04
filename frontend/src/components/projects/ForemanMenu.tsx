import { IconCheck } from '@tabler/icons-react';
import { RowMenu } from '../ui/RowMenu';
import type { Foreman } from '../../types';

// The project page's "..." menu: pick who runs the job. Just the foremen in
// the list (Alex, Manuel) plus a way to clear it -- saved as soon as you pick.
// The foreman choices themselves (Alex, Manuel, No foreman), shared by the
// project page's menu and each row's menu on the Projects list.
export function ForemanOptions({
  foremen,
  value,
  onChange,
  close,
}: {
  foremen: Foreman[];
  value: string | null;
  onChange: (foremanId: string | null) => void;
  close: () => void;
}) {
  const item = { width: '100%', justifyContent: 'flex-start' } as const;
  return (
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
  );
}

export function ForemanMenu({
  foremen,
  value,
  onChange,
}: {
  foremen: Foreman[];
  value: string | null;
  onChange: (foremanId: string | null) => void;
}) {
  return (
    <RowMenu minWidth={170}>
      {(close) => <ForemanOptions foremen={foremen} value={value} onChange={onChange} close={close} />}
    </RowMenu>
  );
}
