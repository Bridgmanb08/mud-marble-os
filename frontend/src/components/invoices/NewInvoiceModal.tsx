import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import type { Project } from '../../types';

interface NewInvoiceModalProps {
  onClose: () => void;
  onCreated: () => void;
  defaultProjectId?: string;
}

export function NewInvoiceModal({ onClose, onCreated, defaultProjectId }: NewInvoiceModalProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState(defaultProjectId || '');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceType, setInvoiceType] = useState('progress');
  const [amountDue, setAmountDue] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<Project[]>('/projects').then(setProjects).catch(() => {});
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!projectId) {
      setError('Project is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post('/invoices', {
        project_id: projectId,
        invoice_number: invoiceNumber.trim() || null,
        invoice_type: invoiceType,
        amount_due: parseFloat(amountDue) || 0,
        due_date: dueDate || null,
        notes_external: notes.trim() || null,
      });
      onCreated();
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
        <div className="fr">
          <div className="fg">
            <label className="fl">Invoice number</label>
            <input className="fi" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
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
            <input className="fi" type="number" value={amountDue} onChange={(e) => setAmountDue(e.target.value)} />
          </div>
          <div className="fg">
            <label className="fl">Due date</label>
            <input className="fi" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        <div className="fg">
          <label className="fl">Notes</label>
          <textarea className="fi" value={notes} onChange={(e) => setNotes(e.target.value)} />
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
