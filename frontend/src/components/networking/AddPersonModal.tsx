import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { api, ApiError } from '../../api/client';
import { useToast } from '../ui/Toast';
import type { NetworkNodeType, NetworkPerson } from '../../types';

const NODE_TYPE_OPTIONS: { value: NetworkNodeType; label: string }[] = [
  { value: 'person', label: 'Person' },
  { value: 'organization', label: 'Organization' },
  { value: 'title', label: 'Title / role' },
];

// Behind every "+" on the graph (fromPerson set) -- creates a new node AND
// the edge from the bubble that was clicked, in one step, which is what
// actually grows the web outward. Also reused for the page's own "New node"
// button (fromPerson omitted) to place a node with no connection at all --
// an organization or a title/role you want on the map without it having to
// be introduced through someone first.
export function AddPersonModal({
  fromPerson,
  onClose,
  onCreated,
}: {
  fromPerson?: NetworkPerson | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [nodeType, setNodeType] = useState<NetworkNodeType>('person');
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);

  // Contact-style fields only mean something for an actual person -- an
  // organization or a bare title/role node has no phone number or job
  // title of its own.
  const isPerson = nodeType === 'person';

  async function handleSubmit() {
    const trimmedName = name.trim();
    // Also guards against a double-submit from mashing Enter -- the submit
    // button already disables on `saving`, but the Enter-key path below
    // bypasses that.
    if (!trimmedName || saving) return;
    setSaving(true);
    try {
      const person = await api.post<NetworkPerson>('/network/people', {
        name: trimmedName,
        node_type: nodeType,
        notes: notes.trim() || null,
        phone: isPerson ? phone.trim() || null : null,
        email: isPerson ? email.trim() || null : null,
        company: isPerson ? company.trim() || null : null,
        title: isPerson ? title.trim() || null : null,
      });
      if (fromPerson) {
        await api.post('/network/connections', { from_person_id: fromPerson.id, to_person_id: person.id });
        toast(`Added ${trimmedName}, connected through ${fromPerson.name}`);
      } else {
        toast(`Added ${trimmedName}`);
      }
      onCreated();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to add', true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={
        fromPerson
          ? fromPerson.is_root
            ? 'Add someone you know'
            : `Add someone ${fromPerson.name} connects Brent to`
          : 'New node'
      }
      onClose={onClose}
    >
      <div className="fg">
        <label className="fl">Type</label>
        <select className="fi" value={nodeType} onChange={(e) => setNodeType(e.target.value as NetworkNodeType)}>
          {NODE_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="fg">
        <label className="fl">{nodeType === 'organization' ? 'Organization name' : nodeType === 'title' ? 'Title / role' : 'Name'}</label>
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
          placeholder={nodeType === 'organization' ? 'ABC Construction' : nodeType === 'title' ? 'General Contractor' : 'Full name'}
        />
      </div>
      {isPerson && (
        <>
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
        </>
      )}
      <div className="fg">
        <label className="fl">Notes</label>
        <textarea className="fi" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="How you know them, what they're into, anything worth remembering" />
      </div>
      <div className="ma">
        <button className="btn btn-sm" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-p btn-sm" disabled={saving || !name.trim()} onClick={handleSubmit}>
          {fromPerson ? 'Add to web' : 'Add node'}
        </button>
      </div>
    </Modal>
  );
}
