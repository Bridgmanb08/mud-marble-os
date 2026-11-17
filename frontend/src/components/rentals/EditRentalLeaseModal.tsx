import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import { openDatePicker } from '../../lib/datePicker';
import type { RentalLease, RentalTenant, RentalUnit } from '../../types';

// The lease row used to be display-only after it was created, so a rent
// left blank (saved as $0) could only be fixed by adding a second lease.
export function EditRentalLeaseModal({
  lease,
  units,
  onClose,
  onSaved,
}: {
  lease: RentalLease;
  units: Pick<RentalUnit, 'id' | 'unit_label'>[];
  onClose: () => void;
  onSaved: (lease: RentalLease) => void;
}) {
  const [tenants, setTenants] = useState<RentalTenant[]>([]);
  const [unitId, setUnitId] = useState(lease.unit_id);
  const [tenantId, setTenantId] = useState(lease.tenant_id);
  const [startDate, setStartDate] = useState(lease.start_date.slice(0, 10));
  const [endDate, setEndDate] = useState(lease.end_date.slice(0, 10));
  const [monthlyRent, setMonthlyRent] = useState(String(lease.monthly_rent ?? ''));
  const [securityDeposit, setSecurityDeposit] = useState(
    lease.security_deposit === null || lease.security_deposit === undefined ? '' : String(lease.security_deposit)
  );
  const [rentDueDay, setRentDueDay] = useState(String(lease.rent_due_day || 1));
  const [notes, setNotes] = useState(lease.notes || '');
  const [error, setError] = useState('');
  const [allowZero, setAllowZero] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<RentalTenant[]>('/rental-tenants').then(setTenants).catch(() => {});
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!unitId) {
      setError('Choose a unit.');
      return;
    }
    if (!tenantId) {
      setError('Choose a tenant.');
      return;
    }
    if (!startDate || !endDate) {
      setError('Start and end dates are required.');
      return;
    }
    if (endDate < startDate) {
      setError('Lease end date cannot be before the start date.');
      return;
    }
    const rent = monthlyRent.trim() === '' ? NaN : parseFloat(monthlyRent);
    if (Number.isNaN(rent) || rent < 0) {
      setError('Enter the monthly rent.');
      return;
    }
    if (rent === 0 && !allowZero) {
      setAllowZero(true);
      setError('Monthly rent is $0.00. That’s why this lease shows $0.00/mo. Enter the rent, or save again to keep $0.');
      return;
    }
    if (securityDeposit.trim() !== '' && Number.isNaN(parseFloat(securityDeposit))) {
      setError('Security deposit has to be a number.');
      return;
    }
    const due = parseInt(rentDueDay, 10);
    if (!due || due < 1 || due > 31) {
      setError('Rent due day has to be between 1 and 31.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const saved = await api.patch<RentalLease>(`/rental-leases/${lease.id}`, {
        unit_id: unitId,
        tenant_id: tenantId,
        start_date: startDate,
        end_date: endDate,
        monthly_rent: rent,
        security_deposit: securityDeposit.trim() === '' ? null : parseFloat(securityDeposit),
        rent_due_day: due,
        notes: notes.trim() || null,
      });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save lease');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Edit lease" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && (
          <div className="merr" role="alert">
            {error}
          </div>
        )}
        <div className="fg">
          <label className="fl">Unit</label>
          <select className="fi" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.unit_label}
              </option>
            ))}
            {units.every((u) => u.id !== unitId) && <option value={unitId}>{lease.rental_units?.unit_label || 'Current unit'}</option>}
          </select>
        </div>
        <div className="fg">
          <label className="fl">Tenant</label>
          <select className="fi" value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
            <option value="">— Choose a tenant —</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
            {tenantId && tenants.every((t) => t.id !== tenantId) && (
              <option value={tenantId}>{lease.tenants?.name || 'Current tenant'}</option>
            )}
          </select>
        </div>
        <div className="fr">
          <div className="fg">
            <label className="fl">Start date</label>
            <input className="fi" type="date" value={startDate} onClick={openDatePicker} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="fg">
            <label className="fl">End date</label>
            <input className="fi" type="date" value={endDate} onClick={openDatePicker} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <div className="fr">
          <div className="fg">
            <label className="fl">Monthly rent ($)</label>
            <input className="fi" type="number" min={0} step="0.01" value={monthlyRent} onChange={(e) => { setMonthlyRent(e.target.value); setAllowZero(false); }} />
          </div>
          <div className="fg">
            <label className="fl">Security deposit ($)</label>
            <input className="fi" type="number" min={0} step="0.01" value={securityDeposit} onChange={(e) => setSecurityDeposit(e.target.value)} />
          </div>
          <div className="fg">
            <label className="fl">Rent due day</label>
            <input className="fi" type="number" min={1} max={31} value={rentDueDay} onChange={(e) => setRentDueDay(e.target.value)} />
          </div>
        </div>
        <div className="fg">
          <label className="fl">Notes</label>
          <textarea className="fi" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="ma">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-p" disabled={saving}>
            {saving ? 'Saving…' : 'Save lease'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
