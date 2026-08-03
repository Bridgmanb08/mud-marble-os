import { useState } from 'react';
import { api, ApiError } from '../../api/client';
import { useToast } from '../ui/Toast';
import { FileDropzone } from '../ui/FileDropzone';
import type { ContractItemRow, ContractorBlock, InHouseSheetPreview, Subcontractor, TransactionSheetRow } from '../../types';

type RowAction = 'add' | 'skip' | 'update';

export function InHouseImportSection({ projectId }: { projectId: string }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<InHouseSheetPreview | null>(null);
  const [txActions, setTxActions] = useState<RowAction[]>([]);
  const [blockChecked, setBlockChecked] = useState<boolean[]>([]);
  const [itemActions, setItemActions] = useState<RowAction[][]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [importedSummary, setImportedSummary] = useState<string | null>(null);

  function handleFileChange(selected: File | null) {
    setFile(selected);
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
      // Conflicting/duplicate rows default to "skip" -- Shannon has to actively
      // opt into overwriting a record with the imported values.
      setTxActions(result.transactions.map((r) => (r.already_present ? 'skip' : 'add')));
      setBlockChecked(result.contractors.map(() => true));
      setItemActions(
        result.contractors.map((block) => block.contract_items.map((item) => (item.already_present ? 'skip' : 'add')))
      );
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
      let txAdded = 0;
      let txUpdated = 0;
      for (let i = 0; i < preview.transactions.length; i++) {
        const row: TransactionSheetRow = preview.transactions[i];
        const action = txActions[i];
        if (action === 'skip') continue;
        const body = {
          project_id: projectId,
          transaction_date: row.date,
          vendor: row.vendor,
          transaction_type: row.transaction_type,
          amount: row.amount,
          payment_source: row.payment_source,
          cost_code_id: row.matched_cost_code_id,
          description: row.description,
        };
        if (action === 'update' && row.existing_id) {
          await api.patch(`/transactions/${row.existing_id}`, body);
          txUpdated++;
        } else {
          await api.post('/transactions', body);
          txAdded++;
        }
      }

      let subsCount = 0;
      let itemsAdded = 0;
      let itemsUpdated = 0;
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
        for (let j = 0; j < block.contract_items.length; j++) {
          const item: ContractItemRow = block.contract_items[j];
          const action = itemActions[i]?.[j];
          if (action === 'skip') continue;
          if (action === 'update' && item.existing_id) {
            await api.patch(`/subcontractor-items/${item.existing_id}`, { amount: item.amount });
            itemsUpdated++;
          } else {
            await api.post(`/projects/${projectId}/subcontractor-items`, {
              subcontractor_id: subcontractorId,
              description: item.description,
              amount: item.amount,
            });
            itemsAdded++;
          }
        }
        for (const payment of block.payments) {
          if (payment.already_present) continue;
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

      const txParts = [];
      if (txAdded) txParts.push(`${txAdded} added`);
      if (txUpdated) txParts.push(`${txUpdated} updated`);
      const itemParts = [];
      if (itemsAdded) itemParts.push(`${itemsAdded} added`);
      if (itemsUpdated) itemParts.push(`${itemsUpdated} updated`);
      setImportedSummary(
        `Transactions: ${txParts.join(', ') || 'none'} · ${subsCount} subcontractor(s) (items: ${itemParts.join(', ') || 'none'}, ${paymentsCount} payment(s)).`
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

  const txToImportCount = txActions.filter((a) => a !== 'skip').length;
  const blockCheckedCount = blockChecked.filter(Boolean).length;

  return (
    <div>
      {!preview ? (
        <div>
          <FileDropzone
            accept=".xlsx,.xlsm,.xls,.pdf,.jpg,.jpeg,.png"
            file={file}
            onFileSelected={handleFileChange}
            label="Drag and drop your In-House sheet (Excel, PDF, or photo) here, or click to browse"
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <button className="btn btn-sm" onClick={handlePreview} disabled={!file || loadingPreview}>
              {loadingPreview ? 'Reading…' : 'Preview'}
            </button>
            {importedSummary && <span style={{ fontSize: 12, color: 'var(--green)' }}>{importedSummary}</span>}
          </div>
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
                disabled={importing || (txToImportCount === 0 && blockCheckedCount === 0)}
              >
                {importing ? 'Importing…' : `Import ${txToImportCount} transaction(s), ${blockCheckedCount} sub(s)`}
              </button>
            </div>
          </div>

          {preview.transactions.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)', textTransform: 'uppercase', margin: '10px 0 4px' }}>
                Transactions ({txToImportCount} to import)
              </div>
              <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
                {preview.transactions.map((row, i) =>
                  row.conflict ? (
                    <div
                      key={i}
                      style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 12.5, background: 'var(--amber-bg, rgba(217,119,6,0.08))' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{row.date} · {row.vendor || row.description || '—'} · ${row.amount.toLocaleString()}</span>
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
                          name={`tx-action-${i}`}
                          checked={txActions[i] === 'skip'}
                          onChange={() => setTxActions((prev) => prev.map((a, idx) => (idx === i ? 'skip' : a)))}
                        />
                        Keep existing
                      </label>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name={`tx-action-${i}`}
                          checked={txActions[i] === 'update'}
                          onChange={() => setTxActions((prev) => prev.map((a, idx) => (idx === i ? 'update' : a)))}
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
                        checked={txActions[i] === 'add'}
                        disabled={row.already_present}
                        onChange={(e) =>
                          setTxActions((prev) => prev.map((a, idx) => (idx === i ? (e.target.checked ? 'add' : 'skip') : a)))
                        }
                      />
                      <span style={{ width: 90, color: 'var(--t2)' }}>{row.date}</span>
                      <span style={{ flex: 1 }}>{row.vendor || row.description || '—'}</span>
                      <span style={{ color: row.transaction_type === 'income' ? 'var(--green)' : 'var(--t2)' }}>
                        ${row.amount.toLocaleString()}
                      </span>
                      {row.already_present && <span style={{ color: 'var(--t3)' }}>already imported</span>}
                    </label>
                  )
                )}
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
                    <div style={{ paddingLeft: 24 }}>
                      {block.contract_items.map((item, j) => {
                        const action = itemActions[i]?.[j];
                        return item.conflict ? (
                          <div key={j} style={{ padding: '4px 0', color: 'var(--t2)', fontSize: 11.5 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>{item.description || '—'}</span>
                              <span style={{ color: 'var(--amber)' }}>doesn't match existing contract item</span>
                            </div>
                            {item.diff.map((d) => (
                              <div key={d.field}>
                                {d.field}: {d.existing ?? '—'} → {d.incoming ?? '—'}
                              </div>
                            ))}
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginRight: 14, cursor: 'pointer' }}>
                              <input
                                type="radio"
                                name={`item-action-${i}-${j}`}
                                checked={action === 'skip'}
                                onChange={() =>
                                  setItemActions((prev) => prev.map((row, ri) => (ri === i ? row.map((a, ci) => (ci === j ? 'skip' : a)) : row)))
                                }
                              />
                              Keep existing
                            </label>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                              <input
                                type="radio"
                                name={`item-action-${i}-${j}`}
                                checked={action === 'update'}
                                onChange={() =>
                                  setItemActions((prev) => prev.map((row, ri) => (ri === i ? row.map((a, ci) => (ci === j ? 'update' : a)) : row)))
                                }
                              />
                              Update with imported value
                            </label>
                          </div>
                        ) : (
                          <label key={j} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0', fontSize: 11.5, opacity: item.already_present ? 0.5 : 1, cursor: item.already_present ? 'default' : 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={action === 'add'}
                              disabled={item.already_present}
                              onChange={(e) =>
                                setItemActions((prev) =>
                                  prev.map((row, ri) => (ri === i ? row.map((a, ci) => (ci === j ? (e.target.checked ? 'add' : 'skip') : a)) : row))
                                )
                              }
                            />
                            <span style={{ flex: 1 }}>{item.description || '—'}</span>
                            <span>${item.amount.toLocaleString()}</span>
                            {item.already_present && <span style={{ color: 'var(--t3)' }}>already on contract</span>}
                          </label>
                        );
                      })}
                    </div>
                    <div style={{ paddingLeft: 24, color: 'var(--t2)', fontSize: 11.5, marginTop: 2 }}>
                      {block.payments.filter((p) => !p.already_present).length} payment(s) to import
                      {block.payments.some((p) => p.already_present) &&
                        ` (${block.payments.filter((p) => p.already_present).length} already recorded)`}
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
