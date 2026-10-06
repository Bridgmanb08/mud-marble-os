import { useEffect, useState } from 'react';
import { IconFile, IconTrash } from '@tabler/icons-react';
import { api } from '../../api/client';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { fmt, fmtD } from '../../lib/format';
import { openDatePicker } from '../../lib/datePicker';
import { AutoUploadDropzone } from '../ui/AutoUploadDropzone';
import { uploadRentalFile, fmtBytes } from '../../lib/fileUpload';
import type { DownloadUrlResponse, RentalFile, RentalLease, RentalPayment } from '../../types';

const STATUS_BADGE: Record<string, string> = { due: 'bg-gray', partial: 'bg-amber', paid: 'bg-green' };

export function LeaseRentLedgerModal({ lease, onClose }: { lease: RentalLease; onClose: () => void }) {
  const toast = useToast();
  const [payments, setPayments] = useState<RentalPayment[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [amountPaid, setAmountPaid] = useState('');
  const [paidDate, setPaidDate] = useState('');
  const [files, setFiles] = useState<RentalFile[]>([]);

  function load() {
    api
      .get<RentalPayment[]>(`/rental-leases/${lease.id}/payments`)
      .then(setPayments)
      .catch(() => toast('Failed to load rent ledger', true));
  }

  function loadFiles() {
    api
      .get<RentalFile[]>(`/rental-files?lease_id=${lease.id}`)
      .then(setFiles)
      .catch(() => {});
  }

  useEffect(load, [lease.id]);
  useEffect(loadFiles, [lease.id]);

  // Saved the moment it's dropped -- no separate upload step.
  async function handleFiles(dropped: File[]) {
    let failed = 0;
    for (const file of dropped) {
      try {
        await uploadRentalFile(lease.id, file);
      } catch {
        failed += 1;
      }
    }
    loadFiles();
    if (failed === 0) toast('Document saved');
    else toast('Failed to upload document', true);
  }

  async function downloadFile(f: RentalFile) {
    try {
      const { download_url } = await api.get<DownloadUrlResponse>(`/rental-files/${f.id}/download`);
      window.open(download_url, '_blank', 'noopener');
    } catch {
      toast('Failed to open document', true);
    }
  }

  async function deleteFile(f: RentalFile) {
    try {
      await api.delete(`/rental-files/${f.id}`);
      toast('Document removed');
      loadFiles();
    } catch {
      toast('Failed to remove document', true);
    }
  }

  function startMarkPaid(p: RentalPayment) {
    setEditingId(p.id);
    setAmountPaid(String(p.amount_paid || p.amount_due));
    setPaidDate(p.paid_date || new Date().toISOString().slice(0, 10));
  }

  async function savePaid(p: RentalPayment) {
    try {
      await api.patch(`/rental-payments/${p.id}`, {
        amount_paid: parseFloat(amountPaid) || 0,
        paid_date: paidDate,
        // Status (paid / partial) is worked out from the amounts server-side.
      });
      setEditingId(null);
      toast('Payment recorded');
      load();
    } catch {
      toast('Failed to record payment', true);
    }
  }

  const tenantName = lease.tenants?.name || 'Unknown tenant';
  const unitLabel = lease.rental_units?.unit_label || 'Unit';

  return (
    <Modal title={`Rent ledger — ${tenantName} (${unitLabel})`} onClose={onClose}>
      <div style={{ fontSize: 12.5, color: 'var(--t2)', marginBottom: 12 }}>
        {fmtD(lease.start_date)} – {fmtD(lease.end_date)} · {fmt(lease.monthly_rent)}/mo
      </div>
      {payments === null ? (
        <div className="empty">
          <div className="empty-t">Loading…</div>
        </div>
      ) : payments.length === 0 ? (
        <div className="empty">
          <div className="empty-t">No payment rows yet</div>
        </div>
      ) : (
        <div className="tbl-scroll">
        <table className="tbl tbl-zebra">
          <thead>
            <tr>
              <th className="sticky-col">Due date</th>
              <th>Amount due</th>
              <th>Status</th>
              <th>Paid</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td>
                  {fmtD(p.due_date)}
                  {p.is_late && <span className="badge bg-red" style={{ marginLeft: 6 }}>Late</span>}
                </td>
                <td>{fmt(p.amount_due)}</td>
                <td>
                  <span className={`badge ${STATUS_BADGE[p.status] || 'bg-gray'}`}>{p.status}</span>
                </td>
                <td>
                  {editingId === p.id ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        className="fi"
                        style={{ width: 80 }}
                        type="number"
                        value={amountPaid}
                        onChange={(e) => setAmountPaid(e.target.value)}
                      />
                      <input
                        className="fi"
                        style={{ width: 130 }}
                        type="date"
                        value={paidDate}
                        onClick={openDatePicker}
                        onChange={(e) => setPaidDate(e.target.value)}
                      />
                    </div>
                  ) : p.paid_date ? (
                    `${fmt(p.amount_paid || 0)} on ${fmtD(p.paid_date)}`
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  {editingId === p.id ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                      <button className="btn btn-p btn-sm" onClick={() => savePaid(p)}>
                        Save
                      </button>
                    </div>
                  ) : (
                    <button className="btn btn-sm" onClick={() => startMarkPaid(p)}>
                      {p.status === 'due' ? 'Mark paid' : 'Edit'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
        <div className="ibt" style={{ fontSize: 13, textTransform: 'none', letterSpacing: 0, border: 'none', padding: 0, marginBottom: 10 }}>
          Lease documents
        </div>
        {files.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            {files.map((f) => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12.5 }}>
                <IconFile size={14} color="var(--t3)" />
                <button type="button" className="btn-reset" style={{ color: 'var(--blue)', cursor: 'pointer', flex: 1, textAlign: 'left' }} onClick={() => downloadFile(f)}>
                  {f.file_name}
                </button>
                <span style={{ color: 'var(--t3)' }}>{fmtBytes(f.size_bytes)}</span>
                <button type="button" className="btn-reset" style={{ color: 'var(--red)', cursor: 'pointer' }} onClick={() => deleteFile(f)}>
                  <IconTrash size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
        <AutoUploadDropzone
          multiple
          label="Drop a lease document here, or click to browse -- it saves right away"
          onFiles={handleFiles}
        />
      </div>

      <div className="ma">
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
