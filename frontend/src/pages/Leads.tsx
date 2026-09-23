import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  IconPlus,
  IconArrowRight,
  IconChevronUp,
  IconChevronDown,
  IconChevronRight,
  IconSettings,
  IconGripVertical,
} from '@tabler/icons-react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/ui/Toast';
import { useDndSensors } from '../hooks/useDndSensors';
import { fmt, fmtD } from '../lib/format';
import { MoneyField } from '../components/rentals/MoneyField';
import type { Lead, LeadBoardLayout, LeadStage, PersonTag } from '../types';
import { NewLeadModal } from '../components/leads/NewLeadModal';
import { ConvertLeadModal } from '../components/leads/ConvertLeadModal';
import { LeadStagesModal } from '../components/leads/LeadStagesModal';
import { EntityTagList } from '../components/tags/EntityTagList';

type SortKey =
  | 'title'
  | 'project_scope'
  | 'status'
  | 'lead_temp'
  | 'projected_profit'
  | 'client'
  | 'created_at'
  | 'last_contacted_at'
  | 'referred_by'
  | 'notes';

const TEMP_RANK: Record<string, number> = { hot: 0, warm: 1, cold: 2 };
const TEMP_OPTIONS = ['hot', 'warm', 'cold'];
const EDIT_STAGES_VALUE = '__edit_stages__';

function leadTitle(l: Lead): string {
  if (l.title) return l.title;
  const name = [l.first_name, l.last_name].filter(Boolean).join(' ');
  return [name, l.project_address].filter(Boolean).join(' | ') || 'Untitled lead';
}

// yyyy-mm-dd for a native <input type="date"> from whatever ISO-ish string
// the API returned (or '' if unset) -- last_contacted_at is the only date
// field made inline-editable; created_at stays read-only immutable
// metadata, matching every other page in this app.
function toDateInputValue(iso: string | null): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

function tempColor(temp: string | null): string {
  if (temp === 'hot') return 'var(--red)';
  if (temp === 'warm') return 'var(--amber)';
  if (temp === 'cold') return 'var(--blue)';
  return 'var(--t3)';
}

// Stage badge/select color derived from the stage's won/lost flags plus its
// position among the still-open stages -- recreates the old hardcoded
// gray->blue->amber pipeline progression without hardcoding any specific
// stage key, since stages are now admin-editable/addable.
function stageColor(stage: LeadStage | undefined, openStages: LeadStage[]): string {
  if (!stage) return 'var(--t3)';
  if (stage.is_won) return 'var(--green)';
  if (stage.is_lost) return 'var(--red)';
  const idx = openStages.findIndex((s) => s.id === stage.id);
  const third = Math.ceil(openStages.length / 3) || 1;
  if (idx < third) return 'var(--t3)';
  if (idx < third * 2) return 'var(--blue)';
  return 'var(--amber)';
}

// Applies a saved custom section order on top of the stage pipeline's own
// sort_order, same pattern as Projects.tsx's orderedStatuses: stages the
// user has explicitly arranged come first, in their saved order; any status
// present on a lead but not in that saved order yet (a brand-new stage, or
// before anything's been customized) falls back to its normal pipeline
// position instead of vanishing or landing somewhere arbitrary.
function orderedStages(customOrder: string[], present: string[], pipelineOrder: string[]): string[] {
  if (customOrder.length === 0) {
    const known = pipelineOrder.filter((s) => present.includes(s));
    const rest = present.filter((s) => !pipelineOrder.includes(s)).sort();
    return [...known, ...rest];
  }
  const known = customOrder.filter((s) => present.includes(s));
  const missing = present.filter((s) => !customOrder.includes(s));
  const missingKnown = pipelineOrder.filter((s) => missing.includes(s));
  const missingRest = missing.filter((s) => !pipelineOrder.includes(s)).sort();
  return [...known, ...missingKnown, ...missingRest];
}

