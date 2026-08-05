import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconHome2 } from '@tabler/icons-react';
import { api } from '../../../api/client';
import type { RentRollRow } from '../../../types';

// Occupied vs vacant units, portfolio-wide, with a quick vacant-unit list so
// a vacancy doesn't quietly sit unnoticed. Self-fetches off the shared
// rent-roll endpoint.
export function RentalOccupancyWidget() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<RentRollRow[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .get<RentRollRow[]>('/rentals/rent-roll')
      .then(setRows)
      .catch(() => setError(true));
  }, []);

  if (error) return <div style={{ fontSize: 13, color: 'var(--t2)' }}>Occupancy data unavailable.</div>;
  if (!rows) return <div style={{ fontSize: 13, color: 'var(--t2)' }}>Loading…</div>;
  if (rows.length === 0) return <div style={{ fontSize: 13, color: 'var(--t2)' }}>No units yet.</div>;

  const occupied = rows.filter((r) => r.lease_id).length;
  const vacant = rows.filter((r) => !r.lease_id);
  const rate = Math.round((occupied / rows.length) * 100);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <IconHome2 size={18} color="var(--brand-brown)" />
        <div style={{ fontSize: 22, fontWeight: 600 }}>{rate}%</div>
        <div style={{ fontSize: 12, color: 'var(--t2)' }}>
          occupied — {occupied}/{rows.length} units
        </div>
      </div>
      {vacant.length > 0 ? (
        <>
          <div style={{ fontSize: 11.5, color: 'var(--amber)', fontWeight: 500, marginBottom: 4 }}>Vacant:</div>
          {vacant.slice(0, 4).map((r) => (
            <div key={r.unit_id} style={{ fontSize: 12.5, padding: '3px 0', borderBottom: '1px solid var(--border)' }}>
              {r.property_address} — {r.unit_label}
            </div>
          ))}
        </>
      ) : (
        <div style={{ fontSize: 12.5, color: 'var(--green)' }}>Fully occupied</div>
      )}
      <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => navigate('/rentals')}>
        View properties
      </button>
    </div>
  );
}
