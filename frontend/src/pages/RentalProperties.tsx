import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { IconPlus, IconHome2, IconMapPin } from '@tabler/icons-react';
import { api, ApiError } from '../api/client';
import { useToast } from '../components/ui/Toast';
import { fmt, fmtD } from '../lib/format';
import { NewRentalPropertyModal } from '../components/rentals/NewRentalPropertyModal';
import { LeaseTimeline } from '../components/rentals/LeaseTimeline';
import { MoneyField } from '../components/rentals/MoneyField';
import type { RentalLease, RentalProperty, RentRollRow } from '../types';

function visitColor(daysSince: number | null): string {
  if (daysSince === null) return 'var(--red)';
  if (daysSince > 45) return 'var(--red)';
  if (daysSince > 30) return 'var(--amber)';
  return 'var(--green)';
}

function leaseEndColor(endDate: string | null): string | undefined {
  if (!endDate) return undefined;
  const days = Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000);
  if (days < 30) return 'var(--red)';
  if (days < 90) return 'var(--amber)';
  return undefined;
}

export default function RentalProperties() {
  const toast = useToast();
  const [properties, setProperties] = useState<RentalProperty[] | null>(null);
  const [leases, setLeases] = useState<RentalLease[]>([]);
  const [rentRoll, setRentRoll] = useState<RentRollRow[] | null>(null);
  const [showNew, setShowNew] = useState(false);

  function load() {
    api
      .get<RentalProperty[]>('/rental-properties')
      .then(setProperties)
      .catch(() => toast('Failed to load rental properties', true));
    api
      .get<RentalLease[]>('/rental-leases')
      .then(setLeases)
      .catch(() => {});
    loadRentRoll();
  }

  function loadRentRoll() {
    api
      .get<RentRollRow[]>('/rentals/rent-roll')
      .then(setRentRoll)
      .catch(() => toast('Failed to load rent roll', true));
  }

  useEffect(load, []);

  const totals = useMemo(() => {
    const units = properties?.flatMap((p) => p.units) ?? [];
    const occupied = units.filter((u) => u.current_lease_id).length;
    return { propertyCount: properties?.length ?? 0, unitCount: units.length, occupied, vacant: units.length - occupied };
  }, [properties]);

  // Sum whatever properties actually have a value for -- most portfolios
  // are mid-backfill, so a missing field on one property shouldn't zero out
  // the whole portfolio total, it should just be excluded from that sum.
  const financialTotals = useMemo(() => {
    const sum = (get: (p: RentalProperty) => number | null) =>
      (properties ?? []).reduce((total, p) => total + (get(p) ?? 0), 0);
    return {
      value: sum((p) => p.purchase_value),
      debt: sum((p) => p.debt),
      equity: sum((p) => p.equity),
      targetRent: sum((p) => p.target_monthly_rent),
      cashFlow: sum((p) => p.estimated_monthly_cash_flow),
    };
  }, [properties]);
  const hasFinancials = financialTotals.value > 0 || financialTotals.debt > 0;

  async function logVisit(propertyId: string) {
    try {
      await api.post(`/rental-properties/${propertyId}/visits`, {});
      toast('Visit logged');
      loadRentRoll();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to log visit', true);
    }
  }

  async function updateLease(leaseId: string, body: Record<string, unknown>) {
    try {
      await api.patch(`/rental-leases/${leaseId}`, body);
      loadRentRoll();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to save', true);
    }
  }

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

      {hasFinancials && (
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <div className="ibt" style={{ fontSize: 13, textTransform: 'none', letterSpacing: 0, border: 'none', padding: 0, marginBottom: 14 }}>
            Portfolio financials
          </div>
          <div className="metrics">
            <div className="metric">
              <div className="m-label">Portfolio value</div>
              <div className="m-val">{fmt(financialTotals.value)}</div>
            </div>
            <div className="metric">
              <div className="m-label">Debt</div>
              <div className="m-val">{fmt(financialTotals.debt)}</div>
            </div>
            <div className="metric">
              <div className="m-label">Equity</div>
              <div className="m-val" style={{ color: 'var(--green)' }}>
                {fmt(financialTotals.equity)}
              </div>
            </div>
            <div className="metric">
              <div className="m-label">Target monthly rent</div>
              <div className="m-val">{fmt(financialTotals.targetRent)}</div>
            </div>
            <div className="metric">
              <div className="m-label">Est. monthly cash flow</div>
              <div className="m-val" style={{ color: financialTotals.cashFlow >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {fmt(financialTotals.cashFlow)}
              </div>
            </div>
          </div>
        </div>
      )}

      {leases.length > 0 && (
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <div className="ibt" style={{ fontSize: 13, textTransform: 'none', letterSpacing: 0, border: 'none', padding: 0, marginBottom: 14 }}>
            Lease timeline
          </div>
          <LeaseTimeline leases={leases} />
        </div>
      )}

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
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="ibt" style={{ fontSize: 13, textTransform: 'none', letterSpacing: 0, border: 'none', padding: '16px 20px 0' }}>
            Rent roll
          </div>
          <div className="tbl-scroll">
            <table className="tbl tbl-zebra">
              <thead>
                <tr>
                  <th>Property / Unit</th>
                  <th>Tenant</th>
                  <th>Rent</th>
                  <th>Current due</th>
                  <th>Past due</th>
                  <th>Last visited</th>
                  <th>Lease ends</th>
                  <th>Renewing?</th>
                  <th>Rent increase</th>
                </tr>
              </thead>
              <tbody>
                {rentRoll === null ? (
                  <tr>
                    <td colSpan={9} style={{ color: 'var(--t2)' }}>
                      Loading…
                    </td>
                  </tr>
                ) : (
                  rentRoll.map((r) => (
                    <tr key={r.unit_id}>
                      <td>
                        <Link to={`/rentals/${r.property_id}`} style={{ color: 'var(--blue)', fontWeight: 500 }}>
                          {r.property_address}
                        </Link>
                        <div style={{ fontSize: 11, color: 'var(--t3)' }}>{r.unit_label}</div>
                      </td>
                      <td>
                        {r.tenant_name ? r.tenant_name : <span className="badge bg-gray">Vacant</span>}
                      </td>
                      <td>{r.monthly_rent !== null ? `${fmt(r.monthly_rent)}/mo` : '—'}</td>
                      <td>
                        {r.lease_id ? (
                          <span style={{ color: r.current_month_paid >= r.current_month_due ? undefined : 'var(--red)' }}>
                            {fmt(r.current_month_due - r.current_month_paid)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {r.past_due_total > 0 ? (
                          <span className="badge bg-red">{fmt(r.past_due_total)} late</span>
                        ) : r.lease_id ? (
                          <span style={{ color: 'var(--green)' }}>On time</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: visitColor(r.days_since_visit) }}>
                            {r.last_visited_at ? `${fmtD(r.last_visited_at)} (${r.days_since_visit}d)` : 'Never'}
                          </span>
                          <button
                            type="button"
                            className="btn-reset"
                            title="Log a visit today"
                            style={{ color: 'var(--t3)', cursor: 'pointer', display: 'inline-flex' }}
                            onClick={() => logVisit(r.property_id)}
                          >
                            <IconMapPin size={14} />
                          </button>
                        </div>
                      </td>
                      <td style={{ color: leaseEndColor(r.lease_end_date) }}>{r.lease_end_date ? fmtD(r.lease_end_date) : '—'}</td>
                      <td>
                        {r.lease_id ? (
                          <select
                            className="fi"
                            style={{ width: 130 }}
                            value={r.renewal_status || 'undecided'}
                            onChange={(e) => updateLease(r.lease_id!, { renewal_status: e.target.value })}
                          >
                            <option value="undecided">Undecided</option>
                            <option value="renewing">Renewing</option>
                            <option value="not_renewing">Not renewing</option>
                          </select>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td style={{ width: 130 }}>
                        {r.lease_id ? (
                          <MoneyField
                            value={r.renewal_rent_increase !== null ? String(r.renewal_rent_increase) : ''}
                            onCommit={(v) => updateLease(r.lease_id!, { renewal_rent_increase: v.trim() === '' ? null : parseFloat(v) })}
                          />
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
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
