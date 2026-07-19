import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { IconPlus, IconBuilding } from '@tabler/icons-react';
import { api } from '../api/client';
import { useToast } from '../components/ui/Toast';
import { fmt } from '../lib/format';
import type { Project } from '../types';
import { NewProjectModal } from '../components/projects/NewProjectModal';

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-green',
  complete: 'bg-green',
  estimating: 'bg-amber',
  proposed: 'bg-blue',
  lead: 'bg-gray',
  vetting: 'bg-gray',
  punch_list: 'bg-purple',
  on_hold: 'bg-amber',
  lost: 'bg-red',
};

const FILTERS = ['all', 'lead', 'vetting', 'estimating', 'proposed', 'active', 'complete', 'on_hold'];

function projectTitle(name: string) {
  return name.replace(/\|.*/, '').trim();
}

export default function Projects() {
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

  const activeCount = projects?.filter((p) => p.status === 'active').length ?? 0;
  const totalContractValue = projects?.reduce((s, p) => s + (p.contract_value || 0), 0) ?? 0;

  return (
    <>
      <div className="ph">
        <div>
          <h1>Projects</h1>
          <p>All active and pipeline projects</p>
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
        <div className="empty">
          <div className="empty-t">Loading…</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <IconBuilding size={32} color="var(--t3)" style={{ display: 'block', margin: '0 auto 12px' }} />
          <div className="empty-t">No projects</div>
          <div className="empty-s">Create a project to get started.</div>
        </div>
      ) : (
        filtered.map((p) => (
          <Link key={p.id} to={`/projects/${p.id}`} className="pc" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="pi">
              <div className="pn">{projectTitle(p.name)}</div>
              <div className="ps">
                {p.clients ? `${p.clients.first_name || ''} ${p.clients.last_name || ''}`.trim() : 'No client'}
                {p.project_type ? ` · ${p.project_type}` : ''}
              </div>
            </div>
            <div className="pm">
              {p.contract_value ? <span style={{ fontSize: 12, color: 'var(--t2)' }}>{fmt(p.contract_value)}</span> : null}
              <span className={`badge ${STATUS_BADGE[p.status] || 'bg-gray'}`}>{p.status.replace('_', ' ')}</span>
            </div>
          </Link>
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
