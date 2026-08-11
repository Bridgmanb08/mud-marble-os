import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { IconPlus, IconHome2, IconMapPin, IconChevronUp, IconChevronDown } from '@tabler/icons-react';
import { api, ApiError } from '../api/client';
import { useToast } from '../components/ui/Toast';
import { fmt, fmtD } from '../lib/format';
import { NewRentalPropertyModal } from '../components/rentals/NewRentalPropertyModal';
import { LeaseTimeline } from '../components/rentals/LeaseTimeline';
import { MoneyField } from '../components/rentals/MoneyField';
import { DesktopOnlyNotice } from '../components/ui/DesktopOnlyNotice';
import { useIsMobile } from '../hooks/useMediaQuery';
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

type SortKey = 'property' | 'tenant' | 'rent' | 'current_due' | 'past_due' | 'last_visited' | 'lease_end' | 'renewal' | 'rent_increase';

const RENEWAL_RANK: Record<string, number> = { renewing: 0, undecided: 1, not_renewing: 2 };

function sortValue(r: RentRollRow, key: SortKey): string | number | null {
  switch (key) {
    case 'property':
      return `${r.property_address} ${r.unit_label}`;
    case 'tenant':
      return r.tenant_name;
    case 'rent':
      return r.monthly_rent;
    case 'current_due':
      return r.lease_id ? r.current_month_due - r.current_month_paid : null;
    case 'past_due':
      return r.past_due_total || null;
    case 'last_visited':
      // "Never visited" is the most urgent case, not a blank -- rank it
      // ahead of everything instead of letting the normal null-sorts-last
      // rule bury it at the bottom.
      return r.days_since_visit === null ? -1 : r.days_since_visit;
    case 'lease_end':
      return r.lease_end_date;
    case 'renewal':
      return r.renewal_status ? RENEWAL_RANK[r.renewal_status] ?? 99 : null;
    case 'rent_increase':
      return r.renewal_rent_increase;
    default:
      return null;
  }
}

// Click-to-edit text/number cell -- same component shape as Leads.tsx's
// EditableCell, reused here rather than imported since it's page-local
// styling (no shared component existed for this before either page needed
// it).
function EditableCell({
  value,
  onCommit,
  placeholder = '—',
  type = 'text',
  displayValue,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  type?: string;
  displayValue?: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  function commit(next: string) {
    setEditing(false);
    if (next !== value) onCommit(next);
  }

  if (editing) {
    return (
      <input
        className="fi"
        autoFocus
        type={type}
        value={draft}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(draft);
          if (e.key === 'Escape') {
            setDraft(value);
            setEditing(false);
          }
        }}
        style={{ fontSize: 12, width: '100%' }}
      />
    );
  }
  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      title="Click to edit"
      style={{ cursor: 'text', minHeight: 16 }}
    >
      {displayValue !== undefined ? displayValue : value || <span style={{ color: 'var(--t3)' }}>{placeholder}</span>}
    </div>
  );
}

const theadThStyle = { top: 0 };

// Hoisted to module scope (not defined inside RentalProperties()) so it
// keeps a stable component identity across renders -- a component defined
// inside another component's body gets a new function identity every
// render, which makes React tear down and remount the whole subtree (here,
// the header row) on every state change instead of just updating it.
function SortTh({
  label,
  sortKeyValue,
  sortKey,
  sortDir,
  onToggle,
  sticky,
}: {
  label: string;
  sortKeyValue: SortKey;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onToggle: (key: SortKey) => void;
  sticky?: boolean;
}) {
  const active = sortKey === sortKeyValue;
  return (
    <th className={`sortable${sticky ? ' sticky-col' : ''}`} style={theadThStyle} onClick={() => onToggle(sortKeyValue)}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
        {label}
        {active ? (sortDir === 'asc' ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />) : null}
      </span>
    </th>
  );
}

