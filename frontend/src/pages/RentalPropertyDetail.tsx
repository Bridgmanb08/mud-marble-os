import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { IconArrowLeft, IconCamera, IconPlus, IconUsers } from '@tabler/icons-react';
import { api } from '../api/client';
import { useToast } from '../components/ui/Toast';
import { fmt, fmtD } from '../lib/format';
import { NewRentalUnitModal } from '../components/rentals/NewRentalUnitModal';
import { NewRentalLeaseModal } from '../components/rentals/NewRentalLeaseModal';
import { LeaseRentLedgerModal } from '../components/rentals/LeaseRentLedgerModal';
import { NewRentalWorkOrderModal } from '../components/rentals/NewRentalWorkOrderModal';
import { MoneyField } from '../components/rentals/MoneyField';
import { VisitLogModal } from '../components/rentals/VisitLogModal';
import { PropertyDetailModal } from '../components/rentals/PropertyDetailModal';
import type { RentalLease, RentalProperty, RentalPropertyDetail, RentalPropertyVisit, RentalWorkOrder } from '../types';

const TABS = ['Overview', 'Financials', 'Units & Tenants', 'Leases', 'Maintenance', 'Home Details', 'Visit Log'];

// Every editable financial field, kept in one string-valued form object
// rather than 19 separate useState calls -- each maps directly to a
// RentalPropertyUpdate field on PATCH /rental-properties/{id}.
const FINANCIAL_FIELDS = [
  'purchase_value',
  'debt',
  'target_monthly_rent',
  'mortgage_payment',
  'interest_rate',
  'taxes_monthly',
  'insurance_annual',
  'insurance_monthly',
  'other_expenses_monthly',
  'maintenance_monthly',
  'mowing_monthly',
  'utilities_monthly',
  'year_acquired',
  'lender',
  'loan_number',
  'parcel_number',
  'ownership_name',
  'ownership_pct',
] as const;
type FinancialField = (typeof FINANCIAL_FIELDS)[number];
const TEXT_FIELDS: FinancialField[] = ['lender', 'loan_number', 'parcel_number', 'ownership_name'];
const WO_STATUS_BADGE: Record<string, string> = { open: 'bg-gray', in_progress: 'bg-amber', resolved: 'bg-green' };
const WO_PRIORITY_BADGE: Record<string, string> = { low: 'bg-gray', normal: 'bg-blue', high: 'bg-amber', urgent: 'bg-red' };
const SECTION_SCROLL_MARGIN = 108;

