import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import { ReferralPicker } from '../clients/ReferralPicker';
import type { Client, Lead, LeadConvertResponse } from '../../types';

interface ConvertLeadModalProps {
  lead: Lead;
  onClose: () => void;
  onConverted: (res: LeadConvertResponse) => void;
}

export function ConvertLeadModal({ lead, onClose, onConverted }: ConvertLeadModalProps) {
  const [firstName, setFirstName] = useState(lead.first_name || '');
  const [lastName, setLastName] = useState(lead.last_name || '');
  const [phone, setPhone] = useState(lead.phone || '');
  const [email, setEmail] = useState(lead.email || '');
  const [address, setAddress] = useState(lead.project_address || '');
  const [projectName, setProjectName] = useState(
    lead.title || [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.project_address || ''
  );
  const [projectType, setProjectType] = useState(lead.project_type || '');
  const [wasReferred, setWasReferred] = useState(!!(lead.referred_by_client_id || lead.referral_name));
  const [referredByClientId, setReferredByClientId] = useState<string | null>(lead.referred_by_client_id);
  const [referralName, setReferralName] = useState<string | null>(lead.referral_name);
  const [clients, setClients] = useState<Client[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<Client[]>('/clients').then(setClients).catch(() => {});
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!firstName.trim() && !lastName.trim()) {
      setError('A first or last name is required to convert this lead.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await api.post<LeadConvertResponse>(`/leads/${lead.id}/convert`, {
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        referred_by_client_id: wasReferred ? referredByClientId : null,
        referral_name: wasReferred ? referralName : null,
        project_name: projectName.trim() || null,
        project_type: projectType.trim() || null,
      });
      onConverted(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to convert lead');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Convert lead to client + project" onClose={onClose} wide>
      <form onSubmit={handleSubmit}>
        {error && <div className="merr">{error}</div>}
        <div className="sh" style={{ marginTop: 0 }}>
          <div className="st">New client</div>
        </div>
        <div className="fr">
          <div className="fg">
            <label className="fl">First name</label>
            <input className="fi" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div className="fg">
            <label className="fl">Last name</label>
            <input className="fi" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        </div>
        <div className="fr">
          <div className="fg">
            <label className="fl">Phone</label>
            <input className="fi" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="fg">
            <label className="fl">Email</label>
            <input className="fi" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <div className="fg">
          <label className="fl" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={wasReferred} onChange={(e) => setWasReferred(e.target.checked)} />
            This client was referred by someone
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
              listId="convert-lead-referral-options"
            />
          </div>
        )}

        <div className="sh">
          <div className="st">New project</div>
        </div>
        <div className="fg">
          <label className="fl">Project name</label>
          <input className="fi" value={projectName} onChange={(e) => setProjectName(e.target.value)} />
        </div>
        <div className="fr">
          <div className="fg">
            <label className="fl">Address</label>
            <input className="fi" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="fg">
            <label className="fl">Project type</label>
            <input className="fi" value={projectType} onChange={(e) => setProjectType(e.target.value)} placeholder="kitchen, addition…" />
          </div>
        </div>

        <div className="ma">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-p" disabled={saving}>
            {saving ? 'Converting…' : 'Convert'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
