import { useState } from 'react';
import { api, ApiError } from '../../api/client';
import { useToast } from '../ui/Toast';
import { FileDropzone } from '../ui/FileDropzone';
import type { ChangeOrderScanPreview } from '../../types';

type Action = 'add' | 'skip' | 'update';

interface FormState {
  title: string;
  co_type: string;
  owner_price: string;
  builder_cost: string;
  description: string;
  discovered_by: string;
}

export function ChangeOrderImportSection({ projectId, onImported }: { projectId: string; onImported: () => void }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ChangeOrderScanPreview | null>(null);
  const [action, setAction] = useState<Action>('add');
  const [form, setForm] = useState<FormState>({
    title: '',
    co_type: 'client_addition',
    owner_price: '',
    builder_cost: '',
    description: '',
    discovered_by: '',
  });
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
      const result = await api.postForm<ChangeOrderScanPreview>(`/job-import/${projectId}/change-order-scan/preview`, formData);
      setPreview(result);
      setForm({
        title: result.row.title,
        co_type: result.row.co_type,
        owner_price: String(result.row.owner_price),
        builder_cost: String(result.row.builder_cost),
        description: result.row.description || '',
        discovered_by: result.row.discovered_by || '',
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
      if (action === 'update' && preview.row.existing_id) {
        await api.patch(`/change-orders/${preview.row.existing_id}`, {
          title: form.title.trim(),
          co_type: form.co_type,
          owner_price: parseFloat(form.owner_price) || 0,
          builder_cost: parseFloat(form.builder_cost) || 0,
          description: form.description.trim() || null,
          discovered_by: form.discovered_by.trim() || null,
        });
        toast('Change order updated');
      } else {
        await api.post('/change-orders', {
          project_id: projectId,
          title: form.title.trim(),
          co_type: form.co_type,
          owner_price: parseFloat(form.owner_price) || 0,
          builder_cost: parseFloat(form.builder_cost) || 0,
          description: form.description.trim() || null,
          discovered_by: form.discovered_by.trim() || null,
        });
        toast('Change order added');
      }
      reset();
      onImported();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to import change order');
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
            accept=".pdf,.jpg,.jpeg,.png"
            file={file}
            onFileSelected={handleFileChange}
            label="Drag and drop a photographed or scanned change order (PDF, JPEG, or PNG) here, or click to browse"
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
              This matches "{preview.row.title}" already on file -- nothing to import.
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
                    Doesn't match existing change order "{preview.row.title}"
                  </div>
                  {preview.row.diff.map((d) => (
                    <div key={d.field} style={{ color: 'var(--t2)' }}>
                      {d.field}: {d.existing ?? '—'} → {d.incoming ?? '—'}
                    </div>
                  ))}
                  <div style={{ marginTop: 6 }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginRight: 14, cursor: 'pointer' }}>
                      <input type="radio" name="co-action" checked={action === 'skip'} onChange={() => setAction('skip')} />
                      Keep existing
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                      <input type="radio" name="co-action" checked={action === 'update'} onChange={() => setAction('update')} />
                      Update with corrected values
                    </label>
                  </div>
                </div>
              )}
              <div className="fg">
                <label className="fl">
                  Title {isUncertain('title') && <span style={{ color: 'var(--amber)' }}>(uncertain)</span>}
                </label>
                <input className="fi" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="fr">
                <div className="fg">
                  <label className="fl">
                    Type {isUncertain('co_type') && <span style={{ color: 'var(--amber)' }}>(uncertain)</span>}
                  </label>
                  <select className="fi" value={form.co_type} onChange={(e) => setForm((f) => ({ ...f, co_type: e.target.value }))}>
                    <option value="client_addition">Client addition</option>
                    <option value="selection_upgrade">Selection upgrade</option>
                    <option value="field_condition">Field condition</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="fg">
                  <label className="fl">Discovered by</label>
                  <input
                    className="fi"
                    value={form.discovered_by}
                    onChange={(e) => setForm((f) => ({ ...f, discovered_by: e.target.value }))}
                  />
                </div>
              </div>
              <div className="fr">
                <div className="fg">
                  <label className="fl">
                    Owner price ($) {isUncertain('owner_price') && <span style={{ color: 'var(--amber)' }}>(uncertain)</span>}
                  </label>
                  <input
                    className="fi"
                    type="number"
                    value={form.owner_price}
                    onChange={(e) => setForm((f) => ({ ...f, owner_price: e.target.value }))}
                  />
                </div>
                <div className="fg">
                  <label className="fl">
                    Builder cost ($) {isUncertain('builder_cost') && <span style={{ color: 'var(--amber)' }}>(uncertain)</span>}
                  </label>
                  <input
                    className="fi"
                    type="number"
                    value={form.builder_cost}
                    onChange={(e) => setForm((f) => ({ ...f, builder_cost: e.target.value }))}
                  />
                </div>
              </div>
              <div className="fg">
                <label className="fl">Description</label>
                <textarea className="fi" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
            </>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn btn-sm" onClick={reset} disabled={importing}>
              Cancel
            </button>
            {!readOnly && (
              <button className="btn btn-p btn-sm" onClick={handleImport} disabled={importing || action === 'skip'}>
                {importing ? 'Saving…' : action === 'update' ? 'Update change order' : 'Add change order'}
              </button>
            )}
          </div>
        </div>
      )}
      {error && <div className="merr" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  );
}
