import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { IconArrowLeft, IconGift, IconUsers, IconX } from '@tabler/icons-react';
import { api, ApiError } from '../api/client';
import { useToast } from '../components/ui/Toast';
import { fmt } from '../lib/format';
import { ReferralPicker } from '../components/clients/ReferralPicker';
import type { Client } from '../types';

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [client, setClient] = useState<Client | null>(null);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [editingReferral, setEditingReferral] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [fundingType, setFundingType] = useState('');
  const [preferredContact, setPreferredContact] = useState('');
  const [spousePartner, setSpousePartner] = useState('');
  const [notes, setNotes] = useState('');
  const [giftDescription, setGiftDescription] = useState('');
  const [addReferredText, setAddReferredText] = useState('');

  async function load() {
    if (!id) return;
    try {
      const data = await api.get<Client>(`/clients/${id}`);
      setClient(data);
      setFirstName(data.first_name);
      setLastName(data.last_name || '');
      setPhone(data.phone || '');
      setEmail(data.email || '');
      setFundingType(data.funding_type || '');
      setPreferredContact(data.preferred_contact_method || '');
      setSpousePartner(data.spouse_partner_name || '');
      setNotes(data.notes || '');
      setGiftDescription(data.referral_gift_description || '');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load client', true);
    }
  }

  useEffect(() => {
    load();
    api.get<Client[]>('/clients').then(setAllClients).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function patch(fields: Record<string, unknown>) {
    if (!id) return;
    try {
      const updated = await api.patch<Client>(`/clients/${id}`, fields);
      setClient(updated);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to save', true);
    }
  }

  function saveField(field: string, value: string) {
    const trimmed = value.trim();
    if (client && (client[field as keyof Client] || '') === trimmed) return;
    patch({ [field]: trimmed || null });
  }

  async function addReferred(name: string) {
    if (!client) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const match = allClients.find(
      (c) => c.id !== client.id && `${c.first_name} ${c.last_name || ''}`.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (!match) {
      toast('No client found with that name -- pick one from the list', true);
      return;
    }
    try {
      await api.patch(`/clients/${match.id}`, { referred_by_client_id: client.id });
      setAddReferredText('');
      load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to link referral', true);
    }
  }

  async function removeReferred(referredId: string) {
    try {
      await api.patch(`/clients/${referredId}`, { referred_by_client_id: null });
      load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to remove link', true);
    }
  }

  if (!client) {
    return (
      <div className="empty">
        <div className="empty-t">Loading…</div>
      </div>
    );
  }

  const referredByLabel = client.referred_by
    ? `${client.referred_by.first_name} ${client.referred_by.last_name || ''}`.trim()
    : client.referral_name;

  return (
    <>
      <button className="btn btn-sm" style={{ marginBottom: 12 }} onClick={() => navigate(-1)}>
        <IconArrowLeft size={14} /> Back
      </button>

      <div className="ph">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="av" style={{ width: 46, height: 46, fontSize: 16 }}>
            {(client.first_name || '?')[0]}
            {(client.last_name || '')[0] || ''}
          </div>
          <div>
            <h1>
              {client.first_name} {client.last_name}
            </h1>
            <p>
              {client.email || ''}
              {client.email && client.phone ? ' · ' : ''}
              {client.phone || ''}
            </p>
          </div>
        </div>
        {client.lifetime_value ? (
          <div className="metric" style={{ padding: '10px 16px' }}>
            <div className="m-label">Lifetime value</div>
            <div className="m-val" style={{ fontSize: 18 }}>
              {fmt(client.lifetime_value)}
            </div>
          </div>
        ) : null}
      </div>

      <div className="fr" style={{ alignItems: 'start' }}>
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <div className="st" style={{ marginBottom: 14 }}>
            Contact info
          </div>
          <div className="fr">
            <div className="fg">
              <label className="fl">First name</label>
              <input className="fi" value={firstName} onChange={(e) => setFirstName(e.target.value)} onBlur={(e) => saveField('first_name', e.target.value)} />
            </div>
            <div className="fg">
              <label className="fl">Last name</label>
              <input className="fi" value={lastName} onChange={(e) => setLastName(e.target.value)} onBlur={(e) => saveField('last_name', e.target.value)} />
            </div>
          </div>
          <div className="fr">
            <div className="fg">
              <label className="fl">Phone</label>
              <input className="fi" value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={(e) => saveField('phone', e.target.value)} />
            </div>
            <div className="fg">
              <label className="fl">Email</label>
              <input className="fi" value={email} onChange={(e) => setEmail(e.target.value)} onBlur={(e) => saveField('email', e.target.value)} />
            </div>
          </div>
          <div className="fr">
            <div className="fg">
              <label className="fl">Funding type</label>
              <input className="fi" value={fundingType} onChange={(e) => setFundingType(e.target.value)} onBlur={(e) => saveField('funding_type', e.target.value)} />
            </div>
            <div className="fg">
              <label className="fl">Preferred contact method</label>
              <input
                className="fi"
                value={preferredContact}
                onChange={(e) => setPreferredContact(e.target.value)}
                onBlur={(e) => saveField('preferred_contact_method', e.target.value)}
              />
            </div>
          </div>
          <div className="fg">
            <label className="fl">Spouse / partner</label>
            <input className="fi" value={spousePartner} onChange={(e) => setSpousePartner(e.target.value)} onBlur={(e) => saveField('spouse_partner_name', e.target.value)} />
          </div>
          <div className="fg" style={{ marginBottom: 0 }}>
            <label className="fl">Notes</label>
            <textarea className="fi" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={(e) => saveField('notes', e.target.value)} />
          </div>
        </div>

        <div>
          <div className="card" style={{ padding: 20, marginBottom: 16 }}>
            <div className="st" style={{ marginBottom: 14 }}>
              Status
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', marginBottom: 10 }}>
              <input type="checkbox" checked={client.is_advocate} onChange={(e) => patch({ is_advocate: e.target.checked })} />
              Advocate
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={client.is_repeat_client} onChange={(e) => patch({ is_repeat_client: e.target.checked })} />
              Repeat client
            </label>
          </div>

          <div className="card" style={{ padding: 20, marginBottom: 16 }}>
            <div className="st" style={{ marginBottom: 14 }}>
              Referral
            </div>
            <div className="fg">
              <label className="fl">Referred by</label>
              {editingReferral ? (
                <ReferralPicker
                  clients={allClients}
                  referredByClientId={client.referred_by_client_id}
                  referralName={client.referral_name}
                  excludeId={client.id}
                  listId="client-detail-referral-options"
                  onChange={(next) => {
                    patch({ referred_by_client_id: next.referredByClientId, referral_name: next.referralName });
                    setEditingReferral(false);
                  }}
                />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  {client.referred_by ? (
                    <Link to={`/clients/${client.referred_by.id}`} style={{ color: 'var(--btx)' }}>
                      {referredByLabel}
                    </Link>
                  ) : (
                    <span style={{ color: referredByLabel ? undefined : 'var(--t3)' }}>{referredByLabel || 'No one on file'}</span>
                  )}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditingReferral(true)}>
                    Edit
                  </button>
                </div>
              )}
            </div>
            {referredByLabel && (
              <>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', marginBottom: 10 }}>
                  <input type="checkbox" checked={client.referral_gift_sent} onChange={(e) => patch({ referral_gift_sent: e.target.checked })} />
                  <IconGift size={13} /> Referral gift sent
                </label>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label className="fl">Gift description</label>
                  <input
                    className="fi"
                    placeholder="e.g. Bottle of wine + card"
                    value={giftDescription}
                    onChange={(e) => setGiftDescription(e.target.value)}
                    onBlur={(e) => saveField('referral_gift_description', e.target.value)}
                  />
                </div>
              </>
            )}
          </div>

          <div className="card" style={{ padding: 20 }}>
            <div className="st" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
              <IconUsers size={14} /> Clients they referred {client.referred.length > 0 ? `(${client.referred.length})` : ''}
            </div>
            {client.referred.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 10 }}>Hasn't referred anyone yet.</div>
            ) : (
              client.referred.map((r) => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <Link to={`/clients/${r.id}`} style={{ flex: 1, fontSize: 13, color: 'inherit', textDecoration: 'none' }}>
                    {r.first_name} {r.last_name || ''}
                  </Link>
                  <button
                    type="button"
                    className="btn-reset"
                    onClick={() => removeReferred(r.id)}
                    title={`Remove ${r.first_name} from this list`}
                    style={{ display: 'flex', color: 'var(--t3)', cursor: 'pointer' }}
                  >
                    <IconX size={13} />
                  </button>
                </div>
              ))
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <input
                className="fi"
                list="client-detail-add-referred-options"
                placeholder="Search existing clients to add…"
                value={addReferredText}
                onChange={(e) => setAddReferredText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addReferred(addReferredText);
                  }
                }}
              />
              <datalist id="client-detail-add-referred-options">
                {allClients
                  .filter((c) => c.id !== client.id && !client.referred.some((r) => r.id === c.id))
                  .map((c) => (
                    <option key={c.id} value={`${c.first_name} ${c.last_name || ''}`.trim()} />
                  ))}
              </datalist>
              <button type="button" className="btn btn-sm" onClick={() => addReferred(addReferredText)}>
                Add
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
