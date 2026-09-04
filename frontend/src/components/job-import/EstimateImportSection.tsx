import { useState } from 'react';
import { api, ApiError } from '../../api/client';
import { useToast } from '../ui/Toast';
import { FileDropzone } from '../ui/FileDropzone';
import { resolveImportAction } from '../../lib/importConflicts';
import type { Estimate, EstimateSheetPreview, EstimateSheetRow } from '../../types';

type RowAction = 'add' | 'skip' | 'update';

export function EstimateImportSection({ projectId }: { projectId: string }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<EstimateSheetPreview | null>(null);
  const [actions, setActions] = useState<RowAction[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [importedCount, setImportedCount] = useState<number | null>(null);

  function handleFileChange(selected: File | null) {
    setFile(selected);
    setPreview(null);
    setError('');
    setImportedCount(null);
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
      const result = await api.postForm<EstimateSheetPreview>(`/job-import/${projectId}/estimate-sheet/preview`, formData);
      setPreview(result);
      // Conflicting rows default to "skip" (keep the existing record) -- Shannon
      // has to actively opt into overwriting a record with the imported values --
      // UNLESS every differing field is blank on the existing record, in which
      // case "update" only fills in what was missing, never overwrites real data.
      setActions(result.rows.map(resolveImportAction));
      if (result.dropped_count > 0) {
        toast(`${result.dropped_count} row(s) couldn't be read clearly and were skipped`, true);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to read that file');
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleImport() {
    if (!preview) return;
    setImporting(true);
    setError('');
    try {
      let estimateId = preview.existing_estimate_id;
      if (!estimateId) {
        const created = await api.post<Estimate>('/estimates', {
          project_id: projectId,
          version: 1,
          status: 'draft',
          pm_fee_total: 0,
        });
        estimateId = created.id;
      }
      let addedCount = 0;
      let updatedCount = 0;
      for (let i = 0; i < preview.rows.length; i++) {
        const row: EstimateSheetRow = preview.rows[i];
        const action = actions[i];
        if (action === 'skip') continue;
        const body = {
          cost_code_id: row.matched_cost_code_id,
          bucket: row.bucket,
          title: row.title,
          description: row.description,
          quantity: row.quantity,
          unit_cost: row.unit_cost,
          cost_type: 'none',
          markup_type: row.markup_type,
          markup_value: row.markup_value,
          notes_external: row.description,
          notes_internal: row.internal_notes,
        };
        if (action === 'update' && row.existing_id) {
          await api.patch(`/estimates/${estimateId}/items/${row.existing_id}`, body);
          updatedCount++;
        } else {
          await api.post(`/estimates/${estimateId}/items`, body);
          addedCount++;
        }
      }
      setImportedCount(addedCount + updatedCount);
      setPreview(null);
      setFile(null);
      const parts = [];
      if (addedCount) parts.push(`added ${addedCount}`);
      if (updatedCount) parts.push(`updated ${updatedCount}`);
      toast(parts.length ? `Imported: ${parts.join(', ')} line item(s)` : 'Nothing to import');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to import estimate');
    } finally {
      setImporting(false);
    }
  }

  const toImportCount = actions.filter((a) => a !== 'skip').length;

  return (
    <div>
      {!preview ? (
        <div>
          <FileDropzone
            accept=".xlsx,.xlsm,.xls,.pdf,.jpg,.jpeg,.png"
            file={file}
            onFileSelected={handleFileChange}
            label="Drag and drop your Estimate sheet (Excel, PDF, or photo) here, or click to browse"
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <button className="btn btn-sm" onClick={handlePreview} disabled={!file || loadingPreview}>
              {loadingPreview ? 'Reading…' : 'Preview'}
            </button>
            {importedCount !== null && (
              <span style={{ fontSize: 12, color: 'var(--green)' }}>Imported {importedCount} line item(s).</span>
            )}
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--t2)' }}>
              {preview.rows.length} row{preview.rows.length === 1 ? '' : 's'} found · {toImportCount} to import
              {preview.existing_estimate_id ? ' · adding to existing draft estimate' : ' · will create a new draft estimate'}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-sm" onClick={() => setPreview(null)} disabled={importing}>
                Cancel
              </button>
              <button className="btn btn-p btn-sm" onClick={handleImport} disabled={importing || toImportCount === 0}>
                {importing ? 'Importing…' : `Import ${toImportCount}`}
              </button>
            </div>
          </div>
          <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
            {preview.rows.map((row, i) =>
              row.conflict ? (
                <div
                  key={i}
                  style={{
                    padding: '8px 10px',
                    borderBottom: '1px solid var(--border)',
                    fontSize: 12.5,
                    background: 'var(--amber-bg, rgba(217,119,6,0.08))',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 500 }}>{row.title}</span>
                    <span style={{ color: 'var(--amber)', fontSize: 11 }}>doesn't match existing record</span>
                  </div>
                  <div style={{ color: 'var(--t2)', margin: '4px 0' }}>
                    {row.diff.map((d) => (
                      <div key={d.field}>
                        {d.field}: {d.existing ?? '—'} → {d.incoming ?? '—'}
                      </div>
                    ))}
                  </div>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginRight: 14, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name={`estimate-action-${i}`}
                      checked={actions[i] === 'skip'}
                      onChange={() => setActions((prev) => prev.map((a, idx) => (idx === i ? 'skip' : a)))}
                    />
                    Keep existing
                  </label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name={`estimate-action-${i}`}
                      checked={actions[i] === 'update'}
                      onChange={() => setActions((prev) => prev.map((a, idx) => (idx === i ? 'update' : a)))}
                    />
                    Update with imported values
                  </label>
                </div>
              ) : (
                <label
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '6px 10px',
                    borderBottom: '1px solid var(--border)',
                    fontSize: 12.5,
                    opacity: row.already_present ? 0.5 : 1,
                    cursor: row.already_present ? 'default' : 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={actions[i] === 'add'}
                    disabled={row.already_present}
                    onChange={(e) =>
                      setActions((prev) => prev.map((a, idx) => (idx === i ? (e.target.checked ? 'add' : 'skip') : a)))
                    }
                  />
                  <span style={{ flex: 1 }}>{row.title}</span>
                  <span style={{ color: 'var(--t2)' }}>{row.quantity} × ${row.unit_cost.toLocaleString()}</span>
                  {row.already_present && <span style={{ color: 'var(--t3)' }}>already imported</span>}
                  {row.cost_code && !row.matched_cost_code_id && (
                    <span style={{ color: 'var(--amber)' }}>code "{row.cost_code}" not matched</span>
                  )}
                </label>
              )
            )}
          </div>
        </div>
      )}
      {error && <div className="merr" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  );
}
