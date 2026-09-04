import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IconPlus, IconBuilding, IconGripVertical, IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { api, ApiError } from '../api/client';
import { useToast } from '../components/ui/Toast';
import { useDndSensors } from '../hooks/useDndSensors';
import { fmt } from '../lib/format';
import type { Project, ProjectBoardLayout } from '../types';
import { NewProjectModal } from '../components/projects/NewProjectModal';
import { Skeleton } from '../components/ui/Skeleton';
import { PROJECT_STATUS_OPTIONS as PROJECT_STATUS_ORDER, projectStatusLabel, statusOptionsIncluding } from '../lib/projectStatuses';

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-green',
  closed: 'bg-green',
  warranty: 'bg-blue',
  estimating: 'bg-amber',
  proposed: 'bg-blue',
  pre_construction: 'bg-purple',
  lead: 'bg-gray',
  vetting: 'bg-gray',
  punch_list: 'bg-purple',
  on_hold: 'bg-amber',
  lost: 'bg-red',
};

const FILTERS = ['all', 'lead', 'vetting', 'estimating', 'proposed', 'pre_construction', 'active', 'closed', 'warranty', 'on_hold'];

function projectTitle(name: string) {
  return name.replace(/\|.*/, '').trim();
}

// Applies a saved custom section order on top of the app's canonical
// pipeline order: statuses the user has explicitly arranged come first, in
// their saved order; any status with projects that isn't in that saved
// order yet (a brand-new status, or the very first load before anything's
// been customized) falls back to its normal pipeline position instead of
// vanishing or landing somewhere arbitrary.
function orderedStatuses(customOrder: string[], present: string[]): string[] {
  if (customOrder.length === 0) {
    const known = PROJECT_STATUS_ORDER.filter((s) => present.includes(s));
    const rest = present.filter((s) => !(PROJECT_STATUS_ORDER as readonly string[]).includes(s)).sort();
    return [...known, ...rest];
  }
  const known = customOrder.filter((s) => present.includes(s));
  const missing = present.filter((s) => !customOrder.includes(s));
  const missingKnown = PROJECT_STATUS_ORDER.filter((s) => missing.includes(s));
  const missingRest = missing.filter((s) => !(PROJECT_STATUS_ORDER as readonly string[]).includes(s)).sort();
  return [...known, ...missingKnown, ...missingRest];
}

