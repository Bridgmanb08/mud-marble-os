import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { IconPlus, IconArrowRight } from '@tabler/icons-react';
import { api, ApiError } from '../api/client';
import { useToast } from '../components/ui/Toast';
import { fmt, fmtD } from '../lib/format';
import { MoneyField } from '../components/rentals/MoneyField';
import type { Lead, LeadStatus, PersonTag } from '../types';
import { NewLeadModal } from '../components/leads/NewLeadModal';
import { ConvertLeadModal } from '../components/leads/ConvertLeadModal';
import { EntityTagList } from '../components/tags/EntityTagList';

type SortKey = 'created_at' | 'title' | 'last_contacted_at';

// Brent's real pipeline, straight from his "Sales Lead Tracker" spreadsheet's
// Sales Stages sheet -- 'converted' is deliberately excluded from the
// selectable dropdown options below since it's only ever set by the explicit
// Convert action, never picked by hand.
const STAGE_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'stage_1', label: 'Stage 1: Initial Walkthrough' },
  { value: 'stage_2', label: 'Stage 2: Working On Proposal' },
  { value: 'stage_3', label: 'Stage 3: Negotiations' },
  { value: 'stage_4', label: 'Stage 4: Paid For Initial Step' },
  { value: 'stage_5', label: 'Stage 5: Signed!' },
  { value: 'stage_6_lost', label: 'Stage 6: Missed Opportunity' },
];

const TEMP_OPTIONS = ['hot', 'warm', 'cold'];

const STATUS_GROUPS: Record<LeadStatus, { label: string; cls: string }> = {
  new: { label: 'Open', cls: 'bg-gray' },
  stage_1: { label: 'Open', cls: 'bg-gray' },
  stage_2: { label: 'Open', cls: 'bg-blue' },
  stage_3: { label: 'Open', cls: 'bg-blue' },
  stage_4: { label: 'Open', cls: 'bg-amber' },
  stage_5: { label: 'Open', cls: 'bg-amber' },
  converted: { label: 'Closed — Won', cls: 'bg-green' },
  stage_6_lost: { label: 'Closed — Lost', cls: 'bg-red' },
};

const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'stage_1', label: 'Stage 1' },
  { key: 'stage_2', label: 'Stage 2' },
  { key: 'stage_3', label: 'Stage 3' },
  { key: 'stage_4', label: 'Stage 4' },
  { key: 'stage_5', label: 'Stage 5' },
  { key: 'converted', label: 'Won' },
  { key: 'stage_6_lost', label: 'Lost' },
];

function leadTitle(l: Lead): string {
  if (l.title) return l.title;
  const name = [l.first_name, l.last_name].filter(Boolean).join(' ');
  return [name, l.project_address].filter(Boolean).join(' | ') || 'Untitled lead';
}

function tempColor(temp: string | null): string {
  if (temp === 'hot') return 'var(--red)';
  if (temp === 'warm') return 'var(--amber)';
  if (temp === 'cold') return 'var(--blue)';
  return 'var(--t3)';
}

const GROUP_COLOR: Record<string, string> = {
  'bg-gray': 'var(--t3)',
  'bg-blue': 'var(--blue)',
  'bg-amber': 'var(--amber)',
  'bg-green': 'var(--green)',
  'bg-red': 'var(--red)',
};

export default function Leads() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
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
    api.get<PersonTag[]>('/person-tags').then(setAllTags).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowNew(true);
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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
    if (!leads) return { open: 0, won: 0, lost: 0, total: 0, profit: 0 };
    const open = leads.filter((l) => !['converted', 'stage_6_lost'].includes(l.status));
    const won = leads.filter((l) => l.status === 'converted').length;
    const lost = leads.filter((l) => l.status === 'stage_6_lost').length;
    const profit = open.reduce((s, l) => s + (l.projected_profit || 0), 0);
    return { open: open.length, won, lost, total: leads.length, profit };
  }, [leads]);

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
          <table className="tbl tbl-zebra">
            <thead>
              <tr>
                <th className="sortable" onClick={() => toggleSort('title')}>
                  Lead
                </th>
                <th>Project scope</th>
                <th>Sales stage</th>
                <th>Lead temp</th>
                <th>Projected profit</th>
                <th>Client?</th>
                <th className="sortable" onClick={() => toggleSort('created_at')}>
                  Created
                </th>
                <th className="sortable" onClick={() => toggleSort('last_contacted_at')}>
                  Last Engaged
                </th>
                <th>Referred by</th>
                <th>Notes / Objections</th>
                <th>Tags</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => {
                const group = STATUS_GROUPS[l.status];
                const referredByName = l.referred_by
                  ? [l.referred_by.first_name, l.referred_by.last_name].filter(Boolean).join(' ')
                  : l.referral_name;
                const isConverted = !!l.converted_client_id;
                return (
                  <tr key={l.id} style={{ cursor: 'pointer' }} onClick={() => setEditingLead(l)}>
                    <td style={{ fontWeight: 500, color: 'var(--blue)' }}>{leadTitle(l)}</td>
                    <td
                      style={{
                        maxWidth: 220,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: 'var(--t2)',
                      }}
                    >
                      {l.project_scope || '—'}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {isConverted ? (
                        <span className="badge bg-green">Converted</span>
                      ) : (
                        <select
                          className="fi"
                          style={{ fontSize: 12, padding: '3px 6px', minWidth: 160, color: GROUP_COLOR[group.cls], fontWeight: 600 }}
                          value={l.status}
                          onChange={(e) => patchLead(l.id, { status: e.target.value })}
                        >
                          {STAGE_OPTIONS.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <select
                        className="fi"
                        style={{ fontSize: 12, padding: '3px 6px', color: tempColor(l.lead_temp), fontWeight: 600, textTransform: 'capitalize' }}
                        value={l.lead_temp || ''}
                        onChange={(e) => patchLead(l.id, { lead_temp: e.target.value || null })}
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
                        onCommit={(v) => patchLead(l.id, { projected_profit: v.trim() === '' ? null : Number(v) })}
                      />
                    </td>
                    <td>
                      <span className={`badge ${isConverted ? 'bg-green' : 'bg-gray'}`}>{isConverted ? 'Yes' : 'No'}</span>
                    </td>
                    <td>{fmtD(l.created_at)}</td>
                    <td>{fmtD(l.last_contacted_at)}</td>
                    <td>{referredByName || '—'}</td>
                    <td
                      style={{
                        maxWidth: 240,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: 'var(--t2)',
                        fontSize: 12,
                      }}
                      title={[l.notes, l.objections].filter(Boolean).join(' — ') || undefined}
                    >
                      {l.objections ? <span style={{ color: 'var(--red)' }}>⚑ </span> : null}
                      {[l.notes, l.objections].filter(Boolean).join(' — ') || '—'}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <EntityTagList entityType="lead" entityId={l.id} allTags={allTags} />
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {l.converted_project_id ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => navigate(`/projects/${l.converted_project_id}`)}
                        >
                          View project <IconArrowRight size={13} />
                        </button>
                      ) : (
                        <button type="button" className="btn btn-sm" onClick={() => setConvertingLead(l)}>
                          Convert
                        </button>
                      )}
                    </td>
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
    </>
  );
}
