import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconPlus, IconBuilding } from '@tabler/icons-react';
import { api, ApiError } from '../api/client';
import { useToast } from '../components/ui/Toast';
import { fmt } from '../lib/format';
import type { Project } from '../types';
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

export default function Projects() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [filter, setFilter] = useState('all');
  const [showNew, setShowNew] = useState(false);
  const toast = useToast();

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
  // one status naturally collapses this to a single section.
  const groups = useMemo(() => {
    const map = new Map<string, Project[]>();
    for (const p of filtered) {
      if (!map.has(p.status)) map.set(p.status, []);
      map.get(p.status)!.push(p);
    }
    const known = PROJECT_STATUS_ORDER.filter((s) => map.has(s));
    const rest = [...map.keys()].filter((s) => !(PROJECT_STATUS_ORDER as readonly string[]).includes(s)).sort();
    return [...known, ...rest].map((status) => ({ status, items: map.get(status)! }));
  }, [filtered]);

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
        groups.map(({ status, items }) => (
          <div key={status} style={{ marginBottom: 20 }}>
            <div className="sh">
              <div className="st">
                {projectStatusLabel(status)} ({items.length})
              </div>
            </div>
            {items.map((p) => (
              <ProjectCard key={p.id} project={p} onNavigate={() => navigate(`/projects/${p.id}`)} onStatusChange={handleStatusChange} />
            ))}
          </div>
        ))
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
