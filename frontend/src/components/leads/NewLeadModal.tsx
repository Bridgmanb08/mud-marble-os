import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import { ReferralPicker } from '../clients/ReferralPicker';
import { openDatePicker } from '../../lib/datePicker';
import type { Client, Lead } from '../../types';

interface NewLeadModalProps {
  lead?: Lead;
  onClose: () => void;
  onCreated: () => void;
}

// Doubles as the edit modal (pass `lead`) -- same PATCH-vs-POST-by-optional-
// prop pattern already used for InvoiceLineItemModal/AddEstimateLineItemsModal
// elsewhere in this app. The dense grid on Leads.tsx handles Sales Stage,
// Lead Temp, and Projected Profit inline; everything else (name, contact
// info, scope, notes, objections) lives here since it's too much to cram
// into table cells.
export function NewLeadModal({ lead, onClose, onCreated }: NewLeadModalProps) {
  const [firstName, setFirstName] = useState(lead?.first_name || '');
  const [lastName, setLastName] = useState(lead?.last_name || '');
  const [phone, setPhone] = useState(lead?.phone || '');
  const [email, setEmail] = useState(lead?.email || '');
  const [address, setAddress] = useState(lead?.project_address || '');
  const [projectType, setProjectType] = useState(lead?.project_type || '');
  const [projectScope, setProjectScope] = useState(lead?.project_scope || '');
  const [revenueMin, setRevenueMin] = useState(lead?.estimated_revenue_min != null ? String(lead.estimated_revenue_min) : '');
  const [revenueMax, setRevenueMax] = useState(lead?.estimated_revenue_max != null ? String(lead.estimated_revenue_max) : '');
  const [projectedProfit, setProjectedProfit] = useState(lead?.projected_profit != null ? String(lead.projected_profit) : '');
  const [vettingScore, setVettingScore] = useState(lead?.vetting_score != null ? String(lead.vetting_score) : '');
  const [lastContactedAt, setLastContactedAt] = useState(lead?.last_contacted_at?.slice(0, 10) || '');
  const [notes, setNotes] = useState(lead?.notes || '');
  const [objections, setObjections] = useState(lead?.objections || '');
  const [wasReferred, setWasReferred] = useState(!!(lead?.referred_by_client_id || lead?.referral_name));
  const [referredByClientId, setReferredByClientId] = useState<string | null>(lead?.referred_by_client_id || null);
  const [referralName, setReferralName] = useState<string | null>(lead?.referral_name || null);
  const [clients, setClients] = useState<Client[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<Client[]>('/clients').then(setClients).catch(() => {});
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!firstName.trim() && !lastName.trim()) {
      setError('First or last name is required.');
      return;
    }
    setSaving(true);
    setError('');
    const payload = {
      first_name: firstName.trim() || null,
      last_name: lastName.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      project_address: address.trim() || null,
      project_type: projectType.trim() || null,
      project_scope: projectScope.trim() || null,
      estimated_revenue_min: revenueMin ? Number(revenueMin) : null,
      estimated_revenue_max: revenueMax ? Number(revenueMax) : null,
      projected_profit: projectedProfit ? Number(projectedProfit) : null,
      vetting_score: vettingScore ? Number(vettingScore) : null,
      last_contacted_at: lastContactedAt || null,
      notes: notes.trim() || null,
      objections: objections.trim() || null,
      referred_by_client_id: wasReferred ? referredByClientId : null,
      referral_name: wasReferred ? referralName : null,
    };
    try {
      if (lead) {
        await api.patch(`/leads/${lead.id}`, payload);
      } else {
        await api.post('/leads', { ...payload, status: 'new' });
      }
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to ${lead ? 'update' : 'create'} lead`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={lead ? 'Edit lead' : 'New lead opportunity'} onClose={onClose} wide>
      <form onSubmit={handleSubmit}>
        {error && <div className="merr">{error}</div>}

        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div className="card-section-header">Contact & lead info</div>
          <div className="fr">
            <div className="fg">
              <label className="fl">First name</label>
              <input className="fi" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" />
            </div>
            <div className="fg">
              <label className="fl">Last name</label>
              <input className="fi" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Smith" />
            </div>
          </div>
          <div className="fr">
            <div className="fg">
              <label className="fl">Phone</label>
              <input className="fi" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(317) 555-0100" />
            </div>
            <div className="fg">
              <label className="fl">Email</label>
              <input className="fi" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@email.com" />
            </div>
          </div>
          <div className="fg">
            <label className="fl">Project address</label>
            <input className="fi" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St, Indianapolis IN" />
          </div>
          <div className="fr">
            <div className="fg">
              <label className="fl">Project type</label>
              <input className="fi" value={projectType} onChange={(e) => setProjectType(e.target.value)} placeholder="kitchen, addition…" />
            </div>
            <div className="fg">
              <label className="fl">Last contacted</label>
              <input className="fi" type="date" value={lastContactedAt} onClick={openDatePicker} onChange={(e) => setLastContactedAt(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div className="card-section-header">Deal details</div>
          <div className="fg">
            <label className="fl">Project scope</label>
            <textarea
              className="fi"
              style={{ minHeight: 60 }}
              value={projectScope}
              onChange={(e) => setProjectScope(e.target.value)}
              placeholder="What are they looking to do?"
            />
          </div>
          <div className="fr">
            <div className="fg">
              <label className="fl">Estimated revenue min ($)</label>
              <input className="fi" type="number" value={revenueMin} onChange={(e) => setRevenueMin(e.target.value)} placeholder="50000" />
            </div>
            <div className="fg">
              <label className="fl">Estimated revenue max ($)</label>
              <input className="fi" type="number" value={revenueMax} onChange={(e) => setRevenueMax(e.target.value)} placeholder="100000" />
            </div>
            <div className="fg">
              <label className="fl">Projected profit ($)</label>
              <input className="fi" type="number" value={projectedProfit} onChange={(e) => setProjectedProfit(e.target.value)} placeholder="30000" />
            </div>
          </div>
          <div className="fg">
            <label className="fl">Vetting score (0-100)</label>
            <input
              className="fi"
              type="number"
              min={0}
              max={100}
              value={vettingScore}
              onChange={(e) => setVettingScore(e.target.value)}
              placeholder="How well-qualified is this lead?"
            />
          </div>
          <div className="fg">
            <label className="fl">Notes</label>
            <textarea className="fi" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="General notes…" />
          </div>
          <div className="fg">
            <label className="fl">Objections</label>
            <textarea
              className="fi"
              value={objections}
              onChange={(e) => setObjections(e.target.value)}
              placeholder="What's holding them back?"
            />
          </div>
          <div className="fg">
            <label className="fl" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={wasReferred} onChange={(e) => setWasReferred(e.target.checked)} />
              This lead was referred by someone
            </label>
          </div>
          {wasReferred && (
            <div className="fg">
              <label className="fl">Referred by</label>
              <ReferralPicker
                clients={clients}
                referredByClientId={referredByClientId}
                referralName={referralName}
                onChange={(next) => {
                  setReferredByClientId(next.referredByClientId);
                  setReferralName(next.referralName);
                }}
                listId="new-lead-referral-options"
              />
            </div>
          )}
        </div>

        <div className="ma">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-p" disabled={saving}>
            {saving ? 'Saving…' : lead ? 'Save changes' : 'Add lead'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
