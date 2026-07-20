import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import { openDatePicker } from '../../lib/datePicker';

interface NewProjectModalProps {
  onClose: () => void;
  onCreated: () => void;
}

const STATUS_OPTIONS = ['lead', 'vetting', 'estimating', 'proposed', 'active'];

export function NewProjectModal({ onClose, onCreated }: NewProjectModalProps) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [zip, setZip] = useState('');
  const [status, setStatus] = useState('lead');
  const [projectType, setProjectType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [estimatedCompletion, setEstimatedCompletion] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Project name is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post('/projects', {
        name: name.trim(),
        address: address.trim() || null,
        zip: zip.trim() || null,
        status,
        project_type: projectType.trim() || null,
        start_date: startDate || null,
        estimated_completion: estimatedCompletion || null,
        internal_notes: notes.trim() || null,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create project');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New project" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div className="merr">{error}</div>}
        <div className="fg">
          <label className="fl">Project name</label>
          <input className="fi" value={name} onChange={(e) => setName(e.target.value)} placeholder="4040 N Park Ave Renovation" />
        </div>
        <div className="fr">
          <div className="fg">
            <label className="fl">Address</label>
            <input className="fi" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="4040 N Park Ave" />
          </div>
          <div className="fg">
            <label className="fl">Zip</label>
            <input className="fi" value={zip} onChange={(e) => setZip(e.target.value)} placeholder="46205" />
          </div>
        </div>
        <div className="fr">
          <div className="fg">
            <label className="fl">Status</label>
            <select className="fi" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="fg">
            <label className="fl">Project type</label>
            <input className="fi" value={projectType} onChange={(e) => setProjectType(e.target.value)} placeholder="renovation, addition…" />
          </div>
        </div>
        <div className="fr">
          <div className="fg">
            <label className="fl">Start date</label>
            <input className="fi" type="date" value={startDate} onClick={openDatePicker} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="fg">
            <label className="fl">Est. completion</label>
            <input className="fi" type="date" value={estimatedCompletion} onClick={openDatePicker} onChange={(e) => setEstimatedCompletion(e.target.value)} />
          </div>
        </div>
        <div className="fg">
          <label className="fl">Notes</label>
          <textarea className="fi" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Site visit observations…" />
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
