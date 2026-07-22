import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IconArrowLeft, IconPlus, IconDownload, IconFileSpreadsheet, IconCopy, IconGripVertical } from '@tabler/icons-react';
import { api, ApiError } from '../api/client';
import { useToast } from '../components/ui/Toast';
import { openDatePicker } from '../lib/datePicker';
import { fmt, fmtD } from '../lib/format';
import { LineItemModal } from '../components/estimates/LineItemModal';
import type { Estimate, EstimateLineItem } from '../types';

function SortableLineItemRow({
  item,
  hasDays,
  onClick,
}: {
  item: EstimateLineItem;
  hasDays: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <tr
      ref={setNodeRef}
      onClick={onClick}
      style={{
        cursor: 'pointer',
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        position: 'relative',
        background: isDragging ? 'var(--surface)' : undefined,
      }}
    >
      <td onClick={(e) => e.stopPropagation()} style={{ width: 24 }}>
        <button
          type="button"
          className="btn-reset"
          {...attributes}
          {...listeners}
          style={{ display: 'flex', cursor: 'grab', color: 'var(--t3)', touchAction: 'none' }}
          title="Drag to reorder"
        >
          <IconGripVertical size={14} />
        </button>
      </td>
      <td>
        <div style={{ fontWeight: 500 }}>{item.title}</div>
        {item.cost_codes && (
          <div style={{ fontSize: 11, color: 'var(--t2)' }}>
            {item.cost_codes.code} - {item.cost_codes.name}
          </div>
        )}
      </td>
      <td style={{ textAlign: 'right' }}>{item.quantity}</td>
      <td style={{ textAlign: 'right' }}>{fmt(item.unit_cost)}</td>
      <td style={{ textAlign: 'right' }}>{fmt(item.builder_cost)}</td>
      <td style={{ textAlign: 'right', fontWeight: 500 }}>{fmt(item.owner_price)}</td>
      {hasDays && <td style={{ textAlign: 'right' }}>{item.estimated_days != null ? item.estimated_days : '—'}</td>}
    </tr>
  );
}

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent_to_client', label: 'Sent to client' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray',
  sent_to_client: 'bg-blue',
  approved: 'bg-green',
  rejected: 'bg-red',
};

const BUCKET_LABEL: Record<string, string> = { pm_fee: 'PM Fee', construction: 'Construction', allowance: 'Allowance' };

