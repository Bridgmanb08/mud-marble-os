import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { IconArrowLeft, IconPlus } from '@tabler/icons-react';
import { api, ApiError } from '../api/client';
import { useToast } from '../components/ui/Toast';
import { fmt, fmtD } from '../lib/format';
import { NewTransactionModal } from '../components/inhouse/NewTransactionModal';
import { ProjectSubcontractorCard } from '../components/inhouse/ProjectSubcontractorCard';
import type { CostCode, FinancialSummary, Project, ProjectSubItem, Subcontractor, Transaction } from '../types';

const TABS = ['Overview', 'Transactions', 'Subcontractors'];

export default function InHouseWorkshop() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [project, setProject] = useState<Project | null>(null);
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [subItems, setSubItems] = useState<ProjectSubItem[]>([]);
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [tab, setTab] = useState('Overview');

  const [checkingBalance, setCheckingBalance] = useState('');
  const [creditCardBalance, setCreditCardBalance] = useState('');
  const [pendingInvoices, setPendingInvoices] = useState('');

  const [showNewTransaction, setShowNewTransaction] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | undefined>(undefined);

  const [newSubId, setNewSubId] = useState('');
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemAmount, setNewItemAmount] = useState('');

  async function loadProject() {
    if (!id) return;
    try {
      const p = await api.get<Project>(`/projects/${id}`);
      setProject(p);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load job', true);
    }
  }

  async function loadSummary() {
    if (!id) return;
    try {
      const s = await api.get<FinancialSummary>(`/projects/${id}/financial-summary`);
      setSummary(s);
      setCheckingBalance(s.checking_balance !== null ? String(s.checking_balance) : '');
      setCreditCardBalance(s.credit_card_balance !== null ? String(s.credit_card_balance) : '');
      setPendingInvoices(s.pending_invoices_manual !== null ? String(s.pending_invoices_manual) : '');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load financial summary', true);
    }
  }

  async function loadTransactions() {
    if (!id) return;
    setTransactions(await api.get<Transaction[]>(`/transactions?project_id=${id}`).catch(() => []));
  }

  async function loadSubItems() {
    if (!id) return;
    setSubItems(await api.get<ProjectSubItem[]>(`/projects/${id}/subcontractor-items`).catch(() => []));
  }

  useEffect(() => {
    loadProject();
    loadSummary();
    loadTransactions();
    loadSubItems();
    api.get<CostCode[]>('/transactions/cost-codes').then(setCostCodes).catch(() => {});
    api.get<Subcontractor[]>('/subcontractors').then(setSubcontractors).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function saveBalance(field: 'checking_balance' | 'credit_card_balance' | 'pending_invoices_manual', value: string) {
    if (!id) return;
    const num = value.trim() === '' ? null : parseFloat(value);
    try {
      await api.patch(`/projects/${id}`, { [field]: num });
      loadSummary();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to save balance', true);
    }
  }

  async function patchTransaction(txId: string, updates: Record<string, unknown>) {
    try {
      await api.patch(`/transactions/${txId}`, updates);
      loadTransactions();
      loadSummary();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to update transaction', true);
    }
  }

  async function addSubItem() {
    const amt = parseFloat(newItemAmount);
    if (!id || !newSubId || !amt) return;
    try {
      await api.post(`/projects/${id}/subcontractor-items`, {
        subcontractor_id: newSubId,
        description: newItemDesc.trim() || null,
        amount: amt,
        sort_order: subItems.length,
      });
      setNewSubId('');
      setNewItemDesc('');
      setNewItemAmount('');
      loadSubItems();
      loadSummary();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to add contract item', true);
    }
  }

  const paidBySub = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of transactions) {
      if (!t.subcontractor_id) continue;
      map.set(t.subcontractor_id, (map.get(t.subcontractor_id) || 0) + Math.abs(t.amount));
    }
    return map;
  }, [transactions]);

  const subGroups = useMemo(() => {
    const groups = new Map<string, ProjectSubItem[]>();
    for (const item of subItems) {
      const list = groups.get(item.subcontractor_id) || [];
      list.push(item);
      groups.set(item.subcontractor_id, list);
    }
    return groups;
  }, [subItems]);

  if (!project) {
    return (
      <div className="empty">
        <div className="empty-t">Loading…</div>
      </div>
    );
  }

  return (
    <>
      <button className="btn btn-sm" style={{ marginBottom: 12 }} onClick={() => navigate('/inhouse')}>
        <IconArrowLeft size={14} /> Back to In-House Sheet
      </button>

      <div className="ph">
        <div>
          <h1>{project.name.replace(/\|.*/, '').trim()}</h1>
          <p>Financial workshop — budget, cost-code categorization, and subcontractor payments</p>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 16 }}>
        {TABS.map((t) => (
          <button key={t} className={`tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && summary && (
        <>
          <div className="metrics">
            <div className="metric">
              <div className="m-label">Owner Price</div>
              <div className="m-val">{fmt(summary.owner_price)}</div>
            </div>
            <div className="metric">
              <div className="m-label">Builder Cost</div>
              <div className="m-val">{fmt(summary.builder_cost)}</div>
            </div>
            <div className="metric">
              <div className="m-label">Profit</div>
              <div className="m-val" style={{ color: 'var(--green)' }}>
                {fmt(summary.profit)}
              </div>
            </div>
            <div className="metric">
              <div className="m-label">Left to Pay (subs)</div>
              <div className="m-val" style={{ color: summary.left_to_pay > 0 ? 'var(--atx)' : undefined }}>
                {fmt(summary.left_to_pay)}
              </div>
            </div>
          </div>

          <div className="sh" style={{ marginTop: 20 }}>
            <div className="st">Account balances</div>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div className="fr3">
              <div className="fg">
                <label className="fl">Checking balance</label>
                <input
                  className="fi"
                  type="number"
                  value={checkingBalance}
                  onChange={(e) => setCheckingBalance(e.target.value)}
                  onBlur={(e) => saveBalance('checking_balance', e.target.value)}
                />
              </div>
              <div className="fg">
                <label className="fl">Credit card balance</label>
                <input
                  className="fi"
                  type="number"
                  value={creditCardBalance}
                  onChange={(e) => setCreditCardBalance(e.target.value)}
                  onBlur={(e) => saveBalance('credit_card_balance', e.target.value)}
                />
              </div>
              <div className="fg">
                <label className="fl">Pending invoices</label>
                <input
                  className="fi"
                  type="number"
                  value={pendingInvoices}
                  onChange={(e) => setPendingInvoices(e.target.value)}
                  onBlur={(e) => saveBalance('pending_invoices_manual', e.target.value)}
                />
              </div>
            </div>
          </div>
        </>
      )}

      {tab === 'Transactions' && (
        <>
          <div className="sh">
            <div className="st">{transactions.length} transactions</div>
            <button className="btn btn-p btn-sm" onClick={() => setShowNewTransaction(true)}>
              <IconPlus size={14} /> Add transaction
            </button>
          </div>
          {transactions.length === 0 ? (
            <div className="empty" style={{ padding: 40 }}>
              <div className="empty-t">No transactions yet</div>
            </div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Vendor</th>
                  <th>Description</th>
                  <th>Cost code</th>
                  <th>Subcontractor</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} onClick={() => setEditingTransaction(t)} style={{ cursor: 'pointer' }}>
                    <td>{fmtD(t.transaction_date)}</td>
                    <td>{t.vendor || '—'}</td>
                    <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.description || '—'}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <select
                        className="fi"
                        style={{ fontSize: 12, padding: '3px 6px' }}
                        value={t.cost_code_id || ''}
                        onChange={(e) => patchTransaction(t.id, { cost_code_id: e.target.value || null })}
                      >
                        <option value="">— Uncategorized —</option>
                        {costCodes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.code} — {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <select
                        className="fi"
                        style={{ fontSize: 12, padding: '3px 6px' }}
                        value={t.subcontractor_id || ''}
                        onChange={(e) => patchTransaction(t.id, { subcontractor_id: e.target.value || null })}
                      >
                        <option value="">— None —</option>
                        {subcontractors.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.company_name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ fontWeight: 600, color: t.amount < 0 ? 'var(--red)' : 'var(--green)' }}>{fmt(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {tab === 'Subcontractors' && (
        <>
          <div className="sh">
            <div className="st">Contracted subcontractors ({subGroups.size})</div>
          </div>
          {Array.from(subGroups.entries()).map(([subId, items]) => {
            const sub = subcontractors.find((s) => s.id === subId);
            if (!sub) return null;
            return (
              <ProjectSubcontractorCard
                key={subId}
                projectId={id!}
                subcontractor={sub}
                items={items}
                paid={paidBySub.get(subId) || 0}
                onChanged={() => {
                  loadSubItems();
                  loadTransactions();
                  loadSummary();
                }}
              />
            );
          })}

          <div className="sh" style={{ marginTop: 20 }}>
            <div className="st">Add a subcontractor to this job</div>
          </div>
          <div className="card" style={{ padding: 16, display: 'flex', gap: 8 }}>
            <select className="fi" value={newSubId} onChange={(e) => setNewSubId(e.target.value)}>
              <option value="">— Select subcontractor —</option>
              {subcontractors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.company_name}
                  {s.trade ? ` (${s.trade})` : ''}
                </option>
              ))}
            </select>
            <input
              className="fi"
              placeholder="Line item (e.g. Run new electrical)"
              value={newItemDesc}
              onChange={(e) => setNewItemDesc(e.target.value)}
            />
            <input
              className="fi"
              type="number"
              placeholder="Amount"
              style={{ maxWidth: 140 }}
              value={newItemAmount}
              onChange={(e) => setNewItemAmount(e.target.value)}
            />
            <button type="button" className="btn btn-p btn-sm" onClick={addSubItem} disabled={!newSubId || !newItemAmount}>
              <IconPlus size={14} /> Add
            </button>
          </div>
        </>
      )}

      {showNewTransaction && (
        <NewTransactionModal
          defaultProjectId={id}
          lockProject
          onClose={() => setShowNewTransaction(false)}
          onCreated={() => {
            setShowNewTransaction(false);
            toast('Transaction added');
            loadTransactions();
            loadSummary();
          }}
        />
      )}

      {editingTransaction && (
        <NewTransactionModal
          transaction={editingTransaction}
          lockProject
          onClose={() => setEditingTransaction(undefined)}
          onCreated={() => {
            setEditingTransaction(undefined);
            toast('Transaction updated');
            loadTransactions();
            loadSummary();
          }}
        />
      )}
    </>
  );
}
