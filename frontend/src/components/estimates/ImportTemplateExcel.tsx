import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import { TEMPLATE_IMPORT_FIELDS, type TemplateImportField, type ImportPreviewResponse, type ImportCommitResponse } from '../../types';

const FIELD_LABELS: Record<TemplateImportField, string> = {
  title: 'Title',
  category: 'Category',
  cost_code: 'Cost Code',
  quantity: 'Quantity',
  unit_cost: 'Unit Cost',
  markup: 'Markup',
  markup_type: 'Markup Type',
  description: 'Description',
  internal_notes: 'Internal Notes',
};

export function ImportTemplateExcel({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [step, setStep] = useState<'upload' | 'map'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [mapping, setMapping] = useState<Record<TemplateImportField, string | null>>(
    Object.fromEntries(TEMPLATE_IMPORT_FIELDS.map((f) => [f, null])) as Record<TemplateImportField, string | null>
  );
  const [error, setError] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [importing, setImporting] = useState(false);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    setFile(f);
    if (f && !name.trim()) {
      setName(f.name.replace(/\.[^.]+$/, ''));
    }
  }

  async function handlePreview(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      setError('Choose a file first.');
      return;
    }
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setLoadingPreview(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await api.postForm<ImportPreviewResponse>('/estimate-templates/import/preview', formData);
      setPreview(result);
      setMapping(result.suggested_mapping);
      setStep('map');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to read that file');
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleCommit() {
    if (!preview) return;
    if (!mapping.title) {
      setError('Map a column to Title before importing.');
      return;
    }
    setImporting(true);
    setError('');
    try {
      const result = await api.post<ImportCommitResponse>('/estimate-templates/import/commit', {
        name: name.trim(),
        category: category.trim() || null,
        description: description.trim() || null,
        mapping,
        rows: preview.rows,
      });
      if (result.dropped.length > 0) {
        // eslint-disable-next-line no-console
        console.warn('Import warnings:', result.dropped);
      }
      onClose();
      navigate(`/estimates/templates/${result.template.id}`, {
        state: result.dropped.length > 0 ? { importDropped: result.dropped } : undefined,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to import that file');
    } finally {
      setImporting(false);
    }
  }

  const previewRows = preview ? preview.rows.slice(0, 8) : [];

  return (
    <Modal title="Import template from Excel" onClose={onClose} wide>
      {error && <div className="merr">{error}</div>}

      {step === 'upload' && (
        <form onSubmit={handlePreview}>
          <div className="fg">
            <label className="fl">Excel file</label>
            <input className="fi" type="file" accept=".xlsx,.xlsm,.xls" onChange={handleFileChange} />
          </div>
          <div className="fg">
            <label className="fl">Template name</label>
            <input className="fi" value={name} onChange={(e) => setName(e.target.value)} placeholder="Bathroom remodel" />
          </div>
          <div className="fg">
            <label className="fl">Category</label>
            <input
              className="fi"
              list="import-template-category-options"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Bathroom, Kitchen, Addition…"
            />
            <datalist id="import-template-category-options">
              <option value="Bathroom" />
              <option value="Kitchen" />
              <option value="Addition" />
              <option value="Full Rehab" />
            </datalist>
          </div>
          <div className="fg">
            <label className="fl">Description</label>
            <textarea className="fi" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional notes about when to use this template…" />
          </div>
          <div className="ma">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-p" disabled={loadingPreview}>
              {loadingPreview ? 'Reading file…' : 'Next: map columns'}
            </button>
          </div>
        </form>
      )}

      {step === 'map' && preview && (
        <>
          <p style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 14 }}>
            Found {preview.row_count} row{preview.row_count !== 1 ? 's' : ''} with columns:{' '}
            {preview.headers.join(', ')}. Map each field to the column it comes from — we guessed based on common
            header names, but you can change any of them. Title is the only one required.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            {TEMPLATE_IMPORT_FIELDS.map((field) => (
              <div className="fg" key={field} style={{ marginBottom: 0 }}>
                <label className="fl">
                  {FIELD_LABELS[field]}
                  {field === 'title' && ' *'}
                </label>
                <select
                  className="fi"
                  value={mapping[field] || ''}
                  onChange={(e) => setMapping((prev) => ({ ...prev, [field]: e.target.value || null }))}
                >
                  <option value="">— Not mapped —</option>
                  {preview.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Preview (first {previewRows.length} rows)</div>
          <div style={{ overflowX: 'auto', marginBottom: 16 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Cost Code</th>
                  <th>Qty</th>
                  <th>Unit Cost</th>
                  <th>Markup</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => (
                  <tr key={i}>
                    <td>{mapping.title ? row[mapping.title] : '—'}</td>
                    <td>{mapping.cost_code ? row[mapping.cost_code] || '—' : '—'}</td>
                    <td>{mapping.quantity ? row[mapping.quantity] || '—' : '—'}</td>
                    <td>{mapping.unit_cost ? row[mapping.unit_cost] || '—' : '—'}</td>
                    <td>
                      {mapping.markup ? row[mapping.markup] || '—' : '—'}
                      {mapping.markup_type ? ` ${row[mapping.markup_type] || ''}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="ma">
            <button type="button" className="btn" onClick={() => setStep('upload')}>
              Back
            </button>
            <button type="button" className="btn btn-p" onClick={handleCommit} disabled={importing}>
              {importing ? 'Importing…' : `Import ${preview.row_count} row${preview.row_count !== 1 ? 's' : ''}`}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
