import { useEffect, useRef, useState, type FormEvent } from 'react';
import { IconFile, IconX } from '@tabler/icons-react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { AutoUploadDropzone } from '../ui/AutoUploadDropzone';
import { openDatePicker } from '../../lib/datePicker';
import { attachRentalFileToLease, fmtBytes, uploadRentalPropertyFile } from '../../lib/fileUpload';
import type { RentalFile, RentalLease, RentalTenant, RentalUnit } from '../../types';

// Adds a lease (and, if needed, the tenant on it). The lease document is
// uploaded and saved the moment it's dropped; saving the lease then attaches
// it. Backing out without saving the lease removes the uploads again, since
// there's no lease for them to belong to.
export type LeaseUnit = Pick<RentalUnit, 'id' | 'property_id' | 'unit_label'>;

export function NewRentalLeaseModal({
  units,
  startWithNewTenant = false,
  onClose,
  onSaved,
}: {
  units: LeaseUnit[];
  /** Open with the "new tenant" form showing -- used when adding a tenant to a specific unit. */
  startWithNewTenant?: boolean;
  onClose: () => void;
  onSaved: (l: RentalLease) => void;
}) {
  const toast = useToast();
  const [tenants, setTenants] = useState<RentalTenant[]>([]);
  const [unitId, setUnitId] = useState(units[0]?.id || '');
  const [tenantId, setTenantId] = useState('');
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantEmail, setNewTenantEmail] = useState('');
  const [newTenantPhone, setNewTenantPhone] = useState('');
  const [newTenantNotes, setNewTenantNotes] = useState('');
  const [docs, setDocs] = useState<RentalFile[]>([]);
  const savedRef = useRef(false);
  const [creatingTenant, setCreatingTenant] = useState(startWithNewTenant);
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

  async function handleFiles(dropped: File[]) {
    const propertyId = units.find((u) => u.id === unitId)?.property_id || units[0]?.property_id;
    if (!propertyId) {
      toast('Add a unit first', true);
      return;
    }
    for (const file of dropped) {
      try {
        const saved = await uploadRentalPropertyFile(propertyId, file);
        setDocs((prev) => [...prev, saved]);
      } catch {
        toast(`Failed to upload ${file.name}`, true);
      }
    }
  }

  async function removeDoc(d: RentalFile) {
    setDocs((prev) => prev.filter((x) => x.id !== d.id));
    try {
      await api.delete(`/rental-files/${d.id}`);
    } catch {
      toast('Failed to remove document', true);
    }
  }

  function handleClose() {
    if (!savedRef.current) {
      for (const d of docs) api.delete(`/rental-files/${d.id}`).catch(() => {});
    }
    onClose();
  }

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
          notes: newTenantNotes.trim() || null,
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
      savedRef.current = true;
      const attachResults = await Promise.allSettled(docs.map((d) => attachRentalFileToLease(d.id, lease.id)));
      if (attachResults.some((r) => r.status === 'rejected')) {
        toast('Lease saved, but a document could not be attached -- add it again from the rent ledger', true);
      }
      onSaved(lease);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save lease');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={startWithNewTenant ? 'Add tenant' : 'New lease'} onClose={handleClose}>
      <form onSubmit={handleSubmit}>
        {error && <div className="merr">{error}</div>}

        <div className="card" style={{ padding: 14, marginBottom: 14 }}>
          <div className="card-section-header">Lease document</div>
          {docs.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              {docs.map((d) => (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12.5 }}>
                  <IconFile size={14} color="var(--t3)" />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.file_name}</span>
                  <span style={{ color: 'var(--t3)' }}>{fmtBytes(d.size_bytes)}</span>
                  <button type="button" className="btn-reset" style={{ color: 'var(--red)', cursor: 'pointer', display: 'inline-flex' }} onClick={() => removeDoc(d)} title="Remove" aria-label={`Remove ${d.file_name}`}>
                    <IconX size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <AutoUploadDropzone
            multiple
            label="Drop the lease here, or click to browse -- it uploads right away"
            onFiles={handleFiles}
          />
        </div>

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
                <div className="fg" style={{ flexBasis: '100%' }}>
                  <input className="fi" placeholder="Notes (optional)" value={newTenantNotes} onChange={(e) => setNewTenantNotes(e.target.value)} />
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
          <button type="button" className="btn" onClick={handleClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-p" disabled={saving}>
            {saving ? 'Saving…' : startWithNewTenant ? 'Add tenant' : 'Add lease'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