function sectionId(tab: string): string {
  return `rpd-section-${tab.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

const LEASE_STATUS_BADGE: Record<string, string> = { active: 'bg-green', upcoming: 'bg-blue', ended: 'bg-gray' };

export default function RentalPropertyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [property, setProperty] = useState<RentalProperty | null>(null);
  const [leases, setLeases] = useState<RentalLease[]>([]);
  const [workOrders, setWorkOrders] = useState<RentalWorkOrder[]>([]);
  const [visits, setVisits] = useState<RentalPropertyVisit[]>([]);
  const [propertyDetails, setPropertyDetails] = useState<RentalPropertyDetail[]>([]);
  const [activeTab, setActiveTab] = useState('Overview');
  const [showNewUnit, setShowNewUnit] = useState(false);
  const [showNewLease, setShowNewLease] = useState(false);
  const [showNewWorkOrder, setShowNewWorkOrder] = useState(false);
  const [ledgerLease, setLedgerLease] = useState<RentalLease | null>(null);
  const [editingVisit, setEditingVisit] = useState<RentalPropertyVisit | null>(null);
  const [loggingVisit, setLoggingVisit] = useState(false);
  const [editingDetail, setEditingDetail] = useState<RentalPropertyDetail | null>(null);
  const [addingDetail, setAddingDetail] = useState(false);
  const [financials, setFinancials] = useState<Record<FinancialField, string>>(
    () => Object.fromEntries(FINANCIAL_FIELDS.map((f) => [f, ''])) as Record<FinancialField, string>
  );

  function loadProperty() {
    if (!id) return;
    api
      .get<RentalProperty>(`/rental-properties/${id}`)
      .then((p) => {
        setProperty(p);
        setFinancials(
          Object.fromEntries(FINANCIAL_FIELDS.map((f) => [f, p[f] !== null && p[f] !== undefined ? String(p[f]) : ''])) as Record<
            FinancialField,
            string
          >
        );
      })
      .catch(() => toast('Failed to load property', true));
  }

  async function saveFinancial(field: FinancialField, value: string) {
    if (!id) return;
    const trimmed = value.trim();
    let parsed: string | number | null;
    if (trimmed === '') parsed = null;
    else if (TEXT_FIELDS.includes(field)) parsed = trimmed;
    else if (field === 'year_acquired') parsed = parseInt(trimmed, 10);
    else parsed = parseFloat(trimmed);
    try {
      await api.patch(`/rental-properties/${id}`, { [field]: parsed });
      loadProperty();
    } catch {
      toast('Failed to save', true);
    }
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

  function loadVisits() {
    if (!id) return;
    api
      .get<RentalPropertyVisit[]>(`/rental-properties/${id}/visits`)
      .then(setVisits)
      .catch(() => toast('Failed to load visit log', true));
  }

  function loadPropertyDetails() {
    if (!id) return;
    api
      .get<RentalPropertyDetail[]>(`/rental-properties/${id}/details`)
      .then(setPropertyDetails)
      .catch(() => toast('Failed to load property details', true));
  }

  useEffect(() => {
    loadProperty();
    loadLeases();
    loadWorkOrders();
    loadVisits();
    loadPropertyDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function startNewVisit() {
    if (!id) return;
    setLoggingVisit(true);
    try {
      const created = await api.post<RentalPropertyVisit>(`/rental-properties/${id}/visits`, {});
      loadVisits();
      setEditingVisit(created);
    } catch {
      toast('Failed to log visit', true);
    } finally {
      setLoggingVisit(false);
    }
  }

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
      <button className="btn btn-sm" style={{ marginBottom: 12 }} onClick={() => navigate('/rentals')}>
        <IconArrowLeft size={14} /> Back to Rental Properties
      </button>
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
          id={sectionId('Financials')}
          style={{ scrollMarginTop: SECTION_SCROLL_MARGIN, paddingBottom: 24, marginBottom: 24, borderBottom: '1px solid var(--border)' }}
        >
          <div className="ibt" style={{ fontSize: 13, textTransform: 'none', letterSpacing: 0, border: 'none', padding: 0, marginBottom: 14 }}>
            Financials
          </div>
          <div className="metrics">
            <div className="metric">
              <div className="m-label">Equity</div>
              <div className="m-val">{property.equity !== null ? fmt(property.equity) : '—'}</div>
            </div>
            <div className="metric">
              <div className="m-label">Est. monthly cash flow</div>
              <div
                className="m-val"
                style={{ color: property.estimated_monthly_cash_flow === null ? undefined : property.estimated_monthly_cash_flow >= 0 ? 'var(--green)' : 'var(--red)' }}
              >
                {property.estimated_monthly_cash_flow !== null ? fmt(property.estimated_monthly_cash_flow) : '—'}
              </div>
            </div>
          </div>

          <div className="fr3" style={{ marginTop: 14 }}>
            <div className="fg">
              <label className="fl">Purchase value</label>
              <MoneyField value={financials.purchase_value} onCommit={(v) => saveFinancial('purchase_value', v)} />
            </div>
            <div className="fg">
              <label className="fl">Debt</label>
              <MoneyField value={financials.debt} onCommit={(v) => saveFinancial('debt', v)} />
            </div>
            <div className="fg">
              <label className="fl">Target monthly rent</label>
              <MoneyField value={financials.target_monthly_rent} onCommit={(v) => saveFinancial('target_monthly_rent', v)} />
            </div>
          </div>
          <div className="fr3">
            <div className="fg">
              <label className="fl">Mortgage payment (/mo)</label>
              <MoneyField value={financials.mortgage_payment} onCommit={(v) => saveFinancial('mortgage_payment', v)} />
            </div>
            <div className="fg">
              <label className="fl">Interest rate</label>
              <input className="fi" type="number" step="0.0001" value={financials.interest_rate} onChange={(e) => setFinancials((f) => ({ ...f, interest_rate: e.target.value }))} onBlur={(e) => saveFinancial('interest_rate', e.target.value)} />
            </div>
            <div className="fg">
              <label className="fl">Taxes (/mo)</label>
              <MoneyField value={financials.taxes_monthly} onCommit={(v) => saveFinancial('taxes_monthly', v)} />
            </div>
          </div>
          <div className="fr3">
            <div className="fg">
              <label className="fl">Insurance (/yr)</label>
              <MoneyField value={financials.insurance_annual} onCommit={(v) => saveFinancial('insurance_annual', v)} />
            </div>
            <div className="fg">
              <label className="fl">Insurance (/mo)</label>
              <MoneyField value={financials.insurance_monthly} onCommit={(v) => saveFinancial('insurance_monthly', v)} />
            </div>
            <div className="fg">
              <label className="fl">Other expenses (/mo)</label>
              <MoneyField value={financials.other_expenses_monthly} onCommit={(v) => saveFinancial('other_expenses_monthly', v)} />
            </div>
          </div>
          <div className="fr3">
            <div className="fg">
              <label className="fl">Maintenance/Cap Ex (/mo)</label>
              <MoneyField value={financials.maintenance_monthly} onCommit={(v) => saveFinancial('maintenance_monthly', v)} />
            </div>
            <div className="fg">
              <label className="fl">Mowing (/mo)</label>
              <MoneyField value={financials.mowing_monthly} onCommit={(v) => saveFinancial('mowing_monthly', v)} />
            </div>
            <div className="fg">
              <label className="fl">Utilities (/mo)</label>
              <MoneyField value={financials.utilities_monthly} onCommit={(v) => saveFinancial('utilities_monthly', v)} />
            </div>
          </div>
          <div className="fr3">
            <div className="fg">
              <label className="fl">Lender</label>
              <input className="fi" value={financials.lender} onChange={(e) => setFinancials((f) => ({ ...f, lender: e.target.value }))} onBlur={(e) => saveFinancial('lender', e.target.value)} />
            </div>
            <div className="fg">
              <label className="fl">Loan number</label>
              <input className="fi" value={financials.loan_number} onChange={(e) => setFinancials((f) => ({ ...f, loan_number: e.target.value }))} onBlur={(e) => saveFinancial('loan_number', e.target.value)} />
            </div>
            <div className="fg">
              <label className="fl">Parcel number</label>
              <input className="fi" value={financials.parcel_number} onChange={(e) => setFinancials((f) => ({ ...f, parcel_number: e.target.value }))} onBlur={(e) => saveFinancial('parcel_number', e.target.value)} />
            </div>
          </div>
          <div className="fr3">
            <div className="fg">
              <label className="fl">Ownership entity</label>
              <input className="fi" value={financials.ownership_name} onChange={(e) => setFinancials((f) => ({ ...f, ownership_name: e.target.value }))} onBlur={(e) => saveFinancial('ownership_name', e.target.value)} />
            </div>
            <div className="fg">
              <label className="fl">Ownership %</label>
              <input className="fi" type="number" step="0.01" value={financials.ownership_pct} onChange={(e) => setFinancials((f) => ({ ...f, ownership_pct: e.target.value }))} onBlur={(e) => saveFinancial('ownership_pct', e.target.value)} />
            </div>
            <div className="fg">
              <label className="fl">Year acquired</label>
              <input className="fi" type="number" value={financials.year_acquired} onChange={(e) => setFinancials((f) => ({ ...f, year_acquired: e.target.value }))} onBlur={(e) => saveFinancial('year_acquired', e.target.value)} />
            </div>
          </div>
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
            <div className="tbl-scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th className="sticky-col">Unit</th>
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
                      <td className="sticky-col">{l.rental_units?.unit_label || '—'}</td>
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
            </div>
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

        <div
          id={sectionId('Home Details')}
          style={{ scrollMarginTop: SECTION_SCROLL_MARGIN, marginTop: 24, paddingTop: 24, borderTop: '1px solid var(--border)' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <div className="ibt" style={{ fontSize: 13, textTransform: 'none', letterSpacing: 0, border: 'none', padding: 0 }}>
              Home Details
            </div>
            <button className="btn btn-sm" onClick={() => setAddingDetail(true)}>
              <IconPlus size={14} /> Add detail
            </button>
          </div>
          <p style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 14 }}>
            Paint colors, roof, appliances, landscaping, and anything else worth knowing about this house — each dated so you can tell what's current.
          </p>
          {propertyDetails.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--t2)' }}>No details logged yet.</div>
          ) : (
            Object.entries(
              propertyDetails.reduce<Record<string, RentalPropertyDetail[]>>((acc, d) => {
                (acc[d.category] ||= []).push(d);
                return acc;
              }, {})
            ).map(([category, items]) => (
              <div key={category} style={{ marginBottom: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: 0.3, margin: '10px 0 2px' }}>
                  {category}
                </div>
                {items.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    className="cc btn-reset"
                    style={{ width: '100%', textAlign: 'left', alignItems: 'flex-start', cursor: 'pointer' }}
                    onClick={() => setEditingDetail(d)}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{d.detail}</div>
                      <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 2 }}>
                        {d.detail_date ? fmtD(d.detail_date) : 'No date'}
                        {d.notes ? ` · ${d.notes}` : ''}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>

        <div
          id={sectionId('Visit Log')}
          style={{ scrollMarginTop: SECTION_SCROLL_MARGIN, marginTop: 24, paddingTop: 24, borderTop: '1px solid var(--border)' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div className="ibt" style={{ fontSize: 13, textTransform: 'none', letterSpacing: 0, border: 'none', padding: 0 }}>
              Visit Log
            </div>
            <button className="btn btn-sm" onClick={startNewVisit} disabled={loggingVisit}>
              <IconCamera size={14} /> Log visit
            </button>
          </div>
          {visits.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--t2)' }}>No visits logged yet.</div>
          ) : (
            visits.map((v) => (
              <button
                key={v.id}
                type="button"
                className="cc btn-reset"
                style={{ width: '100%', textAlign: 'left', alignItems: 'flex-start', cursor: 'pointer' }}
                onClick={() => setEditingVisit(v)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>
                    {fmtD(v.visited_at)}
                    {v.visited_by ? ` · ${v.visited_by}` : ''}
                  </div>
                  {v.notes ? (
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--t2)',
                        marginTop: 2,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {v.notes}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2, fontStyle: 'italic' }}>No summary added yet — click to add one</div>
                  )}
                </div>
              </button>
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
      {editingVisit && (
        <VisitLogModal
          visit={editingVisit}
          onClose={() => setEditingVisit(null)}
          onSaved={() => {
            setEditingVisit(null);
            loadVisits();
          }}
        />
      )}
      {(addingDetail || editingDetail) && property && (
        <PropertyDetailModal
          propertyId={property.id}
          detail={editingDetail || undefined}
          onClose={() => {
            setAddingDetail(false);
            setEditingDetail(null);
          }}
          onSaved={() => {
            setAddingDetail(false);
            setEditingDetail(null);
            loadPropertyDetails();
          }}
          onDeleted={() => {
            setEditingDetail(null);
            loadPropertyDetails();
          }}
        />
      )}
    </>
  );
}