export default function EstimateWorksheet() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [items, setItems] = useState<EstimateLineItem[]>([]);
  const [siblings, setSiblings] = useState<Estimate[]>([]);
  const [showMore, setShowMore] = useState(false);
  const [title, setTitle] = useState('');
  const [approvalDeadline, setApprovalDeadline] = useState('');
  const [notesInternal, setNotesInternal] = useState('');
  const [introductoryText, setIntroductoryText] = useState('');
  const [closingText, setClosingText] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<EstimateLineItem | undefined>(undefined);
  const [newItemDefaults, setNewItemDefaults] = useState<{ bucket: string } | undefined>(undefined);
  const [duplicating, setDuplicating] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function load() {
    if (!id) return;
    try {
      const est = await api.get<Estimate>(`/estimates/${id}`);
      setEstimate(est);
      setTitle(est.title || '');
      setApprovalDeadline(est.approval_deadline?.slice(0, 10) || '');
      setNotesInternal(est.notes_internal || '');
      setIntroductoryText(est.introductory_text || '');
      setClosingText(est.closing_text || '');
      const [itemRows, siblingRows] = await Promise.all([
        api.get<EstimateLineItem[]>(`/estimates/${id}/items`),
        api.get<Estimate[]>(`/estimates?project_id=${est.project_id}`),
      ]);
      setItems(itemRows);
      setSiblings(siblingRows);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load estimate', true);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!estimate) {
    return (
      <div className="empty">
        <div className="empty-t">Loading…</div>
      </div>
    );
  }

  const groups: Record<string, EstimateLineItem[]> = {};
  for (const item of items) {
    const key = item.group_name || BUCKET_LABEL[item.bucket] || 'Ungrouped';
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }

  const builderCostTotal = items.reduce((s, i) => s + (i.builder_cost || 0), 0);
  const clientPriceTotal = estimate.grand_total_owner_price || 0;
  const profitTotal = clientPriceTotal - builderCostTotal;
  const daysTotal = items.reduce((s, i) => s + (i.estimated_days || 0), 0);
  const hasDays = items.some((i) => i.estimated_days != null);

  async function saveMeta() {
    if (!id) return;
    setSavingMeta(true);
    try {
      await api.patch(`/estimates/${id}`, {
        title: title.trim() || null,
        approval_deadline: approvalDeadline || null,
        notes_internal: notesInternal.trim() || null,
        introductory_text: introductoryText.trim() || null,
        closing_text: closingText.trim() || null,
      });
      toast('Saved');
      load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to save', true);
    } finally {
      setSavingMeta(false);
    }
  }

  async function changeStatus(status: string) {
    if (!id) return;
    try {
      await api.patch(`/estimates/${id}`, { status, ...(status === 'sent_to_client' ? { sent_at: new Date().toISOString() } : {}) });
      toast('Status updated');
      load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to update status', true);
    }
  }

  async function duplicateVersion() {
    if (!id) return;
    setDuplicating(true);
    try {
      const created = await api.post<Estimate>(`/estimates/${id}/duplicate`);
      toast(`Created version ${created.version}`);
      navigate(`/estimates/${created.id}`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to duplicate', true);
    } finally {
      setDuplicating(false);
    }
  }

  function downloadPdf() {
    window.open(`/api/estimates/${id}/export/pdf`, '_blank');
  }
  function downloadExcel() {
    window.open(`/api/estimates/${id}/export/excel`, '_blank');
  }

  function openNewItem(bucket: string) {
    setEditingItem(undefined);
    setNewItemDefaults({ bucket });
    setShowItemModal(true);
  }
  function openEditItem(item: EstimateLineItem) {
    setEditingItem(item);
    setNewItemDefaults(undefined);
    setShowItemModal(true);
  }

  async function handleReorder(groupName: string, groupItems: EstimateLineItem[], event: DragEndEvent, groups: Record<string, EstimateLineItem[]>) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = groupItems.findIndex((i) => i.id === active.id);
    const newIndex = groupItems.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reorderedGroup = arrayMove(groupItems, oldIndex, newIndex);

    // sort_order is one shared sequence across the whole estimate (not scoped
    // per group), so splice the reordered group's new sub-order back into the
    // full flattened list, leaving every other group's relative order as-is.
    const flattened: EstimateLineItem[] = [];
    for (const [name, groupItemsInner] of Object.entries(groups)) {
      flattened.push(...(name === groupName ? reorderedGroup : groupItemsInner));
    }

    const changed = flattened
      .map((item, i) => ({ id: item.id, oldOrder: item.sort_order, newOrder: i }))
      .filter(({ oldOrder, newOrder }) => oldOrder !== newOrder);

    setItems(flattened.map((item, i) => (item.sort_order === i ? item : { ...item, sort_order: i })));

    if (!id || changed.length === 0) return;
    try {
      await Promise.all(changed.map(({ id: itemId, newOrder }) => api.patch(`/estimates/${id}/items/${itemId}`, { sort_order: newOrder })));
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to save the new order', true);
    } finally {
      load();
    }
  }

  return (
    <>
      <button className="btn btn-sm" style={{ marginBottom: 12 }} onClick={() => navigate(-1)}>
        <IconArrowLeft size={14} /> Back
      </button>

      <div className="ph">
        <div>
          <h1>{estimate.projects?.name?.replace(/\|.*/, '').trim() || 'Estimate'}</h1>
          <p>
            Version {estimate.version} ·{' '}
            <select
              className="fi"
              style={{ width: 'auto', display: 'inline-block', fontSize: 12, padding: '2px 6px' }}
              value={estimate.status}
              onChange={(e) => changeStatus(e.target.value)}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {siblings.length > 1 && (
            <select
              className="fi"
              style={{ width: 'auto' }}
              value={id}
              onChange={(e) => navigate(`/estimates/${e.target.value}`)}
            >
              {siblings
                .sort((a, b) => a.version - b.version)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    v{s.version} — {s.status.replace(/_/g, ' ')}
                  </option>
                ))}
            </select>
          )}
          <button className="btn btn-sm" onClick={duplicateVersion} disabled={duplicating}>
            <IconCopy size={14} /> {duplicating ? 'Duplicating…' : 'New version'}
          </button>
          <button className="btn btn-sm" onClick={downloadExcel}>
            <IconFileSpreadsheet size={14} /> Excel
          </button>
          <button className="btn btn-p btn-sm" onClick={downloadPdf}>
            <IconDownload size={14} /> PDF
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div className="fg">
          <label className="fl">Title</label>
          <input className="fi" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`Proposal for ${estimate.projects?.name || 'project'}`} />
        </div>
        <div className="fr">
          <div className="fg">
            <label className="fl">Approval deadline</label>
            <input className="fi" type="date" value={approvalDeadline} onClick={openDatePicker} onChange={(e) => setApprovalDeadline(e.target.value)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 14 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowMore((v) => !v)}>
              {showMore ? 'Hide' : 'Show'} more details
            </button>
          </div>
        </div>
        {showMore && (
          <>
            <div className="fg">
              <label className="fl">Internal notes</label>
              <textarea className="fi" value={notesInternal} onChange={(e) => setNotesInternal(e.target.value)} />
            </div>
            <div className="fg">
              <label className="fl">Introductory text</label>
              <textarea className="fi" style={{ minHeight: 80 }} value={introductoryText} onChange={(e) => setIntroductoryText(e.target.value)} />
            </div>
            <div className="fg">
              <label className="fl">Closing text</label>
              <textarea className="fi" style={{ minHeight: 200, fontSize: 12 }} value={closingText} onChange={(e) => setClosingText(e.target.value)} />
            </div>
          </>
        )}
        <div className="ma" style={{ marginTop: showMore ? 14 : 0 }}>
          <button type="button" className="btn btn-p btn-sm" onClick={saveMeta} disabled={savingMeta}>
            {savingMeta ? 'Saving…' : 'Save details'}
          </button>
        </div>
      </div>

      <div className="metrics">
        <div className="metric">
          <div className="m-label">Total builder cost</div>
          <div className="m-val" style={{ fontSize: 17 }}>{fmt(builderCostTotal)}</div>
        </div>
        <div className="metric">
          <div className="m-label">Estimated profit</div>
          <div className="m-val" style={{ fontSize: 17, color: 'var(--green)' }}>{fmt(profitTotal)}</div>
        </div>
        <div className="metric">
          <div className="m-label">Total client price</div>
          <div className="m-val" style={{ fontSize: 17, fontWeight: 700 }}>{fmt(clientPriceTotal)}</div>
        </div>
        <div className="metric">
          <div className="m-label">Status</div>
          <div className="m-val" style={{ fontSize: 15 }}>
            <span className={`badge ${STATUS_BADGE[estimate.status] || 'bg-gray'}`}>{estimate.status.replace(/_/g, ' ')}</span>
          </div>
          {estimate.sent_at && <div className="m-sub">Sent {fmtD(estimate.sent_at)}</div>}
        </div>
        {hasDays && (
          <div className="metric">
            <div className="m-label">Estimated workdays</div>
            <div className="m-val" style={{ fontSize: 17 }}>{daysTotal.toLocaleString()} days</div>
          </div>
        )}
      </div>

      <div className="sh">
        <div className="st">Worksheet</div>
        <button className="btn btn-p btn-sm" onClick={() => openNewItem('construction')}>
          <IconPlus size={14} /> Add line item
        </button>
      </div>

      {Object.keys(groups).length === 0 ? (
        <div className="empty">
          <div className="empty-t">No line items yet</div>
          <div className="empty-s">Add construction, allowance, and fee line items to build out this proposal.</div>
        </div>
      ) : (
        Object.entries(groups).map(([groupName, groupItems]) => (
          <div key={groupName} className="card" style={{ padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div className="ibt" style={{ margin: 0, border: 'none', padding: 0 }}>{groupName}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => openNewItem(groupItems[0].bucket)}>
                <IconPlus size={13} /> Add to group
              </button>
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 24 }} />
                  <th>Item</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                  <th style={{ textAlign: 'right' }}>Unit price</th>
                  <th style={{ textAlign: 'right' }}>Builder cost</th>
                  <th style={{ textAlign: 'right' }}>Client price</th>
                  {hasDays && <th style={{ textAlign: 'right' }}>Workdays</th>}
                </tr>
              </thead>
              <DndContext sensors={sensors} onDragEnd={(e) => handleReorder(groupName, groupItems, e, groups)}>
                <SortableContext items={groupItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                  <tbody>
                    {groupItems.map((item) => (
                      <SortableLineItemRow key={item.id} item={item} hasDays={hasDays} onClick={() => openEditItem(item)} />
                    ))}
                  </tbody>
                </SortableContext>
              </DndContext>
            </table>
          </div>
        ))
      )}

      {showItemModal && id && (
        <LineItemModal
          estimateId={id}
          item={editingItem}
          defaultBucket={newItemDefaults?.bucket}
          onClose={() => setShowItemModal(false)}
          onSaved={() => {
            setShowItemModal(false);
            toast(editingItem ? 'Line item updated' : 'Line item added');
            load();
          }}
          onDeleted={() => {
            setShowItemModal(false);
            toast('Line item deleted');
            load();
          }}
        />
      )}
    </>
  );
}