export default function RentalProperties() {
  const toast = useToast();
  const isMobile = useIsMobile();
  const [properties, setProperties] = useState<RentalProperty[] | null>(null);
  const [leases, setLeases] = useState<RentalLease[]>([]);
  const [rentRoll, setRentRoll] = useState<RentRollRow[] | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('property');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

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
    // Optimistic update, same pattern used throughout this app's other
    // inline-editable tables (Leads.tsx) -- reflects the change instantly
    // instead of waiting on the reload.
    setRentRoll((prev) => (prev ? prev.map((r) => (r.lease_id === leaseId ? { ...r, ...body } : r)) : prev));
    try {
      await api.patch(`/rental-leases/${leaseId}`, body);
      loadRentRoll();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to save', true);
      loadRentRoll();
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const sortedRentRoll = useMemo(() => {
    if (!rentRoll) return [];
    return [...rentRoll].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rentRoll, sortKey, sortDir]);

  // The Rent Roll table gets its own bounded-height, internally-scrolling
  // box instead of relying on page scroll -- same technique used on
  // Leads.tsx, and for the same reason: a naive sticky <th> inside a plain
  // overflow-x:auto wrapper silently breaks (any ancestor with non-visible
  // overflow becomes the sticky containing block, and since it never
  // actually scrolls itself, the header just sits at a constant offset).
  // This also directly satisfies "keep the metrics/financials visible while
  // scrolling the roll" for free -- the page itself never needs to scroll
  // past them since only the table body scrolls, in its own box.
  const tableCardRef = useRef<HTMLDivElement>(null);
  const [tableMaxHeight, setTableMaxHeight] = useState('60vh');
  useEffect(() => {
    function update() {
      const el = tableCardRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      // Floor at a sensible minimum -- when the metrics/financials/lease
      // timeline sections above push the card's top past the viewport
      // height (a big portfolio, lots of leases), `100vh - top` goes
      // negative and the browser silently clamps a negative max-height to
      // 0, collapsing the whole table to nothing. A fixed floor keeps
      // several rows visible and scrollable even then.
      const available = Math.max(320, window.innerHeight - top - 24);
      setTableMaxHeight(`${available}px`);
    }
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFinancials, leases.length, properties]);

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

      {leases.length > 0 &&
        (isMobile ? (
          // Gantt-style timeline is inherently wide -- point back to the
          // rent roll below instead of force-fitting it into a phone screen.
          <div style={{ marginBottom: 16 }}>
            <DesktopOnlyNotice label="Lease timeline" />
          </div>
        ) : (
          <div className="card" style={{ padding: 20, marginBottom: 16 }}>
            <div className="ibt" style={{ fontSize: 13, textTransform: 'none', letterSpacing: 0, border: 'none', padding: 0, marginBottom: 14 }}>
              Lease timeline
            </div>
            <LeaseTimeline leases={leases} />
          </div>
        ))}

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
        <div className="card" style={{ padding: 0, overflow: 'hidden' }} ref={tableCardRef}>
          <div className="ibt" style={{ fontSize: 13, textTransform: 'none', letterSpacing: 0, border: 'none', padding: '16px 20px 0' }}>
            Rent roll
          </div>
          <div style={{ overflow: 'auto', maxHeight: tableMaxHeight, marginTop: 10 }}>
            <table className="tbl tbl-zebra tbl-sticky-head">
              <thead>
                <tr>
                  <SortTh label="Property / Unit" sortKeyValue="property" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} sticky />
                  <SortTh label="Tenant" sortKeyValue="tenant" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                  <SortTh label="Rent" sortKeyValue="rent" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                  <SortTh label="Current due" sortKeyValue="current_due" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                  <SortTh label="Past due" sortKeyValue="past_due" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                  <SortTh label="Last visited" sortKeyValue="last_visited" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                  <SortTh label="Lease ends" sortKeyValue="lease_end" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                  <SortTh label="Renewing?" sortKeyValue="renewal" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                  <SortTh label="Rent increase" sortKeyValue="rent_increase" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
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
                  sortedRentRoll.map((r) => (
                    <tr key={r.unit_id}>
                      <td className="sticky-col">
                        <Link to={`/rentals/${r.property_id}`} style={{ color: 'var(--blue)', fontWeight: 500 }}>
                          {r.property_address}
                        </Link>
                        <div style={{ fontSize: 11, color: 'var(--t3)' }}>{r.unit_label}</div>
                      </td>
                      <td>
                        {r.tenant_name ? (
                          <span title="Change the tenant from the property's Units & Tenants tab">{r.tenant_name}</span>
                        ) : (
                          <span className="badge bg-gray">Vacant</span>
                        )}
                      </td>
                      <td onClick={(e) => e.stopPropagation()} style={{ minWidth: 100 }}>
                        {r.lease_id ? (
                          <MoneyField
                            value={r.monthly_rent !== null ? String(r.monthly_rent) : ''}
                            onCommit={(v) => updateLease(r.lease_id!, { monthly_rent: v.trim() === '' ? 0 : parseFloat(v) })}
                          />
                        ) : (
                          '—'
                        )}
                      </td>
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
                            className="btn-reset hover-tip"
                            data-tip="Click to record visit for today"
                            aria-label="Log a visit today"
                            style={{ color: 'var(--t3)', cursor: 'pointer', display: 'inline-flex' }}
                            onClick={() => logVisit(r.property_id)}
                          >
                            <IconMapPin size={14} />
                          </button>
                        </div>
                      </td>
                      <td onClick={(e) => e.stopPropagation()} style={{ minWidth: 120 }}>
                        {r.lease_id ? (
                          <EditableCell
                            value={r.lease_end_date ? r.lease_end_date.slice(0, 10) : ''}
                            type="date"
                            displayValue={
                              <span style={{ color: leaseEndColor(r.lease_end_date) }}>
                                {r.lease_end_date ? fmtD(r.lease_end_date) : '—'}
                              </span>
                            }
                            onCommit={(v) => updateLease(r.lease_id!, { end_date: v })}
                          />
                        ) : (
                          '—'
                        )}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
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
                      <td onClick={(e) => e.stopPropagation()} style={{ width: 130 }}>
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
