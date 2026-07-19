import { useEffect, useMemo, useState } from 'react';
import { IconPlus, IconGitBranch, IconAlertTriangle } from '@tabler/icons-react';
import { api } from '../api/client';
import { useToast } from '../components/ui/Toast';
import { fmt } from '../lib/format';
import type { ChangeOrder } from '../types';
import { NewChangeOrderModal } from '../components/change-orders/NewChangeOrderModal';

const TYPE_BADGE: Record<string, string> = { oversight: 'bg-amber', client_addition: 'bg-blue', unforeseen: 'bg-red' };
const STATUS_BADGE: Record<string, string> = { pending: 'bg-gray', sent: 'bg-amber', approved: 'bg-green', rejected: 'bg-red' };

const FILTERS = ['all', 'pending', 'sent', 'approved', 'oversight', 'client_addition', 'unforeseen'];

export default function ChangeOrders() {
  const [cos, setCos] = useState<ChangeOrder[] | null>(null);
  const [filter, setFilter] = useState('all');
  const [showNew, setShowNew] = useState(false);
  const toast = useToast();

  async function load() {
    try {
      const data = await api.get<ChangeOrder[]>('/change-orders');
      setCos(data);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load change orders', true);
      setCos([]);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!cos) return [];
    if (filter === 'all') return cos;
    if (['pending', 'sent', 'approved'].includes(filter)) return cos.filter((c) => c.status === filter);
    return cos.filter((c) => c.co_type === filter);
  }, [cos, filter]);

  const breaches = cos?.filter((c) => c.sop_breach).length ?? 0;
  const pending = cos?.filter((c) => c.status === 'pending').length ?? 0;
  const sent = cos?.filter((c) => c.status === 'sent').length ?? 0;
  const approvedValue = cos?.filter((c) => c.status === 'approved').reduce((s, c) => s + (c.owner_price || 0), 0) ?? 0;

  return (
    <>
      <div className="ph">
        <div>
          <h1>Change Orders</h1>
          <p>All COs across active projects</p>
        </div>
        <button className="btn btn-p btn-sm" onClick={() => setShowNew(true)}>
          <IconPlus size={14} /> New CO
        </button>
      </div>

      <div className="metrics">
        <div className="metric">
          <div className="m-label">SOP breaches</div>
          <div className="m-val" style={{ color: breaches ? 'var(--red)' : undefined }}>
            {breaches}
          </div>
          <div className="m-sub">&gt;24hr unresponded</div>
        </div>
        <div className="metric">
          <div className="m-label">Pending</div>
          <div className="m-val">{pending}</div>
        </div>
        <div className="metric">
          <div className="m-label">Awaiting approval</div>
          <div className="m-val">{sent}</div>
        </div>
        <div className="metric">
          <div className="m-label">Approved value</div>
          <div className="m-val" style={{ fontSize: 17 }}>
            {fmt(approvedValue)}
          </div>
        </div>
      </div>

      {breaches > 0 && (
        <div className="alert alert-r">
          <IconAlertTriangle size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
          <strong>{breaches} SOP breach{breaches > 1 ? 'es' : ''}</strong> — sent but not approved within 24 hours
        </div>
      )}

      <div className="sh">
        <div className="st">All change orders</div>
        <div className="filters">
          {FILTERS.map((f) => (
            <button key={f} className={`fb${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>
              {f === 'all' ? `All (${cos?.length ?? 0})` : f.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {cos === null ? (
        <div className="empty">
          <div className="empty-t">Loading…</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <IconGitBranch size={32} color="var(--t3)" style={{ display: 'block', margin: '0 auto 12px' }} />
          <div className="empty-t">No change orders</div>
        </div>
      ) : (
        filtered.map((co) => (
          <div key={co.id} className="coc">
            <div className="coh">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600 }}>CO-{String(co.co_number ?? '?').padStart(3, '0')}</span>
                <span>{co.title}</span>
                <span style={{ fontSize: 11, color: 'var(--t3)' }}>{co.projects?.name || ''}</span>
                <span className={`badge ${TYPE_BADGE[co.co_type] || 'bg-gray'}`}>{co.co_type.replace('_', ' ')}</span>
                <span className={`badge ${STATUS_BADGE[co.status] || 'bg-gray'}`}>{co.status}</span>
                {co.sop_breach && (
                  <span className="badge bg-red">
                    <IconAlertTriangle size={11} style={{ marginRight: 3 }} /> SOP
                  </span>
                )}
              </div>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{fmt(co.owner_price)}</span>
            </div>
            {co.description && <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 6 }}>{co.description}</div>}
          </div>
        ))
      )}

      {showNew && (
        <NewChangeOrderModal
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            toast('Change order created');
            load();
          }}
        />
      )}
    </>
  );
}
