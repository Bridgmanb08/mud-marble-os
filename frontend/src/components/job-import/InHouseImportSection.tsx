import { useState, type ChangeEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { useToast } from '../ui/Toast';
import type { ContractorBlock, InHouseSheetPreview, Subcontractor, TransactionSheetRow } from '../../types';

export function InHouseImportSection({ projectId }: { projectId: string }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<InHouseSheetPreview | null>(null);
  const [txChecked, setTxChecked] = useState<boolean[]>([]);
  const [blockChecked, setBlockChecked] = useState<boolean[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [importedSummary, setImportedSummary] = useState<string | null>(null);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] || null);
    setPreview(null);
    setError('');
    setImportedSummary(null);
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
      const result = await api.postForm<InHouseSheetPreview>(`/job-import/${projectId}/inhouse-sheet/preview`, formData);
      setPreview(result);
      setTxChecked(result.transactions.map((r) => !r.already_present));
      setBlockChecked(result.contractors.map(() => true));
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
      let txCount = 0;
      for (let i = 0; i < preview.transactions.length; i++) {
        if (!txChecked[i]) continue;
        const row: TransactionSheetRow = preview.transactions[i];
        await api.post('/transactions', {
          project_id: projectId,
          transaction_date: row.date,
          vendor: row.vendor,
          transaction_type: row.transaction_type,
          amount: row.amount,
          payment_source: row.payment_source,
          cost_code_id: row.matched_cost_code_id,
          description: row.description,
        });
        txCount++;
      }

      let subsCount = 0;
      let itemsCount = 0;
      let paymentsCount = 0;
      for (let i = 0; i < preview.contractors.length; i++) {
        if (!blockChecked[i]) continue;
        const block: ContractorBlock = preview.contractors[i];
        let subcontractorId = block.matched_subcontractor_id;
        if (!subcontractorId) {
          const created = await api.post<Subcontractor>('/subcontractors', { company_name: block.subcontractor_name });
          subcontractorId = created.id;
        }
        subsCount++;
        for (const item of block.contract_items) {
          await api.post(`/projects/${projectId}/subcontractor-items`, {
            subcontractor_id: subcontractorId,
            description: item.description,
            amount: item.amount,
          });
          itemsCount++;
        }
        for (const payment of block.payments) {
          await api.post('/transactions', {
            project_id: projectId,
            transaction_date: payment.date,
            vendor: block.subcontractor_name,
            transaction_type: 'expense',
            amount: -Math.abs(payment.amount),
            payment_source: payment.category,
            subcontractor_id: subcontractorId,
            description: `Payment to ${block.subcontractor_name}`,
          });
          paymentsCount++;
        }
      }

      setImportedSummary(
        `Imported ${txCount} transaction(s), ${subsCount} subcontractor(s) (${itemsCount} contract item(s), ${paymentsCount} payment(s)).`
      );
      setPreview(null);
      setFile(null);
      toast('In-House sheet imported');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to import in-house sheet');
    } finally {
      setImporting(false);
    }
  }

  const txCheckedCount = txChecked.filter(Boolean).length;
  const blockCheckedCount = blockChecked.filter(Boolean).length;

  return (
    <div>
      {!preview ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="file" accept=".xlsx,.xlsm,.xls" onChange={handleFileChange} />
          <button className="btn btn-sm" onClick={handlePreview} disabled={!file || loadingPreview}>
            {loadingPreview ? 'Reading…' : 'Preview'}
          </button>
          {importedSummary && <span style={{ fontSize: 12, color: 'var(--green)' }}>{importedSummary}</span>}
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--t2)' }}>
              {preview.transactions.length} transaction(s), {preview.contractors.length} subcontractor(s) found
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-sm" onClick={() => setPreview(null)} disabled={importing}>
                Cancel
              </button>
              <button
                className="btn btn-p btn-sm"
                onClick={handleImport}
                disabled={importing || (txCheckedCount === 0 && blockCheckedCount === 0)}
              >
                {importing ? 'Importing…' : `Import ${txCheckedCount} transaction(s), ${blockCheckedCount} sub(s)`}
              </button>
            </div>
          </div>

          {preview.transactions.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)', textTransform: 'uppercase', margin: '10px 0 4px' }}>
                Transactions ({txCheckedCount} checked)
              </div>
              <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
                {preview.transactions.map((row, i) => (
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
                      checked={txChecked[i] || false}
                      onChange={(e) => setTxChecked((prev) => prev.map((c, idx) => (idx === i ? e.target.checked : c)))}
                    />
                    <span style={{ width: 90, color: 'var(--t2)' }}>{row.date}</span>
                    <span style={{ flex: 1 }}>{row.vendor || row.description || '—'}</span>
                    <span style={{ color: row.transaction_type === 'income' ? 'var(--green)' : 'var(--t2)' }}>
                      ${row.amount.toLocaleString()}
                    </span>
                    {row.already_present && <span style={{ color: 'var(--t3)' }}>already imported</span>}
                  </label>
                ))}
              </div>
            </>
          )}

          {preview.contractors.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)', textTransform: 'uppercase', margin: '14px 0 4px' }}>
                Subcontractors ({blockCheckedCount} checked)
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
                {preview.contractors.map((block, i) => (
                  <div key={i} style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 12.5 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 4 }}>
                      <input
                        type="checkbox"
                        checked={blockChecked[i] || false}
                        onChange={(e) => setBlockChecked((prev) => prev.map((c, idx) => (idx === i ? e.target.checked : c)))}
                      />
                      <span style={{ fontWeight: 500 }}>{block.subcontractor_name}</span>
                      {!block.matched_subcontractor_id && (
                        <span style={{ color: 'var(--amber)', fontSize: 11 }}>will create new subcontractor</span>
                      )}
                    </label>
                    <div style={{ paddingLeft: 24, color: 'var(--t2)', fontSize: 11.5 }}>
                      {block.contract_items.length} contract item(s), {block.payments.length} payment(s)
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      {error && <div className="merr" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  );
}
