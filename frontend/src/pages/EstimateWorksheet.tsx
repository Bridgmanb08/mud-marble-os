import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  IconArrowLeft,
  IconPlus,
  IconDownload,
  IconFileSpreadsheet,
  IconCopy,
  IconGripVertical,
  IconChevronDown,
  IconChevronRight,
  IconSearch,
} from '@tabler/icons-react';
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
      <td style={{ fontSize: 12, color: 'var(--t2)', maxWidth: 320 }}>{item.notes_external || '—'}</td>
      <td style={{ textAlign: 'right' }}>{item.quantity}</td>
      <td style={{ textAlign: 'right' }}>{fmt(item.unit_cost)}</td>
      <td style={{ textAlign: 'right' }}>{fmt(item.builder_cost)}</td>
      <td style={{ textAlign: 'right', fontWeight: 500 }}>{fmt(item.owner_price)}</td>
      {hasDays && <td style={{ textAlign: 'right' }}>{item.estimated_days != null ? item.estimated_days : '—'}</td>}
    </tr>
  );
}

function GroupCard({
  groupKey,
  items: groupItems,
  hasDays,
  collapsed,
  editing,
  editingValue,
  itemSensors,
  onToggleCollapse,
  onStartRename,
  onRenameChange,
  onCommitRename,
  onAddItem,
  onItemClick,
  onReorderItems,
}: {
  groupKey: string;
  items: EstimateLineItem[];
  hasDays: boolean;
  collapsed: boolean;
  editing: boolean;
  editingValue: string;
  itemSensors: ReturnType<typeof useSensors>;
  onToggleCollapse: () => void;
  onStartRename: () => void;
  onRenameChange: (value: string) => void;
  onCommitRename: () => void;
  onAddItem: () => void;
  onItemClick: (item: EstimateLineItem) => void;
  onReorderItems: (event: DragEndEvent) => void;
}) {
  const subtotal = groupItems.reduce((s, i) => s + (i.owner_price || 0), 0);

  return (
    <div className="card" style={{ padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: collapsed ? 0 : 8 }}>
        <button type="button" className="btn-reset" onClick={onToggleCollapse} style={{ display: 'flex', color: 'var(--t2)' }}>
          {collapsed ? <IconChevronRight size={16} /> : <IconChevronDown size={16} />}
        </button>
        {editing ? (
          <input
            className="fi"
            autoFocus
            value={editingValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onBlur={onCommitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
            }}
            style={{ maxWidth: 260 }}
          />
        ) : (
          <div className="ibt" style={{ margin: 0, border: 'none', padding: 0, cursor: 'text' }} onClick={onStartRename} title="Click to rename group">
            {groupKey}
          </div>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: 'var(--t2)' }}>
          {groupItems.length} item{groupItems.length !== 1 ? 's' : ''} · {fmt(subtotal)}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onAddItem}>
          <IconPlus size={13} /> Add item
        </button>
      </div>
      {!collapsed && (
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 24 }} />
              <th>Items</th>
              <th>Description</th>
              <th style={{ textAlign: 'right' }}>Qty</th>
              <th style={{ textAlign: 'right' }}>Unit cost</th>
              <th style={{ textAlign: 'right' }}>Builder cost</th>
              <th style={{ textAlign: 'right' }}>Client price</th>
              {hasDays && <th style={{ textAlign: 'right' }}>Workdays</th>}
            </tr>
          </thead>
          <DndContext sensors={itemSensors} onDragEnd={onReorderItems}>
            <SortableContext items={groupItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <tbody>
                {groupItems.map((item) => (
                  <SortableLineItemRow key={item.id} item={item} hasDays={hasDays} onClick={() => onItemClick(item)} />
                ))}
              </tbody>
            </SortableContext>
          </DndContext>
        </table>
      )}
    </div>
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
  const [newItemDefaults, setNewItemDefaults] = useState<{ bucket: string; groupName?: string } | undefined>(undefined);
  const [duplicating, setDuplicating] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [editingGroupKey, setEditingGroupKey] = useState<string | null>(null);
  const [editingGroupValue, setEditingGroupValue] = useState('');
  const [showNewGroupPrompt, setShowNewGroupPrompt] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
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
  const groupKeys = Object.keys(groups);
  const existingGroups = Array.from(new Set(items.map((i) => i.group_name).filter((g): g is string => !!g))).sort();
  const allCollapsed = groupKeys.length > 0 && groupKeys.every((k) => collapsedGroups[k]);

  const query = searchQuery.trim().toLowerCase();
  const visibleGroups: [string, EstimateLineItem[]][] = groupKeys
    .map((name): [string, EstimateLineItem[]] => {
      if (!query) return [name, groups[name]];
      if (name.toLowerCase().includes(query)) return [name, groups[name]];
      const filteredItems = groups[name].filter(
        (it) =>
          it.title.toLowerCase().includes(query) ||
          (it.notes_external || '').toLowerCase().includes(query) ||
          (it.cost_codes ? `${it.cost_codes.code} ${it.cost_codes.name}`.toLowerCase().includes(query) : false)
      );
      return [name, filteredItems];
    })
    .filter(([, groupItems]) => groupItems.length > 0);

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

  function openNewItem(bucket: string, groupName?: string) {
    setEditingItem(undefined);
    setNewItemDefaults({ bucket, groupName });
    setShowItemModal(true);
  }
  function openEditItem(item: EstimateLineItem) {
    setEditingItem(item);
    setNewItemDefaults(undefined);
    setShowItemModal(true);
  }

  function toggleCollapseAll() {
    setCollapsedGroups(allCollapsed ? {} : Object.fromEntries(groupKeys.map((k) => [k, true])));
  }
  function toggleGroupCollapse(key: string) {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function startRenameGroup(key: string) {
    setEditingGroupKey(key);
    setEditingGroupValue(key);
  }
  async function commitRenameGroup(oldKey: string, groupItems: EstimateLineItem[]) {
    const newName = editingGroupValue.trim();
    setEditingGroupKey(null);
    if (!id || !newName || newName === oldKey) return;
    try {
      await Promise.all(groupItems.map((it) => api.patch(`/estimates/${id}/items/${it.id}`, { group_name: newName })));
      toast('Group renamed');
      load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to rename group', true);
    }
  }

  function submitNewGroup() {
    const trimmed = newGroupName.trim();
    if (!trimmed) return;
    setShowNewGroupPrompt(false);
    setNewGroupName('');
    openNewItem('construction', trimmed);
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
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm" onClick={() => setShowNewGroupPrompt(true)}>
            <IconPlus size={14} /> Add group
          </button>
          <button className="btn btn-p btn-sm" onClick={() => openNewItem('construction')}>
            <IconPlus size={14} /> Add line item
          </button>
        </div>
      </div>

      {showNewGroupPrompt && (
        <div className="card" style={{ padding: 12, marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            className="fi"
            autoFocus
            placeholder="Group name, e.g. Mechanicals"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submitNewGroup();
              }
            }}
          />
          <button type="button" className="btn btn-p btn-sm" onClick={submitNewGroup}>
            Create
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              setShowNewGroupPrompt(false);
              setNewGroupName('');
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {groupKeys.length > 0 && (
        <div className="fr" style={{ marginBottom: 12, alignItems: 'center' }}>
          <div className="fg" style={{ marginBottom: 0, flex: 1, position: 'relative' }}>
            <IconSearch size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--t3)' }} />
            <input
              className="fi"
              style={{ paddingLeft: 30 }}
              placeholder="Jump to line items or groups…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button className="btn btn-sm" onClick={toggleCollapseAll}>
            {allCollapsed ? 'Expand all' : 'Collapse all'}
          </button>
        </div>
      )}

      {groupKeys.length === 0 ? (
        <div className="empty">
          <div className="empty-t">No line items yet</div>
          <div className="empty-s">Add construction, allowance, and fee line items to build out this proposal.</div>
        </div>
      ) : visibleGroups.length === 0 ? (
        <div className="empty">
          <div className="empty-t">No matches</div>
          <div className="empty-s">Nothing in this estimate matches "{searchQuery}".</div>
        </div>
      ) : (
        visibleGroups.map(([groupName, groupItems]) => (
          <GroupCard
            key={groupName}
            groupKey={groupName}
            items={groupItems}
            hasDays={hasDays}
            collapsed={!query && !!collapsedGroups[groupName]}
            editing={editingGroupKey === groupName}
            editingValue={editingGroupValue}
            itemSensors={sensors}
            onToggleCollapse={() => toggleGroupCollapse(groupName)}
            onStartRename={() => startRenameGroup(groupName)}
            onRenameChange={setEditingGroupValue}
            onCommitRename={() => commitRenameGroup(groupName, groups[groupName])}
            onAddItem={() => openNewItem(groupItems[0].bucket, groupName)}
            onItemClick={openEditItem}
            onReorderItems={(e) => handleReorder(groupName, groupItems, e, groups)}
          />
        ))
      )}

      {showItemModal && id && (
        <LineItemModal
          estimateId={id}
          item={editingItem}
          defaultBucket={newItemDefaults?.bucket}
          defaultGroupName={newItemDefaults?.groupName}
          existingGroups={existingGroups}
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
