import { useEffect, useMemo, useState } from 'react';
import { IconPlus, IconTools, IconAlertTriangle } from '@tabler/icons-react';
import { api } from '../api/client';
import { useToast } from '../components/ui/Toast';
import { fmtD } from '../lib/format';
import type { Subcontractor } from '../types';
import { NewSubcontractorModal } from '../components/subcontractors/NewSubcontractorModal';

const THIRTY_DAYS_MS = 30 * 86400000;

export default function Subcontractors() {
  const [subs, setSubs] = useState<Subcontractor[] | null>(null);
  const [filter, setFilter] = useState<'all' | 'preferred' | 'w9'>('all');
  const [showNew, setShowNew] = useState(false);
  const [editingSub, setEditingSub] = useState<Subcontractor | undefined>(undefined);
  const toast = useToast();

  async function load() {
    try {
      setSubs(await api.get<Subcontractor[]>('/subcontractors'));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load subcontractors', true);
      setSubs([]);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const preferred = useMemo(() => subs?.filter((s) => s.preferred) ?? [], [subs]);
  const w9Missing = useMemo(() => subs?.filter((s) => !s.w9_on_file) ?? [], [subs]);
  const insuranceExpiring = useMemo(
    () => subs?.filter((s) => s.insurance_expiry && new Date(s.insurance_expiry).getTime() < Date.now() + THIRTY_DAYS_MS) ?? [],
    [subs]
  );

  const filtered = useMemo(() => {
    if (!subs) return [];
    if (filter === 'preferred') return preferred;
    if (filter === 'w9') return w9Missing;
    return subs;
  }, [subs, filter, preferred, w9Missing]);

  return (
    <>
      <div className="ph">
        <div>
          <h1>Subcontractors</h1>
          <p>Your trade partners and vendor roster</p>
        </div>
        <button className="btn btn-p btn-sm" onClick={() => setShowNew(true)}>
          <IconPlus size={14} /> Add sub
        </button>
      </div>

      <div className="metrics">
        <div className="metric">
          <div className="m-label">Total subs</div>
          <div className="m-val">{subs?.length ?? 0}</div>
        </div>
        <div className="metric">
          <div className="m-label">Preferred</div>
          <div className="m-val">{preferred.length}</div>
        </div>
        <div className="metric">
          <div className="m-label">Insurance expiring</div>
          <div className="m-val" style={{ color: insuranceExpiring.length ? 'var(--atx)' : undefined }}>
            {insuranceExpiring.length}
          </div>
          <div className="m-sub">within 30 days</div>
        </div>
        <div className="metric">
          <div className="m-label">W9 missing</div>
          <div className="m-val" style={{ color: w9Missing.length ? 'var(--atx)' : undefined }}>
            {w9Missing.length}
          </div>
        </div>
      </div>

      {insuranceExpiring.length > 0 && (
        <div className="alert alert-a">
          <IconAlertTriangle size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
          <strong>Insurance expiring soon:</strong> {insuranceExpiring.map((s) => s.company_name).join(', ')}
        </div>
      )}

      <div className="sh">
        <div className="st">{filtered.length} subs</div>
        <div className="filters">
          <button className={`fb${filter === 'all' ? ' on' : ''}`} onClick={() => setFilter('all')}>
            All
          </button>
          <button className={`fb${filter === 'preferred' ? ' on' : ''}`} onClick={() => setFilter('preferred')}>
            Preferred
          </button>
          <button className={`fb${filter === 'w9' ? ' on' : ''}`} onClick={() => setFilter('w9')}>
            W9 missing
          </button>
        </div>
      </div>

      {subs === null ? (
        <div className="empty">
          <div className="empty-t">Loading…</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <IconTools size={32} color="var(--t3)" style={{ display: 'block', margin: '0 auto 12px' }} />
          <div className="empty-t">No subs yet</div>
          <div className="empty-s">Add your trade partners to build the roster.</div>
        </div>
      ) : (
        filtered.map((s) => {
          const expired = s.insurance_expiry && new Date(s.insurance_expiry).getTime() < Date.now();
          const expiring = s.insurance_expiry && new Date(s.insurance_expiry).getTime() < Date.now() + THIRTY_DAYS_MS;
          return (
            <button key={s.id} type="button" className="cc btn-reset" style={{ width: '100%', cursor: 'pointer' }} onClick={() => setEditingSub(s)}>
              <div className="av">{(s.company_name || '?')[0]}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {s.company_name}
                  {s.preferred && <span className="badge bg-green">Preferred</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 2 }}>
                  {s.trade || ''}
                  {s.trade && s.contact_name ? ' · ' : ''}
                  {s.contact_name || ''}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                {s.phone && <span style={{ fontSize: 12, color: 'var(--t2)' }}>{s.phone}</span>}
                {s.w9_on_file ? <span className="badge bg-green">W9 ✓</span> : <span className="badge bg-amber">W9 needed</span>}
                {s.insurance_expiry && (
                  <span style={{ fontSize: 11, color: expired ? 'var(--red)' : expiring ? 'var(--atx)' : 'var(--t3)' }}>
                    Ins: {fmtD(s.insurance_expiry)}
                  </span>
                )}
              </div>
            </button>
          );
        })
      )}

      {showNew && (
        <NewSubcontractorModal
          onClose={() => setShowNew(false)}
          onSaved={() => {
            setShowNew(false);
            toast('Sub added');
            load();
          }}
        />
      )}

      {editingSub && (
        <NewSubcontractorModal
          sub={editingSub}
          onClose={() => setEditingSub(undefined)}
          onSaved={() => {
            setEditingSub(undefined);
            toast('Sub updated');
            load();
          }}
        />
      )}
    </>
  );
}
