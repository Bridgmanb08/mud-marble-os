import { useState } from 'react';
import { api, ApiError } from '../../api/client';
import { useToast } from '../ui/Toast';
import { FileDropzone } from '../ui/FileDropzone';
import { openDatePicker } from '../../lib/datePicker';
import type { InvoiceScanPreview } from '../../types';

type Action = 'add' | 'skip' | 'update';

interface FormState {
  invoice_number: string;
  invoice_type: string;
  amount_due: string;
  due_date: string;
  notes_external: string;
}

export function InvoiceImportSection({ projectId, onImported }: { projectId: string; onImported: () => void }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<InvoiceScanPreview | null>(null);
  const [action, setAction] = useState<Action>('add');
  const [form, setForm] = useState<FormState>({ invoice_number: '', invoice_type: 'progress', amount_due: '', due_date: '', notes_external: '' });
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  function handleFileChange(selected: File | null) {
    setFile(selected);
    setPreview(null);
    setError('');
  }

  async function handlePreview() {
    if (!file) {
      setError('Choose a file first.');
      return;
    }
    setLoadingPreview(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await api.postForm<InvoiceScanPreview>(`/job-import/${projectId}/invoice-scan/preview`, formData);
      setPreview(result);
      setForm({
        invoice_number: result.row.invoice_number || '',
        invoice_type: result.row.invoice_type,
        amount_due: String(result.row.amount_due),
        due_date: result.row.due_date || '',
        notes_external: result.row.notes_external || '',
      });
      // Conflicting rows default to "skip" (keep the existing record) -- the
      // reviewer has to actively opt into overwriting it with scanned values.
      setAction(result.row.already_present ? 'skip' : 'add');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to read that file');
    } finally {
      setLoadingPreview(false);
    }
  }

  function isUncertain(field: string) {
    return preview?.row.uncertain_fields.includes(field) ?? false;
  }

  function reset() {
    setPreview(null);
    setFile(null);
  }

  async function handleImport() {
    if (!preview || action === 'skip') return;
    setImporting(true);
    setError('');
    try {
      const body = {
        project_id: projectId,
        invoice_number: form.invoice_number.trim() || null,
        invoice_type: form.invoice_type,
        amount_due: parseFloat(form.amount_due) || 0,
        due_date: form.due_date || null,
        notes_external: form.notes_external.trim() || null,
      };
      if (action === 'update' && preview.row.existing_id) {
        await api.patch(`/invoices/${preview.row.existing_id}`, body);
        toast('Invoice updated');
      } else {
        await api.post('/invoices', body);
        toast('Invoice added');
      }
      reset();
      onImported();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to import invoice');
    } finally {
      setImporting(false);
    }
  }

  const readOnly = preview?.row.already_present && !preview.row.conflict;

  return (
    <div>
      {!preview ? (
        <div>
          <FileDropzone
            accept=".xlsx,.xlsm,.xls,.pdf,.jpg,.jpeg,.png"
            file={file}
            onFileSelected={handleFileChange}
            label="Drag and drop an invoice (Excel, PDF, or photo) here, or click to browse"
          />
          <div style={{ marginTop: 10 }}>
            <button className="btn btn-sm" onClick={handlePreview} disabled={!file || loadingPreview}>
              {loadingPreview ? 'Reading…' : 'Preview'}
            </button>
          </div>
        </div>
      ) : (
        <div>
          {preview.row.confidence === 'low' && (
            <div style={{ fontSize: 12, color: 'var(--amber)', marginBottom: 8 }}>
              Low confidence on this read -- double check the flagged field(s) below before importing.
            </div>
          )}
          {readOnly ? (
            <div style={{ fontSize: 12.5, color: 'var(--t2)', marginBottom: 10 }}>
              This matches invoice {preview.row.invoice_number ? `#${preview.row.invoice_number}` : 'already on file'} -- nothing to import.
            </div>
          ) : (
            <>
              {preview.row.conflict && (
                <div
                  style={{
                    padding: '8px 10px',
                    marginBottom: 10,
                    borderRadius: 'var(--r)',
                    background: 'var(--amber-bg, rgba(217,119,6,0.08))',
                    fontSize: 12.5,
                  }}
                >
                  <div style={{ color: 'var(--amber)', fontWeight: 500, marginBottom: 4 }}>
                    Doesn't match existing invoice #{preview.row.invoice_number}
                  </div>
                  {preview.row.diff.map((d) => (
                    <div key={d.field} style={{ color: 'var(--t2)' }}>
                      {d.field}: {d.existing ?? '—'} → {d.incoming ?? '—'}
                    </div>
                  ))}
                  <div style={{ marginTop: 6 }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginRight: 14, cursor: 'pointer' }}>
                      <input type="radio" name="invoice-action" checked={action === 'skip'} onChange={() => setAction('skip')} />
                      Keep existing
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                      <input type="radio" name="invoice-action" checked={action === 'update'} onChange={() => setAction('update')} />
                      Update with corrected values
                    </label>
                  </div>
                </div>
              )}
              <div className="fr">
                <div className="fg">
                  <label className="fl">Invoice number</label>
                  <input
                    className="fi"
                    value={form.invoice_number}
                    onChange={(e) => setForm((f) => ({ ...f, invoice_number: e.target.value }))}
                  />
                </div>
                <div className="fg">
                  <label className="fl">
                    Type {isUncertain('invoice_type') && <span style={{ color: 'var(--amber)' }}>(uncertain)</span>}
                  </label>
                  <select className="fi" value={form.invoice_type} onChange={(e) => setForm((f) => ({ ...f, invoice_type: e.target.value }))}>
                    <option value="deposit">Deposit</option>
                    <option value="progress">Progress</option>
                    <option value="final">Final</option>
                    <option value="retainage">Retainage</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div className="fr">
                <div className="fg">
                  <label className="fl">
                    Amount due ($) {isUncertain('amount_due') && <span style={{ color: 'var(--amber)' }}>(uncertain)</span>}
                  </label>
                  <input
                    className="fi"
                    type="number"
                    value={form.amount_due}
                    onChange={(e) => setForm((f) => ({ ...f, amount_due: e.target.value }))}
                  />
                </div>
                <div className="fg">
                  <label className="fl">
                    Due date {isUncertain('due_date') && <span style={{ color: 'var(--amber)' }}>(uncertain)</span>}
                  </label>
                  <input
                    className="fi"
                    type="date"
                    value={form.due_date}
                    onClick={openDatePicker}
                    onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                  />
                </div>
              </div>
              <div className="fg">
                <label className="fl">Notes</label>
                <textarea className="fi" value={form.notes_external} onChange={(e) => setForm((f) => ({ ...f, notes_external: e.target.value }))} />
              </div>
            </>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn btn-sm" onClick={reset} disabled={importing}>
              Cancel
            </button>
            {!readOnly && (
              <button className="btn btn-p btn-sm" onClick={handleImport} disabled={importing || action === 'skip'}>
                {importing ? 'Saving…' : action === 'update' ? 'Update invoice' : 'Add invoice'}
              </button>
            )}
          </div>
        </div>
      )}
      {error && <div className="merr" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  );
}
