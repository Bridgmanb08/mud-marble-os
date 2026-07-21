import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconBriefcase } from '@tabler/icons-react';
import { api } from '../api/client';
import { useToast } from '../components/ui/Toast';
import { fmt } from '../lib/format';
import type { Project, Transaction } from '../types';

export default function InHouse() {
  const navigate = useNavigate();
  const toast = useToast();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    api
      .get<Project[]>('/projects?include_archived=true')
      .then(setProjects)
      .catch((e) => {
        toast(e instanceof Error ? e.message : 'Failed to load jobs', true);
        setProjects([]);
      });
    api.get<Transaction[]>('/transactions').then(setTransactions).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byProject = useMemo(() => {
    const map = new Map<string, { income: number; expense: number }>();
    for (const t of transactions) {
      const entry = map.get(t.project_id) || { income: 0, expense: 0 };
      if (t.amount >= 0) entry.income += t.amount;
      else entry.expense += Math.abs(t.amount);
      map.set(t.project_id, entry);
    }
    return map;
  }, [transactions]);

  const active = projects?.filter((p) => !p.is_archived) ?? [];
  const archived = projects?.filter((p) => p.is_archived) ?? [];

  function renderRow(p: Project) {
    const rollup = byProject.get(p.id);
    return (
      <button
        key={p.id}
        type="button"
        className="cc btn-reset"
        style={{ width: '100%', cursor: 'pointer' }}
        onClick={() => navigate(`/inhouse/${p.id}`)}
      >
        <div className="av">{(p.name || '?')[0]}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name.replace(/\|.*/, '').trim()}</div>
          <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 2 }}>
            {p.clients ? `${p.clients.first_name || ''} ${p.clients.last_name || ''}`.trim() || 'No client' : 'No client'}
          </div>
        </div>
        {rollup && (
          <div style={{ display: 'flex', gap: 14, flexShrink: 0, fontSize: 12 }}>
            <span style={{ color: 'var(--green)' }}>{fmt(rollup.income)}</span>
            <span style={{ color: 'var(--red)' }}>{fmt(rollup.expense)}</span>
          </div>
        )}
        <span className={`badge ${p.is_archived ? 'bg-gray' : 'bg-green'}`}>{p.is_archived ? 'Archived' : 'Active'}</span>
      </button>
    );
  }

  return (
    <>
      <div className="ph">
        <div>
          <h1>In-House Sheet</h1>
          <p>Pick a job to open its financial workshop — transactions, cost codes, and subcontractor payments.</p>
        </div>
      </div>

      {projects === null ? (
        <div className="empty">
          <div className="empty-t">Loading…</div>
        </div>
      ) : projects.length === 0 ? (
        <div className="empty">
          <IconBriefcase size={32} color="var(--t3)" style={{ display: 'block', margin: '0 auto 12px' }} />
          <div className="empty-t">No jobs yet</div>
        </div>
      ) : (
        <>
          <div className="sh">
            <div className="st">Active jobs ({active.length})</div>
          </div>
          {active.map(renderRow)}

          {archived.length > 0 && (
            <>
              <div className="sh" style={{ marginTop: 20 }}>
                <div className="st">Past / archived jobs ({archived.length})</div>
              </div>
              {archived.map(renderRow)}
            </>
          )}
        </>
      )}
    </>
  );
}
