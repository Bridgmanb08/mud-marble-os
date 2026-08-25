import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import { openDatePicker } from '../../lib/datePicker';
import type { RentalLease, RentalTenant, RentalUnit } from '../../types';

export function NewRentalLeaseModal({
  units,
  onClose,
  onSaved,
}: {
  units: RentalUnit[];
  onClose: () => void;
  onSaved: (l: RentalLease) => void;
}) {
  const [tenants, setTenants] = useState<RentalTenant[]>([]);
  const [unitId, setUnitId] = useState(units[0]?.id || '');
  const [tenantId, setTenantId] = useState('');
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantEmail, setNewTenantEmail] = useState('');
  const [newTenantPhone, setNewTenantPhone] = useState('');
  const [creatingTenant, setCreatingTenant] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [monthlyRent, setMonthlyRent] = useState('');
  const [securityDeposit, setSecurityDeposit] = useState('');
  const [rentDueDay, setRentDueDay] = useState('1');
  const [error, setError] = useState('');
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
    if (!creatingTenant && !tenantId) {
      setError('Choose a tenant, or add a new one.');
      return;
    }
    if (creatingTenant && !newTenantName.trim()) {
      setError('Tenant name is required.');
      return;
    }
    if (!startDate || !endDate) {
      setError('Start and end dates are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      let finalTenantId = tenantId;
      if (creatingTenant) {
        const created = await api.post<RentalTenant>('/rental-tenants', {
          name: newTenantName.trim(),
          email: newTenantEmail.trim() || null,
          phone: newTenantPhone.trim() || null,
        });
        finalTenantId = created.id;
      }
      const lease = await api.post<RentalLease>('/rental-leases', {
        unit_id: unitId,
        tenant_id: finalTenantId,
        start_date: startDate,
        end_date: endDate,
        monthly_rent: parseFloat(monthlyRent) || 0,
        security_deposit: securityDeposit ? parseFloat(securityDeposit) : null,
        rent_due_day: parseInt(rentDueDay, 10) || 1,
      });
      onSaved(lease);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save lease');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New lease" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div className="merr">{error}</div>}

        <div className="card" style={{ padding: 14, marginBottom: 14 }}>
          <div className="card-section-header">Unit & tenant</div>
          <div className="fg">
            <label className="fl">Unit</label>
            <select className="fi" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.unit_label}
                </option>
              ))}
            </select>
          </div>
          <div className="fg">
            <label className="fl" style={{ display: 'flex', justifyContent: 'space-between' }}>
              Tenant
              <button
                type="button"
                className="btn-reset"
                style={{ color: 'var(--blue)', fontSize: 12, cursor: 'pointer' }}
                onClick={() => setCreatingTenant((v) => !v)}
              >
                {creatingTenant ? 'Choose existing' : '+ New tenant'}
              </button>
            </label>
            {creatingTenant ? (
              <div className="fr">
                <div className="fg">
                  <input className="fi" placeholder="Name" value={newTenantName} onChange={(e) => setNewTenantName(e.target.value)} />
                </div>
                <div className="fg">
                  <input className="fi" placeholder="Email" value={newTenantEmail} onChange={(e) => setNewTenantEmail(e.target.value)} />
                </div>
                <div className="fg">
                  <input className="fi" placeholder="Phone" value={newTenantPhone} onChange={(e) => setNewTenantPhone(e.target.value)} />
                </div>
              </div>
            ) : (
              <select className="fi" value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
                <option value="">— Choose a tenant —</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="card" style={{ padding: 14, marginBottom: 14 }}>
          <div className="card-section-header">Lease terms</div>
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
              <input className="fi" type="number" value={monthlyRent} onChange={(e) => setMonthlyRent(e.target.value)} />
            </div>
            <div className="fg">
              <label className="fl">Security deposit ($)</label>
              <input className="fi" type="number" value={securityDeposit} onChange={(e) => setSecurityDeposit(e.target.value)} />
            </div>
            <div className="fg">
              <label className="fl">Rent due day</label>
              <input className="fi" type="number" min={1} max={31} value={rentDueDay} onChange={(e) => setRentDueDay(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="ma">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-p" disabled={saving}>
            {saving ? 'Saving…' : 'Add lease'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
