import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconMapPin } from '@tabler/icons-react';
import { api } from '../../../api/client';
import type { RentRollRow } from '../../../types';

// Properties that haven't been visited in a while (or ever), most-stale
// first -- prompts Megan/Faith on who to visit next. Self-fetches off the
// shared rent-roll endpoint; dedupes by property since rent-roll is one row
// per unit but visits are logged per property.
export function RentalVisitsWidget() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<RentRollRow[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .get<RentRollRow[]>('/rentals/rent-roll')
      .then(setRows)
      .catch(() => setError(true));
  }, []);

  if (error) return <div style={{ fontSize: 13, color: 'var(--t2)' }}>Visit data unavailable.</div>;
  if (!rows) return <div style={{ fontSize: 13, color: 'var(--t2)' }}>Loading…</div>;
  if (rows.length === 0) return <div style={{ fontSize: 13, color: 'var(--t2)' }}>No properties yet.</div>;

  const byProperty = new Map<string, RentRollRow>();
  for (const r of rows) {
    if (!byProperty.has(r.property_id)) byProperty.set(r.property_id, r);
  }
  const properties = [...byProperty.values()].sort((a, b) => {
    if (a.days_since_visit === null && b.days_since_visit === null) return 0;
    if (a.days_since_visit === null) return -1;
    if (b.days_since_visit === null) return 1;
    return b.days_since_visit - a.days_since_visit;
  });

  const stale = properties.filter((r) => r.days_since_visit === null || r.days_since_visit > 30);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
        <IconMapPin size={18} color={stale.length > 0 ? 'var(--amber)' : 'var(--green)'} />
        <div style={{ fontSize: 22, fontWeight: 600 }}>{stale.length}</div>
        <div style={{ fontSize: 12, color: 'var(--t2)' }}>propert{stale.length === 1 ? 'y' : 'ies'} due for a visit</div>
      </div>
      {properties.slice(0, 5).map((r) => (
        <div
          key={r.property_id}
          style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12.5 }}
        >
          <span>{r.property_address}</span>
          <span style={{ color: r.days_since_visit === null || r.days_since_visit > 30 ? 'var(--amber)' : 'var(--t2)' }}>
            {r.days_since_visit === null ? 'Never' : `${r.days_since_visit}d ago`}
          </span>
        </div>
      ))}
      <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => navigate('/rentals')}>
        View properties
      </button>
    </div>
  );
}
