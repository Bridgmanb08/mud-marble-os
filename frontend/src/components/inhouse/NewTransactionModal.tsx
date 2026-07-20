import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import { openDatePicker } from '../../lib/datePicker';
import type { CostCode, Project } from '../../types';

interface NewTransactionModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export function NewTransactionModal({ onClose, onCreated }: NewTransactionModalProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [projectId, setProjectId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [vendor, setVendor] = useState('');
  const [transactionType, setTransactionType] = useState('expense');
  const [amount, setAmount] = useState('');
  const [paymentSource, setPaymentSource] = useState('checking');
  const [costCodeId, setCostCodeId] = useState('');
  const [description, setDescription] = useState('');
  const [isAllowance, setIsAllowance] = useState(false);
  const [isChangeOrder, setIsChangeOrder] = useState(false);
  const [quickbooksSynced, setQuickbooksSynced] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<Project[]>('/projects').then(setProjects).catch(() => {});
    api.get<CostCode[]>('/transactions/cost-codes').then(setCostCodes).catch(() => {});
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt) {
      setError('Amount is required.');
      return;
    }
    if (!projectId) {
      setError('Project is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post('/transactions', {
        project_id: projectId,
        transaction_date: date,
        vendor: vendor.trim() || null,
        transaction_type: transactionType,
        amount: transactionType === 'income' ? amt : -amt,
        payment_source: paymentSource,
        cost_code_id: costCodeId || null,
        description: description.trim() || null,
        is_allowance: isAllowance,
        is_change_order: isChangeOrder,
        quickbooks_synced: quickbooksSynced,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add transaction');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Add transaction" onClose={onClose} wide>
      <form onSubmit={handleSubmit}>
        {error && <div className="merr">{error}</div>}
        <div className="fr">
          <div className="fg">
            <label className="fl">Date</label>
            <input className="fi" type="date" value={date} onClick={openDatePicker} onChange={(e) => setDate(e.target.value)} />
          </div>
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
        </div>
        <div className="fr">
          <div className="fg">
            <label className="fl">Vendor / payer</label>
            <input className="fi" value={vendor} onChange={(e) => setVendor(e.target.value)} />
          </div>
          <div className="fg">
            <label className="fl">Transaction type</label>
            <select className="fi" value={transactionType} onChange={(e) => setTransactionType(e.target.value)}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="credit">Credit / refund</option>
            </select>
          </div>
        </div>
        <div className="fr">
          <div className="fg">
            <label className="fl">Amount ($)</label>
            <input className="fi" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="fg">
            <label className="fl">Payment source</label>
            <select className="fi" value={paymentSource} onChange={(e) => setPaymentSource(e.target.value)}>
              <option value="checking">Checking account</option>
              <option value="credit_card">Credit card</option>
              <option value="cash">Cash</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
        <div className="fr">
          <div className="fg">
            <label className="fl">Cost code</label>
            <select className="fi" value={costCodeId} onChange={(e) => setCostCodeId(e.target.value)}>
              <option value="">— Select —</option>
              {costCodes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="fg">
            <label className="fl">Description</label>
            <input className="fi" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 20, marginBottom: 14 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={isAllowance} onChange={(e) => setIsAllowance(e.target.checked)} /> Allowance (no markup)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={isChangeOrder} onChange={(e) => setIsChangeOrder(e.target.checked)} /> Change order related
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={quickbooksSynced} onChange={(e) => setQuickbooksSynced(e.target.checked)} /> Synced to QuickBooks
          </label>
        </div>
        <div className="ma">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-p" disabled={saving}>
            {saving ? 'Saving…' : 'Add transaction'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
