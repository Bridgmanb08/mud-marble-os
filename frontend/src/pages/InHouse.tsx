import { useEffect, useState } from 'react';
import { IconPlus, IconTable } from '@tabler/icons-react';
import { api } from '../api/client';
import { useToast } from '../components/ui/Toast';
import { fmt, fmtD } from '../lib/format';
import type { Transaction } from '../types';
import { NewTransactionModal } from '../components/inhouse/NewTransactionModal';

export default function InHouse() {
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [showNew, setShowNew] = useState(false);
  const toast = useToast();

  async function load() {
    try {
      const data = await api.get<Transaction[]>('/transactions');
      setTransactions(data);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load transactions', true);
      setTransactions([]);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const income = transactions?.filter((t) => t.transaction_type === 'income').reduce((s, t) => s + Math.abs(t.amount), 0) ?? 0;
  const expense = transactions?.filter((t) => t.transaction_type === 'expense').reduce((s, t) => s + Math.abs(t.amount), 0) ?? 0;
  const unsynced = transactions?.filter((t) => !t.quickbooks_synced).length ?? 0;

  return (
    <>
      <div className="ph">
        <div>
          <h1>In-House Sheet</h1>
          <p>All transactions across projects</p>
        </div>
        <button className="btn btn-p btn-sm" onClick={() => setShowNew(true)}>
          <IconPlus size={14} /> Add transaction
        </button>
      </div>

      <div className="metrics">
        <div className="metric">
          <div className="m-label">Income</div>
          <div className="m-val" style={{ color: 'var(--green)' }}>
            {fmt(income)}
          </div>
        </div>
        <div className="metric">
          <div className="m-label">Expenses</div>
          <div className="m-val" style={{ color: 'var(--red)' }}>
            {fmt(expense)}
          </div>
        </div>
        <div className="metric">
          <div className="m-label">Net</div>
          <div className="m-val">{fmt(income - expense)}</div>
        </div>
        <div className="metric">
          <div className="m-label">Unsynced to QuickBooks</div>
          <div className="m-val" style={{ color: unsynced ? 'var(--atx)' : undefined }}>
            {unsynced}
          </div>
        </div>
      </div>

      <div className="card">
        {transactions === null ? (
          <div className="empty">
            <div className="empty-t">Loading…</div>
          </div>
        ) : transactions.length === 0 ? (
          <div className="empty" style={{ padding: 40 }}>
            <IconTable size={32} color="var(--t3)" style={{ display: 'block', margin: '0 auto 12px' }} />
            <div className="empty-t">No transactions yet</div>
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Project</th>
                <th>Vendor</th>
                <th>Cost code</th>
                <th>Type</th>
                <th>Amount</th>
                <th>QBO</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td>{fmtD(t.transaction_date)}</td>
                  <td>{t.projects?.name?.replace(/\|.*/, '').trim() || '—'}</td>
                  <td>{t.vendor || '—'}</td>
                  <td>{t.cost_codes ? `${t.cost_codes.code} — ${t.cost_codes.name}` : '—'}</td>
                  <td>
                    <span className={`badge ${t.transaction_type === 'income' ? 'bg-green' : 'bg-gray'}`}>{t.transaction_type}</span>
                  </td>
                  <td style={{ fontWeight: 600, color: t.amount < 0 ? 'var(--red)' : 'var(--green)' }}>{fmt(t.amount)}</td>
                  <td>{t.quickbooks_synced ? <span className="badge bg-green">Synced</span> : <span className="badge bg-amber">Pending</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNew && (
        <NewTransactionModal
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            toast('Transaction added');
            load();
          }}
        />
      )}
    </>
  );
}
