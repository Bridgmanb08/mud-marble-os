import { useEffect, useMemo, useState } from 'react';
import { IconPlus, IconUsers, IconGift } from '@tabler/icons-react';
import { api } from '../api/client';
import { useToast } from '../components/ui/Toast';
import { fmt } from '../lib/format';
import type { Client } from '../types';
import { NewClientModal } from '../components/clients/NewClientModal';

export default function Clients() {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [filter, setFilter] = useState<'all' | 'advocate' | 'repeat' | 'gift'>('all');
  const [showNew, setShowNew] = useState(false);
  const toast = useToast();

  async function load() {
    try {
      const data = await api.get<Client[]>('/clients');
      setClients(data);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load clients', true);
      setClients([]);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const advocates = useMemo(() => clients?.filter((c) => c.is_advocate) ?? [], [clients]);
  const repeat = useMemo(() => clients?.filter((c) => c.is_repeat_client) ?? [], [clients]);
  const giftPending = useMemo(() => clients?.filter((c) => !c.referral_gift_sent && c.referral_name) ?? [], [clients]);

  const filtered = useMemo(() => {
    if (!clients) return [];
    if (filter === 'advocate') return advocates;
    if (filter === 'repeat') return repeat;
    if (filter === 'gift') return giftPending;
    return clients;
  }, [clients, filter, advocates, repeat, giftPending]);

  return (
    <>
      <div className="ph">
        <div>
          <h1>Client Directory</h1>
          <p>Your client roster and referral network</p>
        </div>
        <button className="btn btn-p btn-sm" onClick={() => setShowNew(true)}>
          <IconPlus size={14} /> New client
        </button>
      </div>

      <div className="metrics">
        <div className="metric">
          <div className="m-label">Total clients</div>
          <div className="m-val">{clients?.length ?? 0}</div>
        </div>
        <div className="metric">
          <div className="m-label">Repeat</div>
          <div className="m-val">{repeat.length}</div>
        </div>
        <div className="metric">
          <div className="m-label">Advocates</div>
          <div className="m-val">{advocates.length}</div>
        </div>
        <div className="metric">
          <div className="m-label">Gifts pending</div>
          <div className="m-val" style={{ color: giftPending.length ? 'var(--atx)' : undefined }}>
            {giftPending.length}
          </div>
        </div>
      </div>

      {giftPending.length > 0 && (
        <div className="alert alert-a">
          <IconGift size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
          <strong>{giftPending.length} referral gift{giftPending.length > 1 ? 's' : ''} to send:</strong>{' '}
          {giftPending
            .slice(0, 3)
            .map((c) => `${c.first_name} ${c.last_name || ''}`.trim())
            .join(', ')}
          {giftPending.length > 3 ? ` +${giftPending.length - 3} more` : ''}
        </div>
      )}

      <div className="sh">
        <div className="st">{clients?.length ?? 0} clients</div>
        <div className="filters">
          <button className={`fb${filter === 'all' ? ' on' : ''}`} onClick={() => setFilter('all')}>
            All
          </button>
          <button className={`fb${filter === 'advocate' ? ' on' : ''}`} onClick={() => setFilter('advocate')}>
            Advocates
          </button>
          <button className={`fb${filter === 'repeat' ? ' on' : ''}`} onClick={() => setFilter('repeat')}>
            Repeat
          </button>
          <button className={`fb${filter === 'gift' ? ' on' : ''}`} onClick={() => setFilter('gift')}>
            Gift pending
          </button>
        </div>
      </div>

      {clients === null ? (
        <div className="empty">
          <div className="empty-t">Loading…</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <IconUsers size={32} color="var(--t3)" style={{ display: 'block', margin: '0 auto 12px' }} />
          <div className="empty-t">No clients</div>
        </div>
      ) : (
        filtered.map((c) => (
          <div key={c.id} className="cc">
            <div className="av">
              {(c.first_name || '?')[0]}
              {(c.last_name || '')[0] || ''}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>
                {c.first_name} {c.last_name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 2 }}>
                {c.email || ''}
                {c.email && c.phone ? ' · ' : ''}
                {c.phone || ''}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              {c.referral_name && <span style={{ fontSize: 11, color: 'var(--t3)' }}>Ref: {c.referral_name}</span>}
              {c.is_advocate && <span className="badge bg-green">Advocate</span>}
              {c.is_repeat_client && <span className="badge bg-blue">Repeat</span>}
              {!c.referral_gift_sent && c.referral_name && (
                <span className="badge bg-amber">
                  <IconGift size={11} style={{ marginRight: 3 }} /> Gift
                </span>
              )}
              {c.lifetime_value ? <span style={{ fontSize: 12, fontWeight: 500 }}>{fmt(c.lifetime_value)}</span> : null}
            </div>
          </div>
        ))
      )}

      {showNew && (
        <NewClientModal
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            toast('Client added');
            load();
          }}
        />
      )}
    </>
  );
}
