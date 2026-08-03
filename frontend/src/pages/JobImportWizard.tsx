import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { IconArrowLeft, IconPlus, IconUpload } from '@tabler/icons-react';
import { api } from '../api/client';
import { fmt, fmtD } from '../lib/format';
import { useToast } from '../components/ui/Toast';
import { NewInvoiceModal } from '../components/invoices/NewInvoiceModal';
import { NewChangeOrderModal } from '../components/change-orders/NewChangeOrderModal';
import { EstimateImportSection } from '../components/job-import/EstimateImportSection';
import { InHouseImportSection } from '../components/job-import/InHouseImportSection';
import { InvoiceImportSection } from '../components/job-import/InvoiceImportSection';
import type { ChangeOrder, Invoice, Project } from '../types';

const INVOICE_STATUS_BADGE: Record<string, string> = { draft: 'bg-gray', sent: 'bg-amber', paid: 'bg-green', overdue: 'bg-red', void: 'bg-gray' };
const CO_STATUS_BADGE: Record<string, string> = { pending: 'bg-gray', sent: 'bg-amber', approved: 'bg-green', rejected: 'bg-red' };

export default function JobImportWizard() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [showNewInvoice, setShowNewInvoice] = useState(false);
  const [showNewCO, setShowNewCO] = useState(false);
  const [showInvoiceScan, setShowInvoiceScan] = useState(false);

  function loadFinancials() {
    if (!projectId) return;
    api.get<Invoice[]>(`/invoices?project_id=${projectId}`).then(setInvoices).catch(() => {});
    api.get<ChangeOrder[]>(`/change-orders?project_id=${projectId}`).then(setChangeOrders).catch(() => {});
  }

  useEffect(() => {
    if (!projectId) return;
    api
      .get<Project>(`/projects/${projectId}`)
      .then(setProject)
      .catch(() => toast('Failed to load project', true));
    loadFinancials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  if (!projectId) return null;

  return (
    <>
      <button className="btn btn-sm" style={{ marginBottom: 12 }} onClick={() => navigate('/')}>
        <IconArrowLeft size={14} /> Back to Dashboard
      </button>
      <div className="ph">
        <div>
          <h1>{project ? project.name.replace(/\|.*/, '').trim() : 'Loading…'}</h1>
          <p>
            Job import portal —{' '}
            <Link to={`/projects/${projectId}`} style={{ color: 'var(--blue)' }}>
              view full project
            </Link>
          </p>
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div className="ibt" style={{ fontSize: 13, textTransform: 'none', letterSpacing: 0, border: 'none', padding: 0, marginBottom: 14 }}>
          Estimate
        </div>
        <EstimateImportSection projectId={projectId} />
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div className="ibt" style={{ fontSize: 13, textTransform: 'none', letterSpacing: 0, border: 'none', padding: 0 }}>
            Invoices &amp; Change Orders
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm" onClick={() => setShowInvoiceScan((v) => !v)}>
              <IconUpload size={14} /> Upload invoice scan
            </button>
          </div>
        </div>

        {showInvoiceScan && (
          <div style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 'var(--r)', marginBottom: 14 }}>
            <InvoiceImportSection
              projectId={projectId}
              onImported={() => {
                setShowInvoiceScan(false);
                loadFinancials();
              }}
            />
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button className="btn btn-sm" onClick={() => setShowNewInvoice(true)}>
            <IconPlus size={14} /> Add invoice
          </button>
          <button className="btn btn-sm" onClick={() => setShowNewCO(true)}>
            <IconPlus size={14} /> Add change order
          </button>
        </div>

        {invoices.length === 0 && changeOrders.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--t2)' }}>No invoices or change orders added yet.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)', textTransform: 'uppercase', marginBottom: 6 }}>
                Invoices ({invoices.length})
              </div>
              {invoices.map((inv) => (
                <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12.5 }}>
                  <span>{inv.invoice_number || '—'} · {fmtD(inv.due_date)}</span>
                  <span>
                    {fmt(inv.amount_due)} <span className={`badge ${INVOICE_STATUS_BADGE[inv.status] || 'bg-gray'}`}>{inv.status}</span>
                  </span>
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)', textTransform: 'uppercase', marginBottom: 6 }}>
                Change Orders ({changeOrders.length})
              </div>
              {changeOrders.map((co) => (
                <div key={co.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12.5 }}>
                  <span>#{co.co_number ?? '—'} {co.title}</span>
                  <span>
                    {fmt(co.owner_price)} <span className={`badge ${CO_STATUS_BADGE[co.status] || 'bg-gray'}`}>{co.status}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 20 }}>
        <div className="ibt" style={{ fontSize: 13, textTransform: 'none', letterSpacing: 0, border: 'none', padding: 0, marginBottom: 14 }}>
          In-House Sheet
        </div>
        <InHouseImportSection projectId={projectId} />
      </div>

      {showNewInvoice && (
        <NewInvoiceModal
          onClose={() => setShowNewInvoice(false)}
          onCreated={() => {
            setShowNewInvoice(false);
            loadFinancials();
            toast('Invoice added');
          }}
          defaultProjectId={projectId}
        />
      )}
      {showNewCO && (
        <NewChangeOrderModal
          onClose={() => setShowNewCO(false)}
          onCreated={() => {
            setShowNewCO(false);
            loadFinancials();
            toast('Change order added');
          }}
          defaultProjectId={projectId}
        />
      )}
    </>
  );
}
