import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { fmt, fmtD } from '../../lib/format';
import { NewRentalLeaseModal, type LeaseUnit } from './NewRentalLeaseModal';
import { LeaseRentLedgerModal } from './LeaseRentLedgerModal';
import type { RentalLease } from '../../types';

const STATUS_BADGE: Record<string, string> = { active: 'bg-green', upcoming: 'bg-blue', ended: 'bg-gray' };

// One unit's tenant and lease: who lives there now (editable right here),
// adding a tenant when it's vacant, adding a new lease, and the lease
// history. Opened by clicking a unit on the property page or a tenant on the
// rent roll, so tenants are managed per unit (A, B, ...) instead of through
// a separate form that never said which unit it was for.
export function RentalUnitModal({
  unit,
  propertyAddress,
  onClose,
  onChanged,
}: {
  unit: LeaseUnit;
  propertyAddress: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [leases, setLeases] = useState<RentalLease[] | null>(null);
  const [showAdd, setShowAdd] = useState<'tenant' | 'lease' | null>(null);
  const [ledgerLease, setLedgerLease] = useState<RentalLease | null>(null);

  function load() {
    api
      .get<RentalLease[]>(`/rental-leases?unit_id=${unit.id}`)
      .then(setLeases)
      .catch(() => {
        setLeases([]);
        toast('Failed to load leases', true);
      });
  }
  useEffect(load, [unit.id]);

  const current = leases?.find((l) => l.lease_status === 'active') ?? null;

  return (
    <>
    <Modal title={`${propertyAddress} — ${unit.unit_label}`} onClose={onClose} wide>
      {leases === null ? (
        <div className="empty-s">Loading…</div>
      ) : (
        <>
          <div className="ibt" style={{ fontSize: 13, textTransform: 'none', letterSpacing: 0, border: 'none', padding: 0, marginBottom: 10 }}>
            Current tenant
          </div>
          {current && current.tenants ? (
            <TenantFields lease={current} onSaved={onChanged} />
          ) : (
            <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 10 }}>This unit is vacant.</div>
          )}
          <div style={{ display: 'flex', gap: 8, margin: '12px 0 18px', flexWrap: 'wrap' }}>
            {current && (
              <button className="btn btn-sm" onClick={() => setLedgerLease(current)}>
                Rent ledger &amp; lease documents
              </button>
            )}
            <button className="btn btn-sm btn-p" onClick={() => setShowAdd('tenant')}>
              {current ? 'Add another tenant' : 'Add tenant'}
            </button>
            {current && (
              <button className="btn btn-sm" onClick={() => setShowAdd('lease')}>
                New lease
              </button>
            )}
          </div>

          {leases.length > 0 && (
            <>
              <div className="ibt" style={{ fontSize: 13, textTransform: 'none', letterSpacing: 0, border: 'none', padding: 0, marginBottom: 6 }}>
                Leases
              </div>
              <div className="tbl-scroll">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Tenant</th>
                      <th>Term</th>
                      <th>Rent</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {leases.map((l) => (
                      <tr key={l.id}>
                        <td>{l.tenants?.name || '—'}</td>
                        <td>
                          {fmtD(l.start_date)} – {fmtD(l.end_date)}
                        </td>
                        <td>{fmt(l.monthly_rent)}/mo</td>
                        <td>
                          <span className={`badge ${STATUS_BADGE[l.lease_status] || 'bg-gray'}`}>{l.lease_status}</span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn btn-sm" onClick={() => setLedgerLease(l)}>
                            Ledger
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      <div className="ma">
        <button type="button" className="btn btn-p" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>

      {showAdd && (
        <NewRentalLeaseModal
          units={[unit]}
          startWithNewTenant={showAdd === 'tenant'}
          onClose={() => setShowAdd(null)}
          onSaved={() => {
            setShowAdd(null);
            toast(showAdd === 'tenant' ? 'Tenant added' : 'Lease added');
            load();
            onChanged();
          }}
        />
      )}
      {ledgerLease && <LeaseRentLedgerModal lease={ledgerLease} onClose={() => setLedgerLease(null)} />}
    </>
  );
}

// The tenant on a lease, editable in place -- each field saves when you leave
// it, the same way the rest of the rental screens work.
function TenantFields({ lease, onSaved }: { lease: RentalLease; onSaved: () => void }) {
  const toast = useToast();
  const tenant = lease.tenants!;
  const [form, setForm] = useState({
    name: tenant.name,
    phone: tenant.phone || '',
    email: tenant.email || '',
    notes: tenant.notes || '',
  });

  async function save(field: 'name' | 'phone' | 'email' | 'notes') {
    const value = form[field].trim();
    const original = (tenant[field] || '').trim();
    if (value === original) return;
    if (field === 'name' && !value) {
      setForm((f) => ({ ...f, name: tenant.name }));
      return;
    }
    try {
      await api.patch(`/rental-tenants/${tenant.id}`, { [field]: value || null });
      tenant[field] = value || (null as never);
      toast('Saved');
      onSaved();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to save', true);
    }
  }

  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="fr">
        <div className="fg">
          <label className="fl">Name</label>
          <input className="fi" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} onBlur={() => save('name')} />
        </div>
        <div className="fg">
          <label className="fl">Phone</label>
          <input className="fi" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} onBlur={() => save('phone')} />
        </div>
        <div className="fg">
          <label className="fl">Email</label>
          <input className="fi" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} onBlur={() => save('email')} />
        </div>
      </div>
      <div className="fg">
        <label className="fl">Notes</label>
        <textarea className="fi" rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} onBlur={() => save('notes')} />
      </div>
      <div style={{ fontSize: 12, color: 'var(--t2)' }}>
        Lease {fmtD(lease.start_date)} – {fmtD(lease.end_date)} · {fmt(lease.monthly_rent)}/mo
      </div>
    </div>
  );
}
