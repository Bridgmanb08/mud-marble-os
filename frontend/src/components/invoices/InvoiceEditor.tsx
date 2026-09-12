import { useEffect, useState } from 'react';
import { IconDownload, IconFileDollar, IconPlus, IconTrash } from '@tabler/icons-react';
import { api, ApiError } from '../../api/client';
import { useToast } from '../ui/Toast';
import { openDatePicker } from '../../lib/datePicker';
import { fmt } from '../../lib/format';
import { pdfExportFilename, triggerDownload } from '../../lib/download';
import { InvoiceLineItemModal } from './InvoiceLineItemModal';
import { AddEstimateLineItemsModal } from './AddEstimateLineItemsModal';
import type { FinancialSummary, Invoice, InvoiceLineItem } from '../../types';

const STATUS_OPTIONS = ['draft', 'sent', 'paid', 'overdue', 'void'];
const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray',
  sent: 'bg-amber',
  paid: 'bg-green',
  overdue: 'bg-red',
  void: 'bg-gray',
};

// The full invoice editor -- header fields, line items, "Add from Estimate".
// Extracted out of the standalone /invoices/:id page so it can be reused
// inside a modal too (Project Detail's Invoices tab opens one of these in a
// popup instead of navigating away, per Brent's request -- same content
// either way, just a different wrapper around it).
export function InvoiceEditor({ invoiceId, onInvoiceChanged }: { invoiceId: string; onInvoiceChanged?: (invoice: Invoice) => void }) {
  const toast = useToast();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [items, setItems] = useState<InvoiceLineItem[]>([]);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceType, setInvoiceType] = useState('progress');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [paidDate, setPaidDate] = useState('');
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InvoiceLineItem | undefined>(undefined);
  const [showFromEstimate, setShowFromEstimate] = useState(false);
  const [financialSummary, setFinancialSummary] = useState<FinancialSummary | null>(null);

  function load() {
    if (!invoiceId) return;
    Promise.all([api.get<Invoice>(`/invoices/${invoiceId}`), api.get<InvoiceLineItem[]>(`/invoices/${invoiceId}/items`)])
      .then(([inv, itemRows]) => {
        setInvoice(inv);
        setItems(itemRows);
        setInvoiceNumber(inv.invoice_number || '');
        setInvoiceType(inv.invoice_type);
        setDueDate(inv.due_date?.slice(0, 10) || '');
        setNotes(inv.notes_external || '');
        setAmountPaid(inv.amount_paid !== null ? String(inv.amount_paid) : '');
        setPaidDate(inv.paid_date?.slice(0, 10) || '');
        onInvoiceChanged?.(inv);
      })
      .catch(() => toast('Failed to load invoice', true));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  // Contract-total cross-reference -- so someone looking at an existing
  // invoice can actually sanity-check it against the estimate/contract
  // instead of just trusting a flat dollar amount. Refetched whenever the
  // line items change (via `items`) so it picks up "invoiced to date"
  // moving as items are added/removed from THIS invoice too, not just other
  // invoices on the project.
  useEffect(() => {
    if (!invoice?.project_id) return;
    api
      .get<FinancialSummary>(`/projects/${invoice.project_id}/financial-summary`)
      .then(setFinancialSummary)
      .catch(() => setFinancialSummary(null));
  }, [invoice?.project_id, items]);

  async function saveField(field: string, value: unknown) {
    if (!invoiceId) return;
    try {
      await api.patch(`/invoices/${invoiceId}`, { [field]: value });
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to save', true);
    }
  }

  async function deleteItem(item: InvoiceLineItem) {
    if (!invoiceId) return;
    try {
      await api.delete(`/invoices/${invoiceId}/items/${item.id}`);
      toast('Line item removed');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to remove line item', true);
    }
  }

  if (!invoice) {
    return (
      <div className="empty">
        <div className="empty-t">Loading…</div>
      </div>
    );
  }

  const hasLineItems = items.length > 0;

  return (
    <>
      <div className="ph">
        <div>
          <h1>{invoice.invoice_number || 'Draft invoice'}</h1>
          <p>{invoice.projects?.name || ''}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            className="btn btn-sm"
            onClick={() =>
              triggerDownload(`/api/invoices/${invoiceId}/export/pdf`, pdfExportFilename(invoice.projects?.address, invoice.projects?.name, 'Invoice'))
            }
          >
            <IconDownload size={14} /> PDF
          </button>
          <span className={`badge ${STATUS_BADGE[invoice.status] || 'bg-gray'}`} style={{ fontSize: 13 }}>
            {invoice.status}
          </span>
        </div>
      </div>

      {financialSummary && (
        <div className="card" style={{ padding: '14px 20px', marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 24 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--t2)', textTransform: 'uppercase' }}>Contract total</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{fmt(financialSummary.owner_price)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--t2)', textTransform: 'uppercase' }}>Invoiced to date</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{fmt(financialSummary.invoiced_to_date)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--t2)', textTransform: 'uppercase' }}>Remaining to invoice</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: financialSummary.remaining_to_invoice < 0 ? 'var(--red)' : undefined }}>
              {fmt(financialSummary.remaining_to_invoice)}
            </div>
          </div>
          {invoice.status === 'draft' && (
            <div style={{ fontSize: 11, color: 'var(--t3)', alignSelf: 'center' }}>
              This invoice is still a draft, so it isn't counted in "Invoiced to date" yet.
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div className="ibt" style={{ fontSize: 13, textTransform: 'none', letterSpacing: 0, border: 'none', padding: 0, marginBottom: 14 }}>
          Invoice information
        </div>
        <div className="fr3">
          <div className="fg">
            <label className="fl">Invoice number</label>
            <input
              className="fi"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              onBlur={(e) => saveField('invoice_number', e.target.value.trim() || null)}
            />
          </div>
          <div className="fg">
            <label className="fl">Type</label>
            <select
              className="fi"
              value={invoiceType}
              onChange={(e) => {
                setInvoiceType(e.target.value);
                saveField('invoice_type', e.target.value);
              }}
            >
              <option value="deposit">Deposit</option>
              <option value="progress">Progress</option>
              <option value="final">Final</option>
            </select>
          </div>
          <div className="fg">
            <label className="fl">Status</label>
            <select
              className="fi"
              value={invoice.status}
              onChange={(e) => saveField('status', e.target.value)}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="fr3">
          <div className="fg">
            <label className="fl">Due date</label>
            <input
              className="fi"
              type="date"
              value={dueDate}
              onClick={openDatePicker}
              onChange={(e) => {
                setDueDate(e.target.value);
                saveField('due_date', e.target.value || null);
              }}
            />
          </div>
          <div className="fg">
            <label className="fl">Amount paid ($)</label>
            <input
              className="fi"
              type="number"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              onBlur={(e) => saveField('amount_paid', e.target.value.trim() === '' ? null : parseFloat(e.target.value))}
            />
          </div>
          <div className="fg">
            <label className="fl">Paid date</label>
            <input
              className="fi"
              type="date"
              value={paidDate}
              onClick={openDatePicker}
              onChange={(e) => {
                setPaidDate(e.target.value);
                saveField('paid_date', e.target.value || null);
              }}
            />
            <div className="m-sub">Auto-filled to today when status is set to "paid" -- editable if the real date was different.</div>
          </div>
        </div>
        <div className="fg">
          <label className="fl">Notes</label>
          <textarea
            className="fi"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={(e) => saveField('notes_external', e.target.value.trim() || null)}
          />
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 20px',
            borderBottom: hasLineItems ? '1px solid var(--border)' : 'none',
          }}
        >
          <div className="ibt" style={{ fontSize: 13, textTransform: 'none', letterSpacing: 0, border: 'none', padding: 0 }}>
            Line items
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm" onClick={() => setShowFromEstimate(true)}>
              <IconFileDollar size={14} /> Add from Estimate
            </button>
            <button
              className="btn btn-sm"
              onClick={() => {
                setEditingItem(undefined);
                setShowItemModal(true);
              }}
            >
              <IconPlus size={14} /> Add line item
            </button>
          </div>
        </div>

        {hasLineItems ? (
          <>
            <div className="tbl-scroll">
              <table className="tbl tbl-zebra">
                <thead>
                  <tr>
                    <th className="sticky-col">Title</th>
                    <th>Cost code</th>
                    <th>Description</th>
                    <th>Amount</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr
                      key={it.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        setEditingItem(it);
                        setShowItemModal(true);
                      }}
                    >
                      <td className="sticky-col">{it.title}</td>
                      <td>{it.cost_codes ? `${it.cost_codes.code} - ${it.cost_codes.name}` : '—'}</td>
                      <td style={{ color: 'var(--t2)' }}>{it.description || '—'}</td>
                      <td>{fmt(it.amount)}</td>
                      <td>
                        <button
                          type="button"
                          className="btn-reset"
                          style={{ color: 'var(--red)', cursor: 'pointer' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteItem(it);
                          }}
                        >
                          <IconTrash size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 24,
                padding: '14px 20px',
                borderTop: '1px solid var(--border)',
                fontSize: 14,
              }}
            >
              <span style={{ color: 'var(--t2)' }}>Invoice total</span>
              <strong>{fmt(invoice.amount_due)}</strong>
            </div>
          </>
        ) : (
          <div style={{ padding: '20px' }}>
            <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 12 }}>
              No line items yet — this invoice is a flat amount of {fmt(invoice.amount_due)}. Add a line item (manually
              or from the estimate) to break it down.
            </div>
          </div>
        )}
      </div>

      {showItemModal && (
        <InvoiceLineItemModal
          invoiceId={invoiceId}
          item={editingItem}
          onClose={() => setShowItemModal(false)}
          onSaved={() => {
            setShowItemModal(false);
            toast(editingItem ? 'Line item updated' : 'Line item added');
            load();
          }}
        />
      )}
      {showFromEstimate && invoice && (
        <AddEstimateLineItemsModal
          invoiceId={invoiceId}
          projectId={invoice.project_id}
          onClose={() => setShowFromEstimate(false)}
          onAdded={() => {
            setShowFromEstimate(false);
            toast('Line items added to invoice');
            load();
          }}
        />
      )}
    </>
  );
}