export default function Projects() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [filter, setFilter] = useState('all');
  const [showNew, setShowNew] = useState(false);
  // Saved section order/collapse state -- fetched once, then kept in sync
  // locally (optimistic) as the user drags/collapses, PUT back to persist.
  const [statusOrder, setStatusOrder] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toast = useToast();
  const sensors = useDndSensors();

  async function load() {
    try {
      const data = await api.get<Project[]>('/projects');
      setProjects(data);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load projects', true);
      setProjects([]);
    }
  }

  useEffect(() => {
    load();
    api
      .get<ProjectBoardLayout>('/projects/board-layout')
      .then((layout) => {
        setStatusOrder(layout.status_order);
        setCollapsed(Object.fromEntries(layout.collapsed_statuses.map((s) => [s, true])));
      })
      .catch(() => {
        // No saved layout yet (or failed to load) -- canonical order,
        // nothing collapsed, same as before this feature existed.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!projects) return [];
    return filter === 'all' ? projects : projects.filter((p) => p.status === filter);
  }, [projects, filter]);

  // Grouped by status -- same pipeline-order pattern as the Estimates page's
  // own project-status grouping, just one axis instead of two (a project has
  // only its own status, not a separate line-item-style status to track).
  // The existing filter chips above still narrow this down first, so picking
  // one status naturally collapses this to a single section. Section order
  // defaults to the canonical pipeline order but can be dragged into
  // whatever order the user prefers (persisted via statusOrder).
  const groups = useMemo(() => {
    const map = new Map<string, Project[]>();
    for (const p of filtered) {
      if (!map.has(p.status)) map.set(p.status, []);
      map.get(p.status)!.push(p);
    }
    return orderedStatuses(statusOrder, [...map.keys()]).map((status) => ({ status, items: map.get(status)! }));
  }, [filtered, statusOrder]);

  async function saveLayout(next: { status_order?: string[]; collapsed_statuses?: string[] }) {
    try {
      await api.put('/projects/board-layout', next);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to save your project board layout', true);
    }
  }

  function toggleCollapsed(status: string) {
    setCollapsed((prev) => {
      const next = { ...prev, [status]: !prev[status] };
      saveLayout({ collapsed_statuses: Object.keys(next).filter((s) => next[s]) });
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
    setStatusOrder(reordered);
    saveLayout({ status_order: reordered });
  }

  const activeCount = projects?.filter((p) => p.status === 'active').length ?? 0;
  const totalContractValue = projects?.reduce((s, p) => s + (p.contract_value || 0), 0) ?? 0;

  async function handleStatusChange(project: Project, newStatus: string) {
    const previous = project.status;
    setProjects((prev) => prev && prev.map((p) => (p.id === project.id ? { ...p, status: newStatus } : p)));
    try {
      await api.patch(`/projects/${project.id}`, { status: newStatus });
    } catch (e) {
      setProjects((prev) => prev && prev.map((p) => (p.id === project.id ? { ...p, status: previous } : p)));
      toast(e instanceof ApiError ? e.message : 'Failed to update status', true);
    }
  }

  return (
    <>
      <div className="ph">
        <div>
          <h1>Projects</h1>
          <p>All active and pipeline projects, grouped by status</p>
        </div>
        <button className="btn btn-p btn-sm" onClick={() => setShowNew(true)}>
          <IconPlus size={14} /> New project
        </button>
      </div>

      <div className="metrics">
        <div className="metric">
          <div className="m-label">Total projects</div>
          <div className="m-val">{projects?.length ?? 0}</div>
        </div>
        <div className="metric">
          <div className="m-label">Active builds</div>
          <div className="m-val">{activeCount}</div>
        </div>
        <div className="metric">
          <div className="m-label">Total contract value</div>
          <div className="m-val" style={{ fontSize: 17 }}>
            {fmt(totalContractValue)}
          </div>
        </div>
      </div>

      <div className="sh">
        <div className="st">All projects</div>
        <div className="filters">
          {FILTERS.map((f) => (
            <button key={f} className={`fb${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {projects === null ? (
        Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="pc">
            <div className="pi">
              <Skeleton width={180} height={13} style={{ marginBottom: 6 }} />
              <Skeleton width={120} height={12} />
            </div>
          </div>
        ))
      ) : filtered.length === 0 ? (
        <div className="empty">
          <IconBuilding size={32} color="var(--t3)" style={{ display: 'block', margin: '0 auto 12px' }} />
          <div className="empty-t">No projects</div>
          <div className="empty-s">Create a project to get started.</div>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSectionDragEnd}>
          <SortableContext items={groups.map((g) => g.status)} strategy={verticalListSortingStrategy}>
            {groups.map(({ status, items }) => (
              <ProjectStatusSection
                key={status}
                status={status}
                items={items}
                collapsed={!!collapsed[status]}
                dragDisabled={filter !== 'all'}
                onToggleCollapsed={() => toggleCollapsed(status)}
                onNavigate={(id) => navigate(`/projects/${id}`)}
                onStatusChange={handleStatusChange}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}

      {showNew && (
        <NewProjectModal
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            toast('Project created');
            load();
          }}
        />
      )}
    </>
  );
}

function ProjectStatusSection({
  status,
  items,
  collapsed,
  dragDisabled,
  onToggleCollapsed,
  onNavigate,
  onStatusChange,
}: {
  status: string;
  items: Project[];
  collapsed: boolean;
  dragDisabled: boolean;
  onToggleCollapsed: () => void;
  onNavigate: (id: string) => void;
  onStatusChange: (project: Project, newStatus: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: status,
    disabled: dragDisabled,
  });

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
            title={dragDisabled ? 'Clear the status filter to reorder sections' : 'Drag to reorder this section'}
          >
            <IconGripVertical size={14} />
          </button>
          <button type="button" className="btn-reset" onClick={onToggleCollapsed} style={{ display: 'flex', color: 'var(--t2)' }} title={collapsed ? 'Expand' : 'Minimize'}>
            {collapsed ? <IconChevronRight size={16} /> : <IconChevronDown size={16} />}
          </button>
          {projectStatusLabel(status)} ({items.length})
        </div>
      </div>
      {!collapsed &&
        items.map((p) => (
          <ProjectCard key={p.id} project={p} onNavigate={() => onNavigate(p.id)} onStatusChange={onStatusChange} />
        ))}
    </div>
  );
}

function ProjectCard({
  project: p,
  onNavigate,
  onStatusChange,
}: {
  project: Project;
  onNavigate: () => void;
  onStatusChange: (project: Project, newStatus: string) => void;
}) {
  return (
    <div
      className="pc"
      role="link"
      tabIndex={0}
      style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}
      onClick={onNavigate}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onNavigate();
      }}
    >
      <div className="pi">
        <div className="pn">{projectTitle(p.name)}</div>
        <div className="ps">
          {p.clients ? `${p.clients.first_name || ''} ${p.clients.last_name || ''}`.trim() : 'No client'}
          {p.project_type ? ` · ${p.project_type}` : ''}
        </div>
      </div>
      <div className="pm">
        {p.contract_value ? <span style={{ fontSize: 12, color: 'var(--t2)' }}>{fmt(p.contract_value)}</span> : null}
        <select
          className={`badge ${STATUS_BADGE[p.status] || 'bg-gray'}`}
          style={{ border: 'none', WebkitAppearance: 'none', appearance: 'none', cursor: 'pointer', textTransform: 'capitalize', font: 'inherit' }}
          value={p.status}
          title="Change status"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            e.stopPropagation();
            onStatusChange(p, e.target.value);
          }}
        >
          {statusOptionsIncluding(p.status).map((s) => (
            <option key={s} value={s}>
              {s.replace('_', ' ')}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