// One click-to-edit cell -- shows plain text (or a placeholder) until
// clicked, then swaps to a real input/textarea; blur or Enter commits,
// Escape reverts. `displayValue` lets the read view show something richer
// than the raw editable value (e.g. the Lead cell shows the full computed
// "Name | Address" title, but editing only touches first_name).
function EditableCell({
  value,
  onCommit,
  placeholder = '—',
  type = 'text',
  multiline = false,
  displayValue,
  style,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  type?: string;
  multiline?: boolean;
  displayValue?: ReactNode;
  style?: CSSProperties;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  function commit(next: string) {
    setEditing(false);
    if (next !== value) onCommit(next);
  }

  if (editing) {
    const commonProps = {
      className: 'fi',
      autoFocus: true,
      value: draft,
      onClick: (e: React.MouseEvent) => e.stopPropagation(),
      onBlur: () => commit(draft),
      style: { fontSize: 12, width: '100%', ...style },
    };
    if (multiline) {
      return (
        <textarea
          {...commonProps}
          rows={2}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setDraft(value);
              setEditing(false);
            }
          }}
        />
      );
    }
    return (
      <input
        {...commonProps}
        type={type}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(draft);
          if (e.key === 'Escape') {
            setDraft(value);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      title="Click to edit"
      style={{ cursor: 'text', minHeight: 16, ...style }}
    >
      {displayValue !== undefined ? displayValue : value || <span style={{ color: 'var(--t3)' }}>{placeholder}</span>}
    </div>
  );
}

