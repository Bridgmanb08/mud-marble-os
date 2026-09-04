import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { DndContext } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { IconArrowLeft, IconPlus, IconSearch, IconRocket } from '@tabler/icons-react';
import { api, ApiError } from '../api/client';
import { useToast } from '../components/ui/Toast';
import { fmt } from '../lib/format';
import { LineItemModal } from '../components/estimates/LineItemModal';
import { LineItemGroupCard } from '../components/estimates/LineItemGroupCard';
import { useGroupedLineItemDrag } from '../components/estimates/useGroupedLineItemDrag';
import { ApplyTemplateModal } from '../components/estimates/ApplyTemplateModal';
import type { EstimateTemplate, EstimateTemplateItem } from '../types';

export default function EstimateTemplateWorksheet() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const [template, setTemplate] = useState<EstimateTemplate | null>(null);
  const [items, setItems] = useState<EstimateTemplateItem[]>([]);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<EstimateTemplateItem | undefined>(undefined);
  const [newItemDefaults, setNewItemDefaults] = useState<{ bucket: string; groupName?: string } | undefined>(undefined);
  const [showApply, setShowApply] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [editingGroupKey, setEditingGroupKey] = useState<string | null>(null);
  const [editingGroupValue, setEditingGroupValue] = useState('');
  const [showNewGroupPrompt, setShowNewGroupPrompt] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const { sensors, collisionDetection, onDragStart, onDragOver, onDragEnd, onDragCancel, groups, groupKeys } = useGroupedLineItemDrag({
    items,
    setItems,
    searchActive: !!searchQuery.trim(),
    patchItem: (itemId, body) => api.patch(`/estimate-templates/${id}/items/${itemId}`, body),
    onSaveError: (message) => toast(message, true),
    onSettled: load,
  });

  async function load() {
    if (!id) return;
    try {
      const [tpl, itemRows] = await Promise.all([
        api.get<EstimateTemplate>(`/estimate-templates/${id}`),
        api.get<EstimateTemplateItem[]>(`/estimate-templates/${id}/items`),
      ]);
      setTemplate(tpl);
      setName(tpl.name);
      setCategory(tpl.category || '');
      setDescription(tpl.description || '');
      setItems(itemRows);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load template', true);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const dropped = (location.state as { importDropped?: string[] } | null)?.importDropped;
    if (dropped && dropped.length > 0) {
      toast(`Imported, but ${dropped.length} item${dropped.length !== 1 ? 's' : ''} needed a manual cost-code check`, true);
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!template) {
    return (
      <div className="empty">
        <div className="empty-t">Loading…</div>
      </div>
    );
  }

  const existingGroups = Array.from(new Set(items.map((i) => i.group_name).filter((g): g is string => !!g))).sort();
  const allCollapsed = groupKeys.length > 0 && groupKeys.every((k) => collapsedGroups[k]);

  const query = searchQuery.trim().toLowerCase();
  const visibleGroups: [string, EstimateTemplateItem[]][] = groupKeys
    .map((name): [string, EstimateTemplateItem[]] => {
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
    // Only drop a zero-match group while ACTIVELY searching -- groups can
    // now legitimately be empty with no search involved (a phantom group
    // kept visible for the rest of an in-progress drag, see
    // useGroupedLineItemDrag's own comment), and those must still render.
    .filter(([, groupItems]) => (query ? groupItems.length > 0 : true));

  const builderCostTotal = items.reduce((s, i) => s + (i.builder_cost || 0), 0);
  const clientPriceTotal = items.reduce((s, i) => s + (i.owner_price || 0), 0);
  const profitTotal = clientPriceTotal - builderCostTotal;
  const hasDays = items.some((i) => i.estimated_days != null);

  async function saveMeta() {
    if (!id) return;
    setSavingMeta(true);
    try {
      await api.patch(`/estimate-templates/${id}`, {
        name: name.trim() || template!.name,
        category: category.trim() || null,
        description: description.trim() || null,
      });
      toast('Saved');
      load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to save', true);
    } finally {
      setSavingMeta(false);
    }
  }

  function openNewItem(bucket: string, groupName?: string) {
    setEditingItem(undefined);
    setNewItemDefaults({ bucket, groupName });
    setShowItemModal(true);
  }
  function openEditItem(item: EstimateTemplateItem) {
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
  async function commitRenameGroup(oldKey: string, groupItems: EstimateTemplateItem[]) {
    const newName = editingGroupValue.trim();
    setEditingGroupKey(null);
    if (!id || !newName || newName === oldKey) return;
    try {
      await Promise.all(groupItems.map((it) => api.patch(`/estimate-templates/${id}/items/${it.id}`, { group_name: newName })));
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

  return (
    <>
      <button className="btn btn-sm" style={{ marginBottom: 12 }} onClick={() => navigate('/estimates/templates')}>
        <IconArrowLeft size={14} /> Back to templates
      </button>

      <div className="ph" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1>{template.name}</h1>
          {template.category && <p>{template.category}</p>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-p btn-sm" onClick={() => setShowApply(true)}>
            <IconRocket size={14} /> Use for new estimate
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div className="fg">
          <label className="fl">Name</label>
          <input className="fi" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="fg">
          <label className="fl">Category</label>
          <input className="fi" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Bathroom, Kitchen, Addition…" />
        </div>
        <div className="fg" style={{ marginBottom: 0 }}>
          <label className="fl">Description</label>
          <textarea className="fi" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional notes about when to use this template…" />
        </div>
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
      </div>

      <div className="sh" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div className="st">Worksheet</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
          <div className="empty-s">Add the line items this template should always start with.</div>
        </div>
      ) : visibleGroups.length === 0 ? (
        <div className="empty">
          <div className="empty-t">No matches</div>
          <div className="empty-s">Nothing in this template matches "{searchQuery}".</div>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={onDragCancel}>
          <SortableContext items={visibleGroups.map(([k]) => `group:${k}`)} strategy={verticalListSortingStrategy}>
            {visibleGroups.map(([groupName, groupItems]) => (
              <LineItemGroupCard
                key={groupName}
                groupKey={groupName}
                items={groupItems}
                hasDays={hasDays}
                collapsed={!query && !!collapsedGroups[groupName]}
                editing={editingGroupKey === groupName}
                editingValue={editingGroupValue}
                dragDisabled={!!query}
                onToggleCollapse={() => toggleGroupCollapse(groupName)}
                onStartRename={() => startRenameGroup(groupName)}
                onRenameChange={setEditingGroupValue}
                onCommitRename={() => commitRenameGroup(groupName, groups[groupName])}
                onAddItem={() => openNewItem(groupItems[0]?.bucket ?? 'construction', groupName)}
                onItemClick={openEditItem}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}

      {showItemModal && id && (
        <LineItemModal
          templateId={id}
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

      {showApply && id && <ApplyTemplateModal templateId={id} onClose={() => setShowApply(false)} />}
    </>
  );
}
