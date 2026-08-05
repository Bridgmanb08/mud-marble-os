import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { IconPlus, IconUsers } from '@tabler/icons-react';
import { api } from '../api/client';
import { useToast } from '../components/ui/Toast';
import { fmt, fmtD } from '../lib/format';
import { NewRentalUnitModal } from '../components/rentals/NewRentalUnitModal';
import { NewRentalLeaseModal } from '../components/rentals/NewRentalLeaseModal';
import { LeaseRentLedgerModal } from '../components/rentals/LeaseRentLedgerModal';
import { NewRentalWorkOrderModal } from '../components/rentals/NewRentalWorkOrderModal';
import type { RentalLease, RentalProperty, RentalWorkOrder } from '../types';

const TABS = ['Overview', 'Units & Tenants', 'Leases', 'Maintenance'];
const WO_STATUS_BADGE: Record<string, string> = { open: 'bg-gray', in_progress: 'bg-amber', resolved: 'bg-green' };
const WO_PRIORITY_BADGE: Record<string, string> = { low: 'bg-gray', normal: 'bg-blue', high: 'bg-amber', urgent: 'bg-red' };
const SECTION_SCROLL_MARGIN = 108;

function sectionId(tab: string): string {
  return `rpd-section-${tab.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

const LEASE_STATUS_BADGE: Record<string, string> = { active: 'bg-green', upcoming: 'bg-blue', ended: 'bg-gray' };

export default function RentalPropertyDetail() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [property, setProperty] = useState<RentalProperty | null>(null);
  const [leases, setLeases] = useState<RentalLease[]>([]);
  const [workOrders, setWorkOrders] = useState<RentalWorkOrder[]>([]);
  const [activeTab, setActiveTab] = useState('Overview');
  const [showNewUnit, setShowNewUnit] = useState(false);
  const [showNewLease, setShowNewLease] = useState(false);
  const [showNewWorkOrder, setShowNewWorkOrder] = useState(false);
  const [ledgerLease, setLedgerLease] = useState<RentalLease | null>(null);

  function loadProperty() {
    if (!id) return;
    api
      .get<RentalProperty>(`/rental-properties/${id}`)
      .then(setProperty)
      .catch(() => toast('Failed to load property', true));
  }

  function loadLeases() {
    if (!id) return;
    api
      .get<RentalLease[]>(`/rental-leases?property_id=${id}`)
      .then(setLeases)
      .catch(() => toast('Failed to load leases', true));
  }

  function loadWorkOrders() {
    if (!id) return;
    api
      .get<RentalWorkOrder[]>(`/rental-work-orders?property_id=${id}`)
      .then(setWorkOrders)
      .catch(() => toast('Failed to load work orders', true));
  }

  useEffect(() => {
    loadProperty();
    loadLeases();
    loadWorkOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function changeWorkOrderStatus(wo: RentalWorkOrder, status: string) {
    try {
      await api.patch(`/rental-work-orders/${wo.id}`, { status });
      toast('Work order updated');
      loadWorkOrders();
    } catch {
      toast('Failed to update work order', true);
    }
  }

  function scrollToSection(t: string) {
    setActiveTab(t);
    document.getElementById(sectionId(t))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (!property) {
    return (
      <div className="empty">
        <div className="empty-t">Loading…</div>
      </div>
    );
  }

  const occupied = property.units.filter((u) => u.current_lease_id).length;

  return (
    <>
      <div className="ph">
        <div>
          <h1>{property.address}</h1>
          <p>
            {[property.city, property.state, property.zip].filter(Boolean).join(', ')}
            {property.city || property.state ? ' · ' : ''}
            {property.property_type.replace(/_/g, ' ')}
          </p>
        </div>
      </div>

      <div className="tabs" style={{ margin: '0 -24px 0', borderRadius: 0, position: 'sticky', top: 'var(--tb)', zIndex: 50 }}>
        {TABS.map((t) => (
          <button key={t} type="button" className={`tab${activeTab === t ? ' on' : ''}`} onClick={() => scrollToSection(t)}>
            {t}
          </button>
        ))}
      </div>
      <div className="tb" style={{ borderRadius: '0 0 12px 12px' }}>
        <div
          id={sectionId('Overview')}
          style={{ scrollMarginTop: SECTION_SCROLL_MARGIN, paddingBottom: 24, marginBottom: 24, borderBottom: '1px solid var(--border)' }}
        >
          <div className="ibt" style={{ fontSize: 13, textTransform: 'none', letterSpacing: 0, border: 'none', padding: 0, marginBottom: 14 }}>
            Overview
          </div>
          <div className="metrics">
            <div className="metric">
              <div className="m-label">Units</div>
              <div className="m-val">{property.units.length}</div>
            </div>
            <div className="metric">
              <div className="m-label">Occupied</div>
              <div className="m-val" style={{ color: 'var(--green)' }}>
                {occupied}
              </div>
            </div>
            <div className="metric">
              <div className="m-label">Vacant</div>
              <div className="m-val" style={{ color: property.units.length - occupied ? 'var(--amber)' : undefined }}>
                {property.units.length - occupied}
              </div>
            </div>
            <div className="metric">
              <div className="m-label">Active leases</div>
              <div className="m-val">{leases.filter((l) => l.lease_status === 'active').length}</div>
            </div>
          </div>
          {property.notes && (
            <div style={{ marginTop: 14 }}>
              <div className="ibt">Notes</div>
              <p style={{ fontSize: 13, color: 'var(--t2)', whiteSpace: 'pre-wrap' }}>{property.notes}</p>
            </div>
          )}
        </div>

        <div
          id={sectionId('Units & Tenants')}
          style={{ scrollMarginTop: SECTION_SCROLL_MARGIN, paddingBottom: 24, marginBottom: 24, borderBottom: '1px solid var(--border)' }}
        >
          <div
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}
          >
            <div className="ibt" style={{ fontSize: 13, textTransform: 'none', letterSpacing: 0, border: 'none', padding: 0 }}>
              Units &amp; Tenants
            </div>
            <button className="btn btn-sm" onClick={() => setShowNewUnit(true)}>
              <IconPlus size={14} /> Add unit
            </button>
          </div>
          {property.units.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--t2)' }}>No units yet.</div>
          ) : (
            property.units.map((u) => (
              <div key={u.id} className="cc" style={{ width: '100%' }}>
                <div className="av">
                  <IconUsers size={16} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{u.unit_label}</div>
                  <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 2 }}>
                    {[u.bedrooms ? `${u.bedrooms} bd` : null, u.bathrooms ? `${u.bathrooms} ba` : null, u.square_feet ? `${u.square_feet} sqft` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
                {u.current_tenant_name ? (
                  <span className="badge bg-green">Occupied — {u.current_tenant_name}</span>
                ) : (
                  <span className="badge bg-gray">Vacant</span>
                )}
              </div>
            ))
          )}
        </div>

        <div id={sectionId('Leases')} style={{ scrollMarginTop: SECTION_SCROLL_MARGIN }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div className="ibt" style={{ fontSize: 13, textTransform: 'none', letterSpacing: 0, border: 'none', padding: 0 }}>
              Leases
            </div>
            <button
              className="btn btn-sm"
              onClick={() => setShowNewLease(true)}
              disabled={property.units.length === 0}
              title={property.units.length === 0 ? 'Add a unit first' : undefined}
            >
              <IconPlus size={14} /> New lease
            </button>
          </div>
          {leases.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--t2)' }}>No leases yet.</div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Tenant</th>
                  <th>Term</th>
                  <th>Rent</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {leases.map((l) => (
                  <tr key={l.id}>
                    <td>{l.rental_units?.unit_label || '—'}</td>
                    <td>{l.tenants?.name || '—'}</td>
                    <td>
                      {fmtD(l.start_date)} – {fmtD(l.end_date)}
                    </td>
                    <td>{fmt(l.monthly_rent)}/mo</td>
                    <td>
                      <span className={`badge ${LEASE_STATUS_BADGE[l.lease_status] || 'bg-gray'}`}>{l.lease_status}</span>
                    </td>
                    <td>
                      <button className="btn btn-sm" onClick={() => setLedgerLease(l)}>
                        Rent ledger
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div
          id={sectionId('Maintenance')}
          style={{ scrollMarginTop: SECTION_SCROLL_MARGIN, marginTop: 24, paddingTop: 24, borderTop: '1px solid var(--border)' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div className="ibt" style={{ fontSize: 13, textTransform: 'none', letterSpacing: 0, border: 'none', padding: 0 }}>
              Maintenance
            </div>
            <button className="btn btn-sm" onClick={() => setShowNewWorkOrder(true)}>
              <IconPlus size={14} /> New work order
            </button>
          </div>
          {workOrders.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--t2)' }}>No work orders yet.</div>
          ) : (
            workOrders.map((w) => (
              <div key={w.id} className="cc" style={{ width: '100%', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>
                    {w.title}
                    {w.unit_label ? ` · ${w.unit_label}` : ''}
                  </div>
                  {w.description && <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 2 }}>{w.description}</div>}
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                    <span className={`badge ${WO_PRIORITY_BADGE[w.priority] || 'bg-gray'}`}>{w.priority}</span>
                    <span className={`badge ${WO_STATUS_BADGE[w.status] || 'bg-gray'}`}>{w.status.replace('_', ' ')}</span>
                    {w.assigned_to && <span style={{ fontSize: 11, color: 'var(--t3)' }}>{w.assigned_to}</span>}
                    <span style={{ fontSize: 11, color: 'var(--t3)' }}>{fmtD(w.created_at)}</span>
                  </div>
                </div>
                {w.status !== 'resolved' && (
                  <select
                    className="fi"
                    style={{ width: 140 }}
                    value={w.status}
                    onChange={(e) => changeWorkOrderStatus(w, e.target.value)}
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                  </select>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {showNewUnit && (
        <NewRentalUnitModal
          propertyId={property.id}
          onClose={() => setShowNewUnit(false)}
          onSaved={() => {
            setShowNewUnit(false);
            toast('Unit added');
            loadProperty();
          }}
        />
      )}
      {showNewLease && (
        <NewRentalLeaseModal
          units={property.units}
          onClose={() => setShowNewLease(false)}
          onSaved={() => {
            setShowNewLease(false);
            toast('Lease added');
            loadLeases();
            loadProperty();
          }}
        />
      )}
      {ledgerLease && <LeaseRentLedgerModal lease={ledgerLease} onClose={() => setLedgerLease(null)} />}
      {showNewWorkOrder && (
        <NewRentalWorkOrderModal
          properties={[property]}
          defaultPropertyId={property.id}
          onClose={() => setShowNewWorkOrder(false)}
          onSaved={() => {
            setShowNewWorkOrder(false);
            toast('Work order created — linked task added to the Task Board');
            loadWorkOrders();
          }}
        />
      )}
    </>
  );
}
