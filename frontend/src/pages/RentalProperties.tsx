import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { IconPlus, IconHome2 } from '@tabler/icons-react';
import { api } from '../api/client';
import { useToast } from '../components/ui/Toast';
import { NewRentalPropertyModal } from '../components/rentals/NewRentalPropertyModal';
import type { RentalProperty } from '../types';

export default function RentalProperties() {
  const toast = useToast();
  const [properties, setProperties] = useState<RentalProperty[] | null>(null);
  const [showNew, setShowNew] = useState(false);

  function load() {
    api
      .get<RentalProperty[]>('/rental-properties')
      .then(setProperties)
      .catch(() => toast('Failed to load rental properties', true));
  }

  useEffect(load, []);

  const totals = useMemo(() => {
    const units = properties?.flatMap((p) => p.units) ?? [];
    const occupied = units.filter((u) => u.current_lease_id).length;
    return { propertyCount: properties?.length ?? 0, unitCount: units.length, occupied, vacant: units.length - occupied };
  }, [properties]);

  return (
    <>
      <div className="ph">
        <div>
          <h1>Rental Properties</h1>
          <p>Portfolio overview — units, tenants, and rent collection</p>
        </div>
        <button className="btn btn-p btn-sm" onClick={() => setShowNew(true)}>
          <IconPlus size={14} /> New property
        </button>
      </div>

      <div className="metrics">
        <div className="metric">
          <div className="m-label">Properties</div>
          <div className="m-val">{totals.propertyCount}</div>
        </div>
        <div className="metric">
          <div className="m-label">Units</div>
          <div className="m-val">{totals.unitCount}</div>
        </div>
        <div className="metric">
          <div className="m-label">Occupied</div>
          <div className="m-val" style={{ color: 'var(--green)' }}>
            {totals.occupied}
          </div>
        </div>
        <div className="metric">
          <div className="m-label">Vacant</div>
          <div className="m-val" style={{ color: totals.vacant ? 'var(--amber)' : undefined }}>
            {totals.vacant}
          </div>
        </div>
      </div>

      {properties === null ? (
        <div className="empty">
          <div className="empty-t">Loading…</div>
        </div>
      ) : properties.length === 0 ? (
        <div className="empty">
          <IconHome2 size={32} color="var(--t3)" style={{ display: 'block', margin: '0 auto 12px' }} />
          <div className="empty-t">No rental properties yet</div>
          <div className="empty-s">Add your first property to start tracking units, leases, and rent.</div>
        </div>
      ) : (
        properties.map((p) => {
          const occupied = p.units.filter((u) => u.current_lease_id).length;
          return (
            <Link key={p.id} to={`/rentals/${p.id}`} className="cc btn-reset" style={{ width: '100%', textDecoration: 'none' }}>
              <div className="av">
                <IconHome2 size={16} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{p.address}</div>
                <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 2 }}>
                  {[p.city, p.state].filter(Boolean).join(', ')}
                  {p.city || p.state ? ' · ' : ''}
                  {p.property_type.replace(/_/g, ' ')}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span className="badge bg-gray">
                  {p.units.length} unit{p.units.length === 1 ? '' : 's'}
                </span>
                {p.units.length > 0 && (
                  <span className={`badge ${occupied === p.units.length ? 'bg-green' : occupied === 0 ? 'bg-gray' : 'bg-amber'}`}>
                    {occupied}/{p.units.length} occupied
                  </span>
                )}
              </div>
            </Link>
          );
        })
      )}

      {showNew && (
        <NewRentalPropertyModal
          onClose={() => setShowNew(false)}
          onSaved={() => {
            setShowNew(false);
            toast('Property added');
            load();
          }}
        />
      )}
    </>
  );
}
