import { useEffect, useMemo, useState } from 'react';
import { IconPlus, IconClipboardList } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useToast } from '../components/ui/Toast';
import { fmtD } from '../lib/format';
import { NewRentalWorkOrderModal } from '../components/rentals/NewRentalWorkOrderModal';
import type { RentalProperty, RentalWorkOrder } from '../types';

const COLUMNS = [
  { id: 'open', label: 'Open' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'resolved', label: 'Resolved' },
];

const PRIORITY_BADGE: Record<string, string> = { low: 'bg-gray', normal: 'bg-blue', high: 'bg-amber', urgent: 'bg-red' };

export default function RentalWorkOrders() {
  const toast = useToast();
  const [workOrders, setWorkOrders] = useState<RentalWorkOrder[] | null>(null);
  const [properties, setProperties] = useState<RentalProperty[]>([]);
  const [propertyFilter, setPropertyFilter] = useState('');
  const [showNew, setShowNew] = useState(false);

  function load() {
    api
      .get<RentalWorkOrder[]>('/rental-work-orders')
      .then(setWorkOrders)
      .catch(() => toast('Failed to load work orders', true));
  }

  useEffect(() => {
    load();
    api.get<RentalProperty[]>('/rental-properties').then(setProperties).catch(() => {});
  }, []);

  const filtered = useMemo(
    () => (workOrders ?? []).filter((w) => !propertyFilter || w.property_id === propertyFilter),
    [workOrders, propertyFilter]
  );

  async function changeStatus(wo: RentalWorkOrder, status: string) {
    try {
      await api.patch(`/rental-work-orders/${wo.id}`, { status });
      toast('Work order updated');
      load();
    } catch {
      toast('Failed to update work order', true);
    }
  }

  return (
    <>
      <div className="ph">
        <div>
          <h1>Work Orders</h1>
          <p>Maintenance requests across all rental properties</p>
        </div>
        <button className="btn btn-p btn-sm" onClick={() => setShowNew(true)} disabled={properties.length === 0}>
          <IconPlus size={14} /> New work order
        </button>
      </div>

      {properties.length > 0 && (
        <div className="sh">
          <div className="st">{filtered.length} work orders</div>
          <div className="filters">
            <button className={`fb${propertyFilter === '' ? ' on' : ''}`} onClick={() => setPropertyFilter('')}>
              All properties
            </button>
            {properties.map((p) => (
              <button key={p.id} className={`fb${propertyFilter === p.id ? ' on' : ''}`} onClick={() => setPropertyFilter(p.id)}>
                {p.address}
              </button>
            ))}
          </div>
        </div>
      )}

      {workOrders === null ? (
        <div className="empty">
          <div className="empty-t">Loading…</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <IconClipboardList size={32} color="var(--t3)" style={{ display: 'block', margin: '0 auto 12px' }} />
          <div className="empty-t">No work orders yet</div>
          <div className="empty-s">Create one to track a maintenance request per property.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {COLUMNS.map((col) => (
            <div key={col.id}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)', textTransform: 'uppercase', marginBottom: 8 }}>
                {col.label} ({filtered.filter((w) => w.status === col.id).length})
              </div>
              {filtered
                .filter((w) => w.status === col.id)
                .map((w) => (
                  <div key={w.id} className="card" style={{ padding: 12, marginBottom: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{w.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 6 }}>
                      <Link to={`/rentals/${w.property_id}`} style={{ color: 'var(--blue)' }}>
                        {w.property_address}
                      </Link>
                      {w.unit_label ? ` · ${w.unit_label}` : ''}
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className={`badge ${PRIORITY_BADGE[w.priority] || 'bg-gray'}`}>{w.priority}</span>
                      {w.assigned_to && <span style={{ fontSize: 11, color: 'var(--t3)' }}>{w.assigned_to}</span>}
                      <span style={{ fontSize: 11, color: 'var(--t3)' }}>{fmtD(w.created_at)}</span>
                    </div>
                    <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                      {COLUMNS.filter((c) => c.id !== w.status).map((c) => (
                        <button key={c.id} className="btn btn-sm" onClick={() => changeStatus(w, c.id)}>
                          Move to {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <NewRentalWorkOrderModal
          properties={properties}
          defaultPropertyId={propertyFilter || undefined}
          onClose={() => setShowNew(false)}
          onSaved={() => {
            setShowNew(false);
            toast('Work order created — linked task added to the Task Board');
            load();
          }}
        />
      )}
    </>
  );
}
