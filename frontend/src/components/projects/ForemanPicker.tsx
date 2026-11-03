import type { Foreman } from '../../types';

const MANAGE = '__manage__';

// Always-visible foreman selector for a job: a dot in the foreman's color next
// to a dropdown, saved as soon as it changes. "Manage foremen…" opens the
// add/color editor so Alex, Manuel, etc. can be created from right here.
export function ForemanPicker({
  foremen,
  value,
  onChange,
  onManage,
}: {
  foremen: Foreman[];
  value: string | null;
  onChange: (foremanId: string | null) => void;
  onManage: () => void;
}) {
  const current = foremen.find((f) => f.id === value);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--t3)' }}>
      Foreman
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: '1px 4px 1px 8px',
          borderRadius: 10,
          background: current ? `${current.color}22` : 'transparent',
          border: `1px solid ${current ? `${current.color}66` : 'var(--border)'}`,
        }}
      >
        <span
          style={{ width: 8, height: 8, borderRadius: '50%', background: current ? current.color : 'var(--border)', display: 'inline-block' }}
        />
        <select
          value={value || ''}
          onChange={(e) => {
            if (e.target.value === MANAGE) return onManage();
            onChange(e.target.value || null);
          }}
          style={{ border: 'none', background: 'transparent', fontSize: 12, color: 'var(--t2)', cursor: 'pointer', outline: 'none' }}
        >
          <option value="">— Assign —</option>
          {foremen.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
          <option value={MANAGE}>Manage foremen…</option>
        </select>
      </span>
    </span>
  );
}
