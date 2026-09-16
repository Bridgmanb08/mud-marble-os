import { useState } from 'react';
import { IconTrash } from '@tabler/icons-react';
import { Modal } from '../ui/Modal';
import { api, ApiError } from '../../api/client';
import { useToast } from '../ui/Toast';
import type { NetworkPerson } from '../../types';

// Click any bubble on the web to get here -- notes + contact info, and the
// "connect to existing person" picker below is what covers cross-
// connections (the same person reachable through more than one
// introducer), since AddPersonModal alone can only ever create brand-new
// people, never link two nodes that already exist.
export function PersonDetailModal({
  person,
  otherPeople,
  onClose,
  onSaved,
  onDeleted,
  onConnectExisting,
}: {
  person: NetworkPerson;
  otherPeople: NetworkPerson[];
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  onConnectExisting: (toPersonId: string) => Promise<void>;
}) {
  const toast = useToast();
  const [name, setName] = useState(person.name);
  const [notes, setNotes] = useState(person.notes || '');
  const [phone, setPhone] = useState(person.phone || '');
  const [email, setEmail] = useState(person.email || '');
  const [company, setCompany] = useState(person.company || '');
  const [title, setTitle] = useState(person.title || '');
  const [linkTargetId, setLinkTargetId] = useState('');
  const [linking, setLinking] = useState(false);

  async function saveField(field: string, value: unknown) {
    try {
      await api.patch(`/network/people/${person.id}`, { [field]: value });
      onSaved();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to save', true);
    }
  }

  async function handleDelete() {
    if (!confirm(`Remove ${person.name} from the web? This also removes their connections.`)) return;
    try {
      await api.delete(`/network/people/${person.id}`);
      toast(`Removed ${person.name}`);
      onDeleted();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to remove', true);
    }
  }

  async function handleLink() {
    if (!linkTargetId) return;
    setLinking(true);
    try {
      await onConnectExisting(linkTargetId);
      setLinkTargetId('');
    } finally {
      setLinking(false);
    }
  }

  const linkOptions = otherPeople.filter((p) => p.id !== person.id);

  return (
    <Modal title={person.is_root ? 'Me' : person.name} onClose={onClose}>
      {!person.is_root && (
        <div className="fg">
          <label className="fl">Name</label>
          <input
            className="fi"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={(e) => e.target.value.trim() && saveField('name', e.target.value.trim())}
          />
        </div>
      )}
      <div className="fr">
        <div className="fg">
          <label className="fl">Company</label>
          <input
            className="fi"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            onBlur={(e) => saveField('company', e.target.value.trim() || null)}
          />
        </div>
        <div className="fg">
          <label className="fl">Title</label>
          <input
            className="fi"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={(e) => saveField('title', e.target.value.trim() || null)}
          />
        </div>
      </div>
      <div className="fr">
        <div className="fg">
          <label className="fl">Phone</label>
          <input
            className="fi"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={(e) => saveField('phone', e.target.value.trim() || null)}
          />
        </div>
        <div className="fg">
          <label className="fl">Email</label>
          <input
            className="fi"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={(e) => saveField('email', e.target.value.trim() || null)}
          />
        </div>
      </div>
      <div className="fg">
        <label className="fl">Notes</label>
        <textarea
          className="fi"
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={(e) => saveField('notes', e.target.value.trim() || null)}
          placeholder="How you know them, what they're into, anything worth remembering"
        />
      </div>

      {linkOptions.length > 0 && (
        <div className="fg">
          <label className="fl">Also connect to someone already in the web</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <select className="fi" value={linkTargetId} onChange={(e) => setLinkTargetId(e.target.value)}>
              <option value="">Select a person…</option>
              {linkOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button className="btn btn-sm" disabled={!linkTargetId || linking} onClick={handleLink}>
              Connect
            </button>
          </div>
          <div className="m-sub">
            {person.is_root ? 'Me' : person.name} connects Brent to that person too -- for when more than one person introduced the same connection.
          </div>
        </div>
      )}

      <div className="ma" style={{ justifyContent: person.is_root ? 'flex-end' : 'space-between' }}>
        {!person.is_root && (
          <button className="btn btn-sm" style={{ color: 'var(--rtx)' }} onClick={handleDelete}>
            <IconTrash size={14} /> Remove
          </button>
        )}
        <button className="btn btn-p btn-sm" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
