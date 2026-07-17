import { useEffect, useMemo, useState } from 'react';
import { IconPlus } from '@tabler/icons-react';
import { api } from '../api/client';
import { useToast } from '../components/ui/Toast';
import { fmt, fmtD, fmtAge } from '../lib/format';
import type { Lead, LeadStatus } from '../types';
import { NewLeadModal } from '../components/leads/NewLeadModal';

type SortKey = 'created_at' | 'title' | 'last_contacted_at';

const STATUS_GROUPS: Record<LeadStatus, { label: string; cls: string }> = {
  new: { label: 'Open', cls: 'bg-gray' },
  contacted: { label: 'Open', cls: 'bg-blue' },
  qualified: { label: 'Open', cls: 'bg-blue' },
  converted: { label: 'Closed — Won', cls: 'bg-green' },
  disqualified: { label: 'Closed — Lost', cls: 'bg-red' },
};

const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'qualified', label: 'Qualified' },
  { key: 'converted', label: 'Converted' },
  { key: 'disqualified', label: 'Disqualified' },
];

function leadTitle(l: Lead): string {
  if (l.title) return l.title;
  const name = [l.first_name, l.last_name].filter(Boolean).join(' ');
  return [name, l.project_address].filter(Boolean).join(' | ') || 'Untitled lead';
}

export default function Leads() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [filter, setFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [showNew, setShowNew] = useState(false);
  const toast = useToast();

  async function load() {
    try {
      const data = await api.get<Lead[]>('/leads');
      setLeads(data);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load leads', true);
      setLeads([]);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!leads) return [];
    const list = filter === 'all' ? leads : leads.filter((l) => l.status === filter);
    const sorted = [...list].sort((a, b) => {
      const av = a[sortKey] || '';
      const bv = b[sortKey] || '';
      const cmp = String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [leads, filter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const counts = useMemo(() => {
    if (!leads) return { open: 0, won: 0, lost: 0, total: 0 };
    const open = leads.filter((l) => ['new', 'contacted', 'qualified'].includes(l.status)).length;
    const won = leads.filter((l) => l.status === 'converted').length;
    const lost = leads.filter((l) => l.status === 'disqualified').length;
    return { open, won, lost, total: leads.length };
  }, [leads]);

  return (
    <>
      <div className="ph">
        <div>
          <h1>Lead Opportunities</h1>
          <p>Incoming inquiries and prospects</p>
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

      <div className="tabs" style={{ margin: '0 -24px 16px', borderRadius: 0 }}>
        <div className="tab on">List view</div>
        <div className="tab disabled">Activity view</div>
        <div className="tab disabled">Activity calendar</div>
        <div className="tab disabled">Activity templates</div>
        <div className="tab disabled">Lead proposals</div>
        <div className="tab disabled">Proposal templates</div>
        <div className="tab disabled">Map</div>
      </div>

      <div className="sh">
        <div className="st">All leads</div>
        <div className="filters">
          {FILTERS.map((f) => (
            <button key={f.key} className={`fb${filter === f.key ? ' on' : ''}`} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        {leads === null ? (
          <div className="empty">
            <div className="empty-t">Loading…</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <IconPlus size={32} color="var(--t3)" style={{ display: 'block', margin: '0 auto 12px' }} />
            <div className="empty-t">No leads</div>
            <div className="empty-s">Add a lead opportunity to get started.</div>
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th className="sortable" onClick={() => toggleSort('title')}>
                  Title
                </th>
                <th className="sortable" onClick={() => toggleSort('created_at')}>
                  Created Date
                </th>
                <th>Client Contact</th>
                <th>Lead Status</th>
                <th>Age</th>
                <th>Confidence</th>
                <th>Est. Revenue Min</th>
                <th>Est. Revenue Max</th>
                <th className="sortable" onClick={() => toggleSort('last_contacted_at')}>
                  Last Contacted
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => {
                const group = STATUS_GROUPS[l.status];
                const confidence = l.confidence ?? 0;
                return (
                  <tr key={l.id}>
                    <td style={{ fontWeight: 500, color: 'var(--blue)' }}>{leadTitle(l)}</td>
                    <td>{fmtD(l.created_at)}</td>
                    <td>{[l.first_name, l.last_name].filter(Boolean).join(' ') || '—'}</td>
                    <td>
                      <span className={`badge ${group.cls}`}>{group.label}</span>
                    </td>
                    <td>{fmtAge(l.created_at)}</td>
                    <td>
                      <span className="confidence-bar">
                        <span className="confidence-fill" style={{ width: `${confidence}%` }} />
                      </span>{' '}
                      {confidence}%
                    </td>
                    <td>{fmt(l.estimated_revenue_min ?? l.budget_range_min)}</td>
                    <td>{fmt(l.estimated_revenue_max ?? l.budget_range_max)}</td>
                    <td>{fmtD(l.last_contacted_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

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
    </>
  );
}
