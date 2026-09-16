import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { api, ApiError } from '../../api/client';
import { useToast } from '../ui/Toast';
import type { NetworkPerson } from '../../types';

// Behind every "+" on the graph -- creates a new person AND the edge from
// the bubble that was clicked, in one step, which is what actually grows
// the web outward (person A introduces C, C introduces D/G/H, ...).
export function AddPersonModal({
  fromPerson,
  onClose,
  onCreated,
}: {
  fromPerson: NetworkPerson;
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    const trimmedName = name.trim();
    // Also guards against a double-submit from mashing Enter -- the "Add to
    // web" button already disables on `saving`, but the Enter-key path
    // below bypasses that.
    if (!trimmedName || saving) return;
    setSaving(true);
    try {
      const person = await api.post<NetworkPerson>('/network/people', {
        name: trimmedName,
        notes: notes.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        company: company.trim() || null,
        title: title.trim() || null,
      });
      await api.post('/network/connections', { from_person_id: fromPerson.id, to_person_id: person.id });
      toast(`Added ${trimmedName}, connected through ${fromPerson.name}`);
      onCreated();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to add person', true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={fromPerson.is_root ? 'Add someone you know' : `Add someone ${fromPerson.name} connects Brent to`}
      onClose={onClose}
    >
      <div className="fg">
        <label className="fl">Name</label>
        <input
          className="fi"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            // Enter submits right from the name field -- the other fields
            // are optional extras, so typing just a name and hitting Enter
            // is the fast path this is for. Shift+Enter is left alone in
            // case a name ever needs a literal newline (it won't, but this
            // costs nothing and matches how Enter is handled elsewhere).
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Full name"
        />
      </div>
      <div className="fr">
        <div className="fg">
          <label className="fl">Company</label>
          <input className="fi" value={company} onChange={(e) => setCompany(e.target.value)} />
        </div>
        <div className="fg">
          <label className="fl">Title</label>
          <input className="fi" value={title} onChange={(e) => setTitle(e.target.value)} />
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
        <label className="fl">Notes</label>
        <textarea className="fi" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="How you know them, what they're into, anything worth remembering" />
      </div>
      <div className="ma">
        <button className="btn btn-sm" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-p btn-sm" disabled={saving || !name.trim()} onClick={handleSubmit}>
          Add to web
        </button>
      </div>
    </Modal>
  );
}