export default function Leads() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [stages, setStages] = useState<LeadStage[]>([]);
  const [showStagesModal, setShowStagesModal] = useState(false);
  const [filter, setFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [showNew, setShowNew] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [convertingLead, setConvertingLead] = useState<Lead | null>(null);
  const [allTags, setAllTags] = useState<PersonTag[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();
  const navigate = useNavigate();
  // Saved section order/collapse state for the stage-grouped board -- same
  // "fetched once, kept in sync optimistically, PUT back to persist" shape
  // as Projects.tsx's own board layout.
  const [stageOrder, setStageOrder] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const sensors = useDndSensors();

  async function load() {
    try {
      const data = await api.get<Lead[]>('/leads');
      setLeads(data);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load leads', true);
      setLeads([]);
    }
  }

  function loadStages() {
    api
      .get<LeadStage[]>('/lead-stages')
      .then(setStages)
      .catch(() => toast('Failed to load sales stages', true));
  }

  useEffect(() => {
    load();
    loadStages();
    api.get<PersonTag[]>('/person-tags').then(setAllTags).catch(() => {});
    api
      .get<LeadBoardLayout>('/leads/board-layout')
      .then((layout) => {
        setStageOrder(layout.stage_order);
        setCollapsed(Object.fromEntries(layout.collapsed_stages.map((s) => [s, true])));
      })
      .catch(() => {
        // No saved layout yet (or failed to load) -- canonical pipeline
        // order, nothing collapsed, same as before this feature existed.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowNew(true);
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const stageByKey = useMemo(() => new Map(stages.map((s) => [s.key, s])), [stages]);
  // Everything manually selectable in the Sales stage dropdown -- excludes
  // only the "won" terminal stage(s), which are set exclusively by the
  // explicit Convert action. Lost stages stay selectable by hand, matching
  // the pre-existing "Stage 6: Missed Opportunity" behavior.
  const openStages = useMemo(() => stages.filter((s) => !s.is_won), [stages]);

  const filterOptions = useMemo(
    () => [
      { key: 'all', label: 'All' },
      ...stages.filter((s) => s.is_open).map((s) => ({ key: s.key, label: s.label })),
      { key: '__won__', label: 'Won' },
      { key: '__lost__', label: 'Lost' },
    ],
    [stages]
  );

  // Pulls the value used to compare two leads for a given column -- kept
  // inside the component since stage rank/temp rank now depend on the
  // fetched stage list, not a hardcoded union.
  function sortValue(l: Lead, key: SortKey): string | number | null {
    switch (key) {
      case 'title':
        return leadTitle(l);
      case 'project_scope':
        return l.project_scope || null;
      case 'status':
        return stageByKey.get(l.status)?.sort_order ?? 99;
      case 'lead_temp':
        return l.lead_temp ? TEMP_RANK[l.lead_temp] ?? 99 : null;
      case 'projected_profit':
        return l.projected_profit ?? null;
      case 'client':
        return l.converted_client_id ? 1 : 0;
      case 'created_at':
        return l.created_at || null;
      case 'last_contacted_at':
        return l.last_contacted_at || null;
      case 'referred_by':
        return (l.referred_by ? [l.referred_by.first_name, l.referred_by.last_name].filter(Boolean).join(' ') : l.referral_name) || null;
      case 'notes':
        return [l.notes, l.objections].filter(Boolean).join(' ') || null;
      default:
        return null;
    }
  }

  const filtered = useMemo(() => {
    if (!leads) return [];
    const list =
      filter === 'all'
        ? leads
        : filter === '__won__'
        ? leads.filter((l) => stageByKey.get(l.status)?.is_won)
        : filter === '__lost__'
        ? leads.filter((l) => stageByKey.get(l.status)?.is_lost)
        : leads.filter((l) => l.status === filter);
    const sorted = [...list].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, filter, sortKey, sortDir, stageByKey]);

  // Grouped by sales stage into collapsible, draggable-order sections --
  // same organizational structure as the Projects page's status-grouped
  // board. The filter chips above still narrow this down first (picking one
  // stage naturally collapses this to a single section, same as Projects).
  const pipelineOrder = useMemo(() => stages.map((s) => s.key), [stages]);
  const groups = useMemo(() => {
    const map = new Map<string, Lead[]>();
    for (const l of filtered) {
      if (!map.has(l.status)) map.set(l.status, []);
      map.get(l.status)!.push(l);
    }
    return orderedStages(stageOrder, [...map.keys()], pipelineOrder).map((status) => ({
      status,
      items: map.get(status)!,
    }));
  }, [filtered, stageOrder, pipelineOrder]);

  async function saveLayout(next: { stage_order?: string[]; collapsed_stages?: string[] }) {
    try {
      await api.put('/leads/board-layout', next);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to save your leads board layout', true);
    }
  }

  function toggleCollapsed(status: string) {
    setCollapsed((prev) => {
      const next = { ...prev, [status]: !prev[status] };
      saveLayout({ collapsed_stages: Object.keys(next).filter((s) => next[s]) });
      return next;
    });
  }

  function handleSectionDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const currentOrder = groups.map((g) => g.status);
    const oldIndex = currentOrder.indexOf(active.id as string);
    const newIndex = currentOrder.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(currentOrder, oldIndex, newIndex);
    setStageOrder(reordered);
    saveLayout({ stage_order: reordered });
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const counts = useMemo(() => {
    if (!leads) return { open: 0, won: 0, lost: 0, total: 0, profit: 0 };
    const open = leads.filter((l) => stageByKey.get(l.status)?.is_open ?? true);
    const won = leads.filter((l) => stageByKey.get(l.status)?.is_won).length;
    const lost = leads.filter((l) => stageByKey.get(l.status)?.is_lost).length;
    const profit = open.reduce((s, l) => s + (l.projected_profit || 0), 0);
    return { open: open.length, won, lost, total: leads.length, profit };
  }, [leads, stageByKey]);

  async function patchLead(id: string, fields: Record<string, unknown>) {
    // Optimistic update -- same pattern as Projects.tsx's inline status
    // select -- so the dropdown/field reflects the change instantly instead
    // of waiting on a full reload.
    setLeads((prev) => (prev ? prev.map((l) => (l.id === id ? { ...l, ...fields } : l)) : prev));
    try {
      await api.patch(`/leads/${id}`, fields);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to update lead', true);
      load();
    }
  }


  return (
    <>
      <div className="ph">
        <div>
          <h1>Lead Opportunities</h1>
          <p>Incoming inquiries and prospects — the top of the sales funnel</p>
        </div>
        <button className="btn btn-p btn-sm" onClick={() => setShowNew(true)}>
          <IconPlus size={14} /> Lead Opportunity
        </button>
      </div>

      <div className="metrics">
        <div className="metric">
          <div className="m-label">Open</div>
          <div className="m-val">{counts.open}</div>
        </div>
        <div className="metric">
          <div className="m-label">Open pipeline (projected profit)</div>
          <div className="m-val" style={{ fontSize: 17 }}>
            {fmt(counts.profit)}
          </div>
        </div>
        <div className="metric">
          <div className="m-label">Closed — Won</div>
          <div className="m-val" style={{ color: 'var(--green)' }}>
            {counts.won}
          </div>
        </div>
        <div className="metric">
          <div className="m-label">Closed — Lost</div>
          <div className="m-val" style={{ color: 'var(--red)' }}>
            {counts.lost}
          </div>
        </div>
        <div className="metric">
          <div className="m-label">Total</div>
          <div className="m-val">{counts.total}</div>
        </div>
      </div>

      <div style={{ position: 'sticky', top: 'var(--tb)', zIndex: 50, background: 'var(--bg)', margin: '0 -24px' }}>
        <div className="tabs" style={{ borderRadius: 0 }}>
          <div className="tab on">List view</div>
          <div className="tab disabled">Activity view</div>
          <div className="tab disabled">Activity calendar</div>
          <div className="tab disabled">Activity templates</div>
          <div className="tab disabled">Lead proposals</div>
          <div className="tab disabled">Proposal templates</div>
          <div className="tab disabled">Map</div>
        </div>

        <div className="sh" style={{ margin: 0, padding: '12px 24px' }}>
          <div className="st">All leads</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="filters">
              {filterOptions.map((f) => (
                <button key={f.key} className={`fb${filter === f.key ? ' on' : ''}`} onClick={() => setFilter(f.key)}>
                  {f.label}
                </button>
              ))}
            </div>
            {user?.is_admin && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowStagesModal(true)} title="Edit sales stages">
                <IconSettings size={14} /> Edit stages
              </button>
            )}
          </div>
        </div>
      </div>

      {leads === null ? (
        <div className="card">
          <div className="empty">
            <div className="empty-t">Loading…</div>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <div className="empty">
            <IconPlus size={32} color="var(--t3)" style={{ display: 'block', margin: '0 auto 12px' }} />
            <div className="empty-t">No leads</div>
            <div className="empty-s">Add a lead opportunity to get started.</div>
          </div>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSectionDragEnd}>
          <SortableContext items={groups.map((g) => g.status)} strategy={verticalListSortingStrategy}>
            {groups.map(({ status, items }) => (
              <LeadStageSection
                key={status}
                status={status}
                items={items}
                stageByKey={stageByKey}
                collapsed={!!collapsed[status]}
                dragDisabled={filter !== 'all'}
                onToggleCollapsed={() => toggleCollapsed(status)}
                sortKey={sortKey}
                sortDir={sortDir}
                toggleSort={toggleSort}
                openStages={openStages}
                isAdmin={!!user?.is_admin}
                onEditStages={() => setShowStagesModal(true)}
                onPatchLead={patchLead}
                onOpenLead={setEditingLead}
                onConvertLead={setConvertingLead}
                onNavigateProject={(id) => navigate(`/projects/${id}`)}
                allTags={allTags}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}

      {showNew && (
        <NewLeadModal
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            toast('Lead created');
            load();
          }}
        />
      )}

      {editingLead && (
        <NewLeadModal
          lead={editingLead}
          onClose={() => setEditingLead(null)}
          onCreated={() => {
            setEditingLead(null);
            toast('Lead updated');
            load();
          }}
        />
      )}

      {convertingLead && (
        <ConvertLeadModal
          lead={convertingLead}
          onClose={() => setConvertingLead(null)}
          onConverted={(res) => {
            setConvertingLead(null);
            toast('Lead converted -- client and project created');
            load();
            navigate(`/projects/${res.project_id}`);
          }}
        />
      )}

      {showStagesModal && (
        <LeadStagesModal stages={stages} onClose={() => setShowStagesModal(false)} onChanged={loadStages} />
      )}
    </>
  );
}

function LeadStageSection({
  status,
  items,
  stageByKey,
  collapsed,
  dragDisabled,
  onToggleCollapsed,
  sortKey,
  sortDir,
  toggleSort,
  openStages,
  isAdmin,
  onEditStages,
  onPatchLead,
  onOpenLead,
  onConvertLead,
  onNavigateProject,
  allTags,
}: {
  status: string;
  items: Lead[];
  stageByKey: Map<string, LeadStage>;
  collapsed: boolean;
  dragDisabled: boolean;
  onToggleCollapsed: () => void;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  toggleSort: (key: SortKey) => void;
  openStages: LeadStage[];
  isAdmin: boolean;
  onEditStages: () => void;
  onPatchLead: (id: string, fields: Record<string, unknown>) => void;
  onOpenLead: (lead: Lead) => void;
  onConvertLead: (lead: Lead) => void;
  onNavigateProject: (projectId: string) => void;
  allTags: PersonTag[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: status,
    disabled: dragDisabled,
  });

  function SortTh({ label, sortKeyValue }: { label: string; sortKeyValue: SortKey }) {
    const active = sortKey === sortKeyValue;
    return (
      <th className="sortable" onClick={() => toggleSort(sortKeyValue)}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
          {label}
          {active ? (sortDir === 'asc' ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />) : null}
        </span>
      </th>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={{ marginBottom: 20, transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
    >
      <div className="sh">
        <div className="st" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            className="btn-reset"
            {...(dragDisabled ? {} : attributes)}
            {...(dragDisabled ? {} : listeners)}
            style={{
              display: 'flex',
              cursor: dragDisabled ? 'not-allowed' : 'grab',
              color: dragDisabled ? 'var(--border-md)' : 'var(--t3)',
              touchAction: 'none',
            }}
            title={dragDisabled ? 'Clear the stage filter to reorder sections' : 'Drag to reorder this section'}
          >
            <IconGripVertical size={14} />
          </button>
          <button type="button" className="btn-reset" onClick={onToggleCollapsed} style={{ display: 'flex', color: 'var(--t2)' }} title={collapsed ? 'Expand' : 'Minimize'}>
            {collapsed ? <IconChevronRight size={16} /> : <IconChevronDown size={16} />}
          </button>
          {stageByKey.get(status)?.label || status} ({items.length})
        </div>
      </div>
      {!collapsed && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="tbl-scroll">
            <table className="tbl tbl-zebra">
              <thead>
                <tr>
                  <SortTh label="Lead" sortKeyValue="title" />
                  <SortTh label="Project scope" sortKeyValue="project_scope" />
                  <SortTh label="Sales stage" sortKeyValue="status" />
                  <SortTh label="Lead temp" sortKeyValue="lead_temp" />
                  <SortTh label="Projected profit" sortKeyValue="projected_profit" />
                  <SortTh label="Client?" sortKeyValue="client" />
                  <SortTh label="Created" sortKeyValue="created_at" />
                  <SortTh label="Last Engaged" sortKeyValue="last_contacted_at" />
                  <SortTh label="Referred by" sortKeyValue="referred_by" />
                  <SortTh label="Notes / Objections" sortKeyValue="notes" />
                  <th>Tags</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((l) => (
                  <LeadRow
                    key={l.id}
                    lead={l}
                    stageByKey={stageByKey}
                    openStages={openStages}
                    isAdmin={isAdmin}
                    onEditStages={onEditStages}
                    onPatchLead={onPatchLead}
                    onOpenLead={onOpenLead}
                    onConvertLead={onConvertLead}
                    onNavigateProject={onNavigateProject}
                    allTags={allTags}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function LeadRow({
  lead: l,
  stageByKey,
  openStages,
  isAdmin,
  onEditStages,
  onPatchLead,
  onOpenLead,
  onConvertLead,
  onNavigateProject,
  allTags,
}: {
  lead: Lead;
  stageByKey: Map<string, LeadStage>;
  openStages: LeadStage[];
  isAdmin: boolean;
  onEditStages: () => void;
  onPatchLead: (id: string, fields: Record<string, unknown>) => void;
  onOpenLead: (lead: Lead) => void;
  onConvertLead: (lead: Lead) => void;
  onNavigateProject: (projectId: string) => void;
  allTags: PersonTag[];
}) {
  const stage = stageByKey.get(l.status);
  const referredByName = l.referred_by
    ? [l.referred_by.first_name, l.referred_by.last_name].filter(Boolean).join(' ')
    : l.referral_name;
  const isConverted = !!l.converted_client_id;
  return (
    <tr style={{ cursor: 'pointer' }} onClick={() => onOpenLead(l)}>
      <td style={{ fontWeight: 500, color: 'var(--blue)' }}>
        <EditableCell
          value={l.first_name || ''}
          displayValue={leadTitle(l)}
          onCommit={(v) => onPatchLead(l.id, { first_name: v.trim() || null })}
          style={{ fontWeight: 500, color: 'var(--blue)' }}
        />
      </td>
      <td style={{ maxWidth: 220, color: 'var(--t2)' }}>
        <EditableCell
          value={l.project_scope || ''}
          placeholder="Add scope..."
          onCommit={(v) => onPatchLead(l.id, { project_scope: v.trim() || null })}
          style={{ color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        />
      </td>
      <td onClick={(e) => e.stopPropagation()}>
        {isConverted ? (
          <span className="badge bg-green">Converted</span>
        ) : (
          <select
            className="fi"
            style={{ fontSize: 12, padding: '3px 6px', minWidth: 160, color: stageColor(stage, openStages), fontWeight: 600 }}
            value={l.status}
            onChange={(e) => {
              if (e.target.value === EDIT_STAGES_VALUE) {
                e.target.value = l.status;
                onEditStages();
                return;
              }
              onPatchLead(l.id, { status: e.target.value });
            }}
          >
            {openStages.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
            {isAdmin && <option value={EDIT_STAGES_VALUE}>✎ Edit stages...</option>}
          </select>
        )}
      </td>
      <td onClick={(e) => e.stopPropagation()}>
        <select
          className="fi"
          style={{ fontSize: 12, padding: '3px 6px', color: tempColor(l.lead_temp), fontWeight: 600, textTransform: 'capitalize' }}
          value={l.lead_temp || ''}
          onChange={(e) => onPatchLead(l.id, { lead_temp: e.target.value || null })}
        >
          <option value="">—</option>
          {TEMP_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </td>
      <td onClick={(e) => e.stopPropagation()} style={{ minWidth: 110 }}>
        <MoneyField
          value={l.projected_profit != null ? String(l.projected_profit) : ''}
          onCommit={(v) => onPatchLead(l.id, { projected_profit: v.trim() === '' ? null : Number(v) })}
        />
      </td>
      <td>
        <span className={`badge ${isConverted ? 'bg-green' : 'bg-gray'}`} title="Set automatically by Convert -- not directly editable">
          {isConverted ? 'Yes' : 'No'}
        </span>
      </td>
      <td>{fmtD(l.created_at)}</td>
      <td>
        <EditableCell
          value={toDateInputValue(l.last_contacted_at)}
          type="date"
          displayValue={l.last_contacted_at ? fmtD(l.last_contacted_at) : undefined}
          onCommit={(v) => onPatchLead(l.id, { last_contacted_at: v || null })}
        />
      </td>
      <td>
        {l.referred_by ? (
          <span title="Linked client referral -- edit from the full lead form to change">{referredByName}</span>
        ) : (
          <EditableCell
            value={l.referral_name || ''}
            placeholder="Add referral..."
            onCommit={(v) => onPatchLead(l.id, { referral_name: v.trim() || null })}
          />
        )}
      </td>
      <td style={{ maxWidth: 240, fontSize: 12 }}>
        <EditableCell
          value={l.notes || ''}
          placeholder="Add notes..."
          multiline
          onCommit={(v) => onPatchLead(l.id, { notes: v.trim() || null })}
          style={{ color: 'var(--t2)', marginBottom: 2 }}
        />
        <EditableCell
          value={l.objections || ''}
          placeholder="Add objection..."
          multiline
          displayValue={l.objections ? <span style={{ color: 'var(--red)' }}>⚑ {l.objections}</span> : undefined}
          onCommit={(v) => onPatchLead(l.id, { objections: v.trim() || null })}
          style={{ color: 'var(--red)' }}
        />
      </td>
      <td onClick={(e) => e.stopPropagation()}>
        <EntityTagList entityType="lead" entityId={l.id} allTags={allTags} />
      </td>
      <td onClick={(e) => e.stopPropagation()}>
        {l.converted_project_id ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNavigateProject(l.converted_project_id!)}>
            View project <IconArrowRight size={13} />
          </button>
        ) : (
          <button type="button" className="btn btn-sm" onClick={() => onConvertLead(l)}>
            Convert
          </button>
        )}
      </td>
    </tr>
  );
}
