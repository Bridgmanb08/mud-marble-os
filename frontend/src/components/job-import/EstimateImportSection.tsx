import { useState, type ChangeEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { useToast } from '../ui/Toast';
import type { Estimate, EstimateSheetPreview, EstimateSheetRow } from '../../types';

export function EstimateImportSection({ projectId }: { projectId: string }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<EstimateSheetPreview | null>(null);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [importedCount, setImportedCount] = useState<number | null>(null);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] || null);
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
      setChecked(result.rows.map((r) => !r.already_present));
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
      let count = 0;
      for (let i = 0; i < preview.rows.length; i++) {
        if (!checked[i]) continue;
        const row: EstimateSheetRow = preview.rows[i];
        await api.post(`/estimates/${estimateId}/items`, {
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
        });
        count++;
      }
      setImportedCount(count);
      setPreview(null);
      setFile(null);
      toast(`Imported ${count} line item${count === 1 ? '' : 's'}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to import estimate');
    } finally {
      setImporting(false);
    }
  }

  const checkedCount = checked.filter(Boolean).length;

  return (
    <div>
      {!preview ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="file" accept=".xlsx,.xlsm,.xls" onChange={handleFileChange} />
          <button className="btn btn-sm" onClick={handlePreview} disabled={!file || loadingPreview}>
            {loadingPreview ? 'Reading…' : 'Preview'}
          </button>
          {importedCount !== null && (
            <span style={{ fontSize: 12, color: 'var(--green)' }}>Imported {importedCount} line item(s).</span>
          )}
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--t2)' }}>
              {preview.rows.length} row{preview.rows.length === 1 ? '' : 's'} found · {checkedCount} checked
              {preview.existing_estimate_id ? ' · adding to existing draft estimate' : ' · will create a new draft estimate'}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-sm" onClick={() => setPreview(null)} disabled={importing}>
                Cancel
              </button>
              <button className="btn btn-p btn-sm" onClick={handleImport} disabled={importing || checkedCount === 0}>
                {importing ? 'Importing…' : `Import ${checkedCount} checked`}
              </button>
            </div>
          </div>
          <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
            {preview.rows.map((row, i) => (
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
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked[i] || false}
                  onChange={(e) =>
                    setChecked((prev) => prev.map((c, idx) => (idx === i ? e.target.checked : c)))
                  }
                />
                <span style={{ flex: 1 }}>{row.title}</span>
                <span style={{ color: 'var(--t2)' }}>{row.quantity} × ${row.unit_cost.toLocaleString()}</span>
                {row.already_present && <span style={{ color: 'var(--t3)' }}>already imported</span>}
                {row.cost_code && !row.matched_cost_code_id && (
                  <span style={{ color: 'var(--amber)' }}>code "{row.cost_code}" not matched</span>
                )}
              </label>
            ))}
          </div>
        </div>
      )}
      {error && <div className="merr" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  );
}
