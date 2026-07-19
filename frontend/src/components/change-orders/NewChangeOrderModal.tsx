import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import type { Project } from '../../types';

interface NewChangeOrderModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export function NewChangeOrderModal({ onClose, onCreated }: NewChangeOrderModalProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [coType, setCoType] = useState('client_addition');
  const [ownerPrice, setOwnerPrice] = useState('');
  const [builderCost, setBuilderCost] = useState('');
  const [description, setDescription] = useState('');
  const [discoveredBy, setDiscoveredBy] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<Project[]>('/projects').then(setProjects).catch(() => {});
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!projectId || !title.trim()) {
      setError('Project and title are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post('/change-orders', {
        project_id: projectId,
        title: title.trim(),
        co_type: coType,
        owner_price: parseFloat(ownerPrice) || 0,
        builder_cost: parseFloat(builderCost) || 0,
        description: description.trim() || null,
        discovered_by: discoveredBy || null,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create change order');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New change order" onClose={onClose} wide>
      <form onSubmit={handleSubmit}>
        {error && <div className="merr">{error}</div>}
        <div className="fr">
          <div className="fg">
            <label className="fl">Project</label>
            <select className="fi" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">— Select project —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name.replace(/\|.*/, '').trim()}
                </option>
              ))}
            </select>
          </div>
          <div className="fg">
            <label className="fl">Type</label>
            <select className="fi" value={coType} onChange={(e) => setCoType(e.target.value)}>
              <option value="client_addition">Client addition</option>
              <option value="oversight">Oversight</option>
              <option value="unforeseen">Unforeseen</option>
            </select>
          </div>
        </div>
        <div className="fg">
          <label className="fl">Title</label>
          <input className="fi" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add deck railing" />
        </div>
        <div className="fr">
          <div className="fg">
            <label className="fl">Owner price ($)</label>
            <input className="fi" type="number" value={ownerPrice} onChange={(e) => setOwnerPrice(e.target.value)} />
          </div>
          <div className="fg">
            <label className="fl">Builder cost ($)</label>
            <input className="fi" type="number" value={builderCost} onChange={(e) => setBuilderCost(e.target.value)} />
          </div>
        </div>
        <div className="fg">
          <label className="fl">Discovered by</label>
          <select className="fi" value={discoveredBy} onChange={(e) => setDiscoveredBy(e.target.value)}>
            <option value="">—</option>
            <option value="brent">Brent</option>
            <option value="shannon">Shannon</option>
            <option value="client">Client</option>
            <option value="subcontractor">Subcontractor</option>
          </select>
        </div>
        <div className="fg">
          <label className="fl">Description</label>
          <textarea className="fi" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="ma">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-p" disabled={saving}>
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
