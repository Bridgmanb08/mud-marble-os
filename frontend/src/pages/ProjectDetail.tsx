import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { IconArrowLeft, IconPlus } from '@tabler/icons-react';
import { api } from '../api/client';
import { useToast } from '../components/ui/Toast';
import { fmt, fmtD } from '../lib/format';
import type { ChangeOrder, Estimate, EstimateLineItem, Invoice, Project, ProjectNote, Task } from '../types';
import { NewNoteModal } from '../components/projects/NewNoteModal';
import { NewChangeOrderModal } from '../components/change-orders/NewChangeOrderModal';
import { NewInvoiceModal } from '../components/invoices/NewInvoiceModal';
import { NewTaskModal } from '../components/tasks/NewTaskModal';
import { TaskDetailDrawer } from '../components/tasks/TaskDetailDrawer';

const TABS = ['Overview', 'Notes', 'Estimate', 'Change Orders', 'Invoices', 'Schedule'];

const NOTE_COLORS: Record<string, string> = {
  site_visit: 'var(--blue)',
  client_communication: 'var(--purple-tx)',
  internal: 'var(--t3)',
  daily_log: 'var(--green)',
};

const CO_TYPE_BADGE: Record<string, string> = { oversight: 'bg-amber', client_addition: 'bg-blue', unforeseen: 'bg-red' };
const CO_STATUS_BADGE: Record<string, string> = { pending: 'bg-gray', sent: 'bg-amber', approved: 'bg-green', rejected: 'bg-red' };
const INVOICE_STATUS_BADGE: Record<string, string> = { draft: 'bg-gray', sent: 'bg-amber', paid: 'bg-green', overdue: 'bg-red', void: 'bg-gray' };
const BUCKET_LABEL: Record<string, string> = { pm_fee: 'PM Fee', construction: 'Construction', allowance: 'Allowance' };

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [notes, setNotes] = useState<ProjectNote[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [lineItems, setLineItems] = useState<EstimateLineItem[]>([]);
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tab, setTab] = useState('Overview');
  const [showNewNote, setShowNewNote] = useState(false);
  const [showNewCO, setShowNewCO] = useState(false);
  const [showNewInvoice, setShowNewInvoice] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);
  const [detailTask, setDetailTask] = useState<Task | undefined>(undefined);
  const [startingEstimate, setStartingEstimate] = useState(false);

  async function loadNotes() {
    if (!id) return;
    try {
      setNotes(await api.get<ProjectNote[]>(`/projects/${id}/notes`));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load notes', true);
    }
  }

  async function loadEstimates() {
    if (!id) return;
    const ests = await api.get<Estimate[]>(`/estimates?project_id=${id}`).catch(() => []);
    setEstimates(ests);
    const latest = ests[0];
    if (latest) {
      setLineItems(await api.get<EstimateLineItem[]>(`/estimates/${latest.id}/items`).catch(() => []));
    } else {
      setLineItems([]);
    }
  }

  async function loadChangeOrders() {
    if (!id) return;
    setChangeOrders(await api.get<ChangeOrder[]>(`/change-orders?project_id=${id}`).catch(() => []));
  }

  async function loadInvoices() {
    if (!id) return;
    setInvoices(await api.get<Invoice[]>(`/invoices?project_id=${id}`).catch(() => []));
  }

  async function loadTasks() {
    if (!id) return;
    setTasks(await api.get<Task[]>(`/tasks?project_id=${id}`).catch(() => []));
  }

  useEffect(() => {
    if (!id) return;
    api
      .get<Project>(`/projects/${id}`)
      .then(setProject)
      .catch(() => toast('Failed to load project', true));
    loadNotes();
    loadEstimates();
    loadChangeOrders();
    loadInvoices();
    loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!project) {
    return (
      <div className="empty">
        <div className="empty-t">Loading…</div>
      </div>
    );
  }

  async function startEstimate() {
    if (!id) return;
    setStartingEstimate(true);
    try {
      await api.post('/estimates', { project_id: id, version: 1, status: 'draft', pm_fee_total: 0 });
      toast('Estimate started');
      await loadEstimates();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to start estimate', true);
    } finally {
      setStartingEstimate(false);
    }
  }

  const latestEstimate = estimates[0];
  const linesByBucket: Record<string, EstimateLineItem[]> = {};
  for (const li of lineItems) {
    if (!linesByBucket[li.bucket]) linesByBucket[li.bucket] = [];
    linesByBucket[li.bucket].push(li);
  }

  function openTask(taskId: string) {
    const t = tasks.find((t) => t.id === taskId);
    if (t) setDetailTask(t);
  }

  return (
    <>
      <button className="btn btn-sm" style={{ marginBottom: 12 }} onClick={() => navigate('/projects')}>
        <IconArrowLeft size={14} /> Back to Projects
      </button>
      <div className="ph">
        <div>
          <h1>{project.name.replace(/\|.*/, '').trim()}</h1>
          <p>
            {project.clients ? `${project.clients.first_name || ''} ${project.clients.last_name || ''}`.trim() : 'No client'}
            {project.address ? ` · ${project.address}` : ''}
          </p>
        </div>
        <span className="badge bg-gray">{project.status.replace('_', ' ')}</span>
      </div>

      <div className="tabs" style={{ margin: '0 -24px 0', borderRadius: 0 }}>
        {TABS.map((t) => (
          <button key={t} type="button" className={`tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      <div className="tb" style={{ borderRadius: '0 0 12px 12px' }}>
        {tab === 'Overview' && (
          <div className="ig">
            <div>
              <div className="ibt">Project details</div>
              <div className="ir">
                <span className="ik">Address</span>
                <span className="iv">{project.address || '—'}{project.city ? `, ${project.city}` : ''} {project.state}</span>
              </div>
              <div className="ir">
                <span className="ik">Type</span>
                <span className="iv">{project.project_type || '—'}</span>
              </div>
              <div className="ir">
                <span className="ik">Start date</span>
                <span className="iv">{fmtD(project.start_date)}</span>
              </div>
              <div className="ir">
                <span className="ik">Est. completion</span>
                <span className="iv">{fmtD(project.estimated_completion)}</span>
              </div>
              <div className="ir">
                <span className="ik">Contract value</span>
                <span className="iv">{fmt(project.contract_value)}</span>
              </div>
            </div>
            <div>
              <div className="ibt">Internal notes</div>
              <p style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.5 }}>{project.internal_notes || 'No notes yet.'}</p>
            </div>
          </div>
        )}

        {tab === 'Notes' && (
          <>
            <div className="sh">
              <div className="st">Activity log</div>
              <button className="btn btn-p btn-sm" onClick={() => setShowNewNote(true)}>
                <IconPlus size={14} /> Log a note
              </button>
            </div>
            {notes.length ? (
              notes.map((n) => (
                <div key={n.id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div className="af-dot" style={{ background: NOTE_COLORS[n.note_type] || 'var(--t3)', width: 8, height: 8, borderRadius: '50%', marginTop: 4, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12 }}>
                      <strong>{n.author}</strong> logged a {n.note_type.replace('_', ' ')}
                      {n.is_client_visible && <span className="badge bg-blue" style={{ marginLeft: 6 }}>Client visible</span>}
                    </div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>{n.content}</div>
                    <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>{fmtD(n.created_at)}</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-s">No notes logged yet.</div>
            )}
          </>
        )}

        {tab === 'Estimate' && (
          <>
            {!latestEstimate ? (
              <div className="empty">
                <div className="empty-t">No estimate yet</div>
                <div className="empty-s" style={{ marginBottom: 14 }}>Start an estimate to break down costs by PM fee, construction, and allowances.</div>
                <button className="btn btn-p btn-sm" onClick={startEstimate} disabled={startingEstimate}>
                  <IconPlus size={14} /> {startingEstimate ? 'Starting…' : 'Start estimate'}
                </button>
              </div>
            ) : (
              <>
                <div className="sh">
                  <div className="st">
                    Version {latestEstimate.version} · <span className="badge bg-gray">{latestEstimate.status.replace(/_/g, ' ')}</span>
                  </div>
                </div>
                <div className="metrics" style={{ marginBottom: 20 }}>
                  <div className="metric">
                    <div className="m-label">PM fee</div>
                    <div className="m-val" style={{ fontSize: 17 }}>{fmt(latestEstimate.pm_fee_total)}</div>
                  </div>
                  <div className="metric">
                    <div className="m-label">Construction</div>
                    <div className="m-val" style={{ fontSize: 17 }}>{fmt(latestEstimate.construction_total_owner_price)}</div>
                  </div>
                  <div className="metric">
                    <div className="m-label">Allowances</div>
                    <div className="m-val" style={{ fontSize: 17 }}>{fmt(latestEstimate.allowance_total)}</div>
                  </div>
                  <div className="metric">
                    <div className="m-label">Grand total</div>
                    <div className="m-val" style={{ fontSize: 17, fontWeight: 700 }}>{fmt(latestEstimate.grand_total_owner_price)}</div>
                  </div>
                </div>
                {Object.keys(linesByBucket).length === 0 ? (
                  <div className="empty-s">No line items yet.</div>
                ) : (
                  Object.entries(linesByBucket).map(([bucket, items]) => (
                    <div key={bucket} style={{ marginBottom: 18 }}>
                      <div className="ibt">{BUCKET_LABEL[bucket] || bucket}</div>
                      <table className="tbl">
                        <thead>
                          <tr>
                            <th>Description</th>
                            <th style={{ textAlign: 'right' }}>Builder cost</th>
                            <th style={{ textAlign: 'right' }}>Owner price</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((li) => (
                            <tr key={li.id}>
                              <td>{li.description}</td>
                              <td style={{ textAlign: 'right' }}>{fmt(li.builder_cost)}</td>
                              <td style={{ textAlign: 'right', fontWeight: 500 }}>{fmt(li.owner_price)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))
                )}
              </>
            )}
          </>
        )}

        {tab === 'Change Orders' && (
          <>
            <div className="sh">
              <div className="st">{changeOrders.length} change orders</div>
              <button className="btn btn-p btn-sm" onClick={() => setShowNewCO(true)}>
                <IconPlus size={14} /> New change order
              </button>
            </div>
            {changeOrders.length === 0 ? (
              <div className="empty-s">No change orders yet.</div>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>CO #</th>
                    <th>Title</th>
                    <th>Type</th>
                    <th style={{ textAlign: 'right' }}>Owner price</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {changeOrders.map((co) => (
                    <tr key={co.id}>
                      <td>{co.co_number ?? '—'}</td>
                      <td style={{ fontWeight: 500 }}>{co.title}</td>
                      <td><span className={`badge ${CO_TYPE_BADGE[co.co_type] || 'bg-gray'}`}>{co.co_type.replace('_', ' ')}</span></td>
                      <td style={{ textAlign: 'right' }}>{fmt(co.owner_price)}</td>
                      <td>
                        <span className={`badge ${CO_STATUS_BADGE[co.status] || 'bg-gray'}`}>{co.status}</span>
                        {co.sop_breach && <span className="badge bg-red" style={{ marginLeft: 6 }}>SOP breach</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        {tab === 'Invoices' && (
          <>
            <div className="sh">
              <div className="st">{invoices.length} invoices</div>
              <button className="btn btn-p btn-sm" onClick={() => setShowNewInvoice(true)}>
                <IconPlus size={14} /> Create invoice
              </button>
            </div>
            {invoices.length === 0 ? (
              <div className="empty-s">No invoices yet.</div>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Type</th>
                    <th style={{ textAlign: 'right' }}>Amount due</th>
                    <th style={{ textAlign: 'right' }}>Paid</th>
                    <th>Due</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td style={{ fontWeight: 500 }}>{inv.invoice_number || 'Draft'}</td>
                      <td>{inv.invoice_type}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(inv.amount_due)}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(inv.amount_paid)}</td>
                      <td>{fmtD(inv.due_date)}</td>
                      <td><span className={`badge ${INVOICE_STATUS_BADGE[inv.status] || 'bg-gray'}`}>{inv.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        {tab === 'Schedule' && (
          <>
            <div className="sh">
              <div className="st">{tasks.length} tasks</div>
              <button className="btn btn-p btn-sm" onClick={() => setShowNewTask(true)}>
                <IconPlus size={14} /> New task
              </button>
            </div>
            {tasks.length === 0 ? (
              <div className="empty-s">No tasks scheduled yet.</div>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Assignee</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Due</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((t) => (
                    <tr key={t.id} onClick={() => openTask(t.id)} style={{ cursor: 'pointer' }}>
                      <td style={{ fontWeight: 500 }}>{t.title}</td>
                      <td>{t.assigned_to || '—'}</td>
                      <td><span className="badge bg-gray">{t.status.replace('_', ' ')}</span></td>
                      <td>{t.priority}</td>
                      <td>{fmtD(t.scheduled_end)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>

      {showNewNote && id && (
        <NewNoteModal
          projectId={id}
          onClose={() => setShowNewNote(false)}
          onCreated={() => {
            setShowNewNote(false);
            toast('Note saved');
            loadNotes();
          }}
        />
      )}

      {showNewCO && id && (
        <NewChangeOrderModal
          defaultProjectId={id}
          onClose={() => setShowNewCO(false)}
          onCreated={() => {
            setShowNewCO(false);
            toast('Change order created');
            loadChangeOrders();
          }}
        />
      )}

      {showNewInvoice && id && (
        <NewInvoiceModal
          defaultProjectId={id}
          onClose={() => setShowNewInvoice(false)}
          onCreated={() => {
            setShowNewInvoice(false);
            toast('Invoice created');
            loadInvoices();
          }}
        />
      )}

      {showNewTask && id && (
        <NewTaskModal
          defaultProjectId={id}
          onClose={() => setShowNewTask(false)}
          onSaved={() => {
            setShowNewTask(false);
            toast('Task created');
            loadTasks();
          }}
        />
      )}

      {detailTask && (
        <TaskDetailDrawer
          task={detailTask}
          allTasks={tasks}
          onClose={() => setDetailTask(undefined)}
          onSaved={() => {
            setDetailTask(undefined);
            toast('Task updated');
            loadTasks();
          }}
          onDeleted={() => {
            setDetailTask(undefined);
            toast('Task deleted');
            loadTasks();
          }}
        />
      )}
    </>
  );
}
