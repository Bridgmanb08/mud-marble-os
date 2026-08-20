import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import {
  IconArrowLeft,
  IconPlus,
  IconDownload,
  IconFileSpreadsheet,
  IconCopy,
  IconSearch,
  IconTemplate,
  IconSparkles,
  IconX,
} from '@tabler/icons-react';
import { api, ApiError } from '../api/client';
import { useToast } from '../components/ui/Toast';
import { openDatePicker } from '../lib/datePicker';
import { fmt, fmtD } from '../lib/format';
import { LineItemModal } from '../components/estimates/LineItemModal';
import { EstimateCopilotPanel } from '../components/estimates/EstimateCopilotPanel';
import { LineItemGroupCard } from '../components/estimates/LineItemGroupCard';
import { SaveAsTemplateModal } from '../components/estimates/SaveAsTemplateModal';
import { InsertFromTemplateModal } from '../components/estimates/InsertFromTemplateModal';
import { RichTextEditor } from '../components/ui/RichTextEditor';
import type { Estimate, EstimateLineItem, NextItemSuggestion } from '../types';

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
  const [newItemDefaults, setNewItemDefaults] = useState<
    | {
        bucket: string;
        groupName?: string;
        title?: string;
        costCodeId?: string;
        unitCost?: number;
        unitCostHint?: string;
      }
    | undefined
  >(undefined);
  const [nextSuggestion, setNextSuggestion] = useState<NextItemSuggestion | null>(null);
  const suggestReqRef = useRef(0);
  const [duplicating, setDuplicating] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [editingGroupKey, setEditingGroupKey] = useState<string | null>(null);
  const [editingGroupValue, setEditingGroupValue] = useState('');
  const [showNewGroupPrompt, setShowNewGroupPrompt] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [showSaveAsTemplate, setShowSaveAsTemplate] = useState(false);
  const [showInsertFromTemplate, setShowInsertFromTemplate] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function load() {
    if (!id) return;
    try {
      const [est, itemRows] = await Promise.all([
        api.get<Estimate>(`/estimates/${id}`),
        api.get<EstimateLineItem[]>(`/estimates/${id}/items`),
      ]);
      setEstimate(est);
      setTitle(est.title || '');
      setApprovalDeadline(est.approval_deadline?.slice(0, 10) || '');
      setNotesInternal(est.notes_internal || '');
      setIntroductoryText(est.introductory_text || '');
      setClosingText(est.closing_text || '');
      setItems(itemRows);
      const siblingRows = await api.get<Estimate[]>(`/estimates?project_id=${est.project_id}`);
      setSiblings(siblingRows);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load estimate', true);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Sorted id list, not the items array itself, so a pure reorder/rename
  // (ids unchanged) doesn't refire the suggestion -- only an actual add or
  // remove does. Each fire is one Claude call plus a pricing lookup, so this
  // keeps it to "once per real change" rather than "once per load() call".
  const itemsSignature = items
    .map((i) => i.id)
    .sort()
    .join(',');

  useEffect(() => {
    if (!id) return;
    setNextSuggestion(null);
    if (!itemsSignature) return;
    const reqId = ++suggestReqRef.current;
    api
      .post<NextItemSuggestion>(`/estimates/${id}/copilot/suggest-next`)
      .then((res) => {
        if (suggestReqRef.current !== reqId) return; // a newer request already superseded this one
        setNextSuggestion(res.title ? res : null);
      })
      .catch(() => {
        if (suggestReqRef.current === reqId) setNextSuggestion(null);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, itemsSignature]);

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
  function acceptSuggestion() {
    if (!nextSuggestion?.title) return;
    setEditingItem(undefined);
    setNewItemDefaults({
      bucket: 'construction',
      groupName: nextSuggestion.group_name || undefined,
      title: nextSuggestion.title,
      costCodeId: nextSuggestion.cost_code_id || undefined,
      unitCost: nextSuggestion.suggested_unit_cost ?? undefined,
      unitCostHint:
        nextSuggestion.suggested_unit_cost != null && nextSuggestion.cost_sample_size > 0
          ? `Suggested from ${nextSuggestion.cost_sample_size} similar line item${nextSuggestion.cost_sample_size !== 1 ? 's' : ''} on other jobs — adjust as needed.`
          : undefined,
    });
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

      <div className="tabs" style={{ marginBottom: 16 }}>
        <button className="tab on">Estimate</button>
        <button className="tab" onClick={() => navigate(`/projects/${estimate.project_id}?tab=Invoices`)}>
          Invoices
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
      <div className="ph" style={{ flexWrap: 'wrap', gap: 12 }}>
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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
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
          <button className="btn btn-sm" onClick={() => setShowSaveAsTemplate(true)}>
            <IconTemplate size={14} /> Save as template
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
        <div className="fg">
          <label className="fl">Approval deadline</label>
          <input
            className="fi"
            type="date"
            value={approvalDeadline}
            onClick={openDatePicker}
            onChange={(e) => setApprovalDeadline(e.target.value)}
            style={{ maxWidth: 220 }}
          />
        </div>
        <div className="fg">
          <label className="fl">Introductory text</label>
          <RichTextEditor value={introductoryText} onChange={setIntroductoryText} minHeight={100} />
        </div>
        <div className="fg">
          <label className="fl">Closing text</label>
          <RichTextEditor value={closingText} onChange={setClosingText} minHeight={220} />
        </div>

        <button type="button" className="btn btn-ghost btn-sm" style={{ marginBottom: 14 }} onClick={() => setShowMore((v) => !v)}>
          {showMore ? 'Hide' : 'Show'} internal notes
        </button>
        {showMore && (
          <div className="fg" style={{ marginBottom: 0 }}>
            <label className="fl">Internal notes</label>
            <textarea className="fi" value={notesInternal} onChange={(e) => setNotesInternal(e.target.value)} />
          </div>
        )}
        <div className="ma" style={{ marginTop: 14 }}>
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

      <div className="sh" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div className="st">Worksheet</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-sm" onClick={() => setShowInsertFromTemplate(true)}>
            <IconTemplate size={14} /> Insert from template or job
          </button>
          <button className="btn btn-sm" onClick={() => setShowNewGroupPrompt(true)}>
            <IconPlus size={14} /> Add group
          </button>
          <button className="btn btn-p btn-sm" onClick={() => openNewItem('construction')}>
            <IconPlus size={14} /> Add line item
          </button>
        </div>
      </div>

      {showNewGroupPrompt && (
        <div className="card" style={{ padding: 12, marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
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
          <LineItemGroupCard
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

      {nextSuggestion?.title && !query && (
        <div
          className="card"
          style={{
            padding: 12,
            marginTop: 4,
            marginBottom: 12,
            border: '1px dashed var(--border-md)',
            background: 'var(--bg)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <IconSparkles size={14} style={{ color: 'var(--t3)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: 'var(--t2)', fontStyle: 'italic' }}>
              {nextSuggestion.title}
              {nextSuggestion.group_name && <span style={{ color: 'var(--t3)' }}> — {nextSuggestion.group_name}</span>}
            </div>
            {nextSuggestion.rationale && (
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
                {nextSuggestion.rationale}
                {nextSuggestion.suggested_unit_cost != null && nextSuggestion.cost_sample_size > 0 && (
                  <>
                    {' '}
                    — averaging {fmt(nextSuggestion.suggested_unit_cost)} across {nextSuggestion.cost_sample_size} past
                    job{nextSuggestion.cost_sample_size !== 1 ? 's' : ''}
                  </>
                )}
              </div>
            )}
          </div>
          <button type="button" className="btn btn-sm" onClick={acceptSuggestion}>
            Accept
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setNextSuggestion(null)}
            title="Dismiss"
          >
            <IconX size={13} />
          </button>
        </div>
      )}

      {showItemModal && id && (
        <LineItemModal
          estimateId={id}
          item={editingItem}
          defaultBucket={newItemDefaults?.bucket}
          defaultGroupName={newItemDefaults?.groupName}
          defaultTitle={newItemDefaults?.title}
          defaultCostCodeId={newItemDefaults?.costCodeId}
          defaultUnitCost={newItemDefaults?.unitCost}
          defaultUnitCostHint={newItemDefaults?.unitCostHint}
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

      {showSaveAsTemplate && id && (
        <SaveAsTemplateModal
          estimateId={id}
          onClose={() => setShowSaveAsTemplate(false)}
          onSaved={(template) => {
            setShowSaveAsTemplate(false);
            toast(`Saved as template "${template.name}"`);
          }}
        />
      )}

      {showInsertFromTemplate && id && (
        <InsertFromTemplateModal
          currentEstimateId={id}
          onClose={() => {
            setShowInsertFromTemplate(false);
            load();
          }}
          onInsert={async (items) => {
            await Promise.all(
              items.map((item) =>
                api.post(`/estimates/${id}/items`, {
                  cost_code_id: item.cost_code_id,
                  group_name: item.group_name,
                  bucket: item.bucket,
                  title: item.title,
                  description: item.description,
                  quantity: item.quantity,
                  unit: item.unit,
                  unit_cost: item.unit_cost,
                  cost_type: item.cost_type,
                  markup_type: item.markup_type,
                  markup_value: item.markup_value,
                  estimated_days: item.estimated_days,
                  notes_internal: item.notes_internal,
                  notes_external: item.notes_external,
                })
              )
            );
            toast(`Inserted ${items.length} line item${items.length !== 1 ? 's' : ''}`);
            load();
          }}
        />
      )}
      </div>

      {id && <EstimateCopilotPanel estimateId={id} onItemAdded={load} />}
      </div>
    </>
  );
}
