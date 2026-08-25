import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import { openDatePicker } from '../../lib/datePicker';
import { fmt } from '../../lib/format';
import type { FinancialSummary, Invoice, Project } from '../../types';

interface NewInvoiceModalProps {
  onClose: () => void;
  onCreated: (invoice: Invoice) => void;
  defaultProjectId?: string;
}

export function NewInvoiceModal({ onClose, onCreated, defaultProjectId }: NewInvoiceModalProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState(defaultProjectId || '');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceType, setInvoiceType] = useState('progress');
  const [amountDue, setAmountDue] = useState('');
  const [amountTouched, setAmountTouched] = useState(false);
  const [financialSummary, setFinancialSummary] = useState<FinancialSummary | null>(null);
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<Project[]>('/projects').then(setProjects).catch(() => {});
  }, []);

  useEffect(() => {
    if (!projectId) {
      setFinancialSummary(null);
      return;
    }
    api
      .get<FinancialSummary>(`/projects/${projectId}/financial-summary`)
      .then((s) => {
        setFinancialSummary(s);
        if (!amountTouched) setAmountDue(s.remaining_to_invoice > 0 ? String(s.remaining_to_invoice) : '');
      })
      .catch(() => setFinancialSummary(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!projectId) {
      setError('Project is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const created = await api.post<Invoice>('/invoices', {
        project_id: projectId,
        invoice_number: invoiceNumber.trim() || null,
        invoice_type: invoiceType,
        amount_due: parseFloat(amountDue) || 0,
        due_date: dueDate || null,
        notes_external: notes.trim() || null,
      });
      onCreated(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create invoice');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Create invoice" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div className="merr">{error}</div>}
        <div className="fg">
          <label className="fl">Project</label>
          <select className="fi" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">— Select project —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name.replace(/\|.*/, '').trim()}
              </option>
            ))}
          </select>
        </div>

        {financialSummary && (
          <div
            className="card"
            style={{ padding: '12px 14px', marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 20, background: 'var(--bg)' }}
          >
            <div>
              <div style={{ fontSize: 10.5, color: 'var(--t2)', textTransform: 'uppercase' }}>Contract total</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{fmt(financialSummary.owner_price)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: 'var(--t2)', textTransform: 'uppercase' }}>Invoiced to date</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{fmt(financialSummary.invoiced_to_date)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: 'var(--t2)', textTransform: 'uppercase' }}>Remaining to invoice</div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: financialSummary.remaining_to_invoice < 0 ? 'var(--red)' : undefined,
                }}
              >
                {fmt(financialSummary.remaining_to_invoice)}
              </div>
            </div>
          </div>
        )}

        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <div className="card-section-header">Invoice details</div>
          <div className="fr">
            <div className="fg">
              <label className="fl">Invoice number</label>
              <input className="fi" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Optional" />
            </div>
            <div className="fg">
              <label className="fl">Type</label>
              <select className="fi" value={invoiceType} onChange={(e) => setInvoiceType(e.target.value)}>
                <option value="deposit">Deposit</option>
                <option value="progress">Progress</option>
                <option value="final">Final</option>
              </select>
            </div>
          </div>
          <div className="fr">
            <div className="fg">
              <label className="fl">Amount due ($)</label>
              <input
                className="fi"
                type="number"
                value={amountDue}
                onChange={(e) => {
                  setAmountTouched(true);
                  setAmountDue(e.target.value);
                }}
              />
              <div className="m-sub">
                Defaulted to what's remaining on the contract. If you build this invoice from specific estimate
                line items afterward, this amount is replaced automatically.
              </div>
            </div>
            <div className="fg">
              <label className="fl">Due date</label>
              <input className="fi" type="date" value={dueDate} onClick={openDatePicker} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div className="fg">
            <label className="fl">Notes</label>
            <textarea className="fi" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="ma">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-p" disabled={saving}>
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
