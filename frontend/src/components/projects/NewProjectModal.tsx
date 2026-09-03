import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import { openDatePicker } from '../../lib/datePicker';
import type { Client, Project } from '../../types';

interface NewProjectModalProps {
  onClose: () => void;
  onCreated: (project: Project) => void;
  project?: Project;
}

const STATUS_OPTIONS = [
  'lead',
  'vetting',
  'estimating',
  'proposed',
  'pre_construction',
  'active',
  'punch_list',
  'warranty',
  'on_hold',
  'closed',
  'lost',
];

export function NewProjectModal({ onClose, onCreated, project }: NewProjectModalProps) {
  const [name, setName] = useState(project?.name || '');
  const [address, setAddress] = useState(project?.address || '');
  const [city, setCity] = useState(project?.city || '');
  const [state, setState] = useState(project?.state || '');
  const [zip, setZip] = useState(project?.zip || '');
  const [status, setStatus] = useState(project?.status || 'lead');
  const [projectType, setProjectType] = useState(project?.project_type || '');
  const [clientId, setClientId] = useState(project?.client_id || '');
  const [contractValue, setContractValue] = useState(project?.contract_value != null ? String(project.contract_value) : '');
  const [startDate, setStartDate] = useState(project?.start_date?.slice(0, 10) || '');
  const [estimatedCompletion, setEstimatedCompletion] = useState(project?.estimated_completion?.slice(0, 10) || '');
  const [notes, setNotes] = useState(project?.internal_notes || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);

  useEffect(() => {
    api.get<Client[]>('/clients').then(setClients).catch(() => {});
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Project name is required.');
      return;
    }
    setSaving(true);
    setError('');
    const payload = {
      name: name.trim(),
      address: address.trim() || null,
      city: city.trim() || null,
      state: state.trim() || null,
      zip: zip.trim() || null,
      status,
      project_type: projectType.trim() || null,
      client_id: clientId || null,
      contract_value: contractValue ? parseFloat(contractValue) : null,
      start_date: startDate || null,
      estimated_completion: estimatedCompletion || null,
      internal_notes: notes.trim() || null,
    };
    try {
      const saved = project
        ? await api.patch<Project>(`/projects/${project.id}`, payload)
        : await api.post<Project>('/projects', payload);
      onCreated(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save project');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={project ? 'Edit project' : 'New project'} onClose={onClose}>
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
            <label className="fl">City</label>
            <input className="fi" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Indianapolis" />
          </div>
          <div className="fg">
            <label className="fl">State</label>
            <input className="fi" value={state} onChange={(e) => setState(e.target.value)} placeholder="IN" />
          </div>
        </div>
        <div className="fr">
          <div className="fg">
            <label className="fl">Status</label>
            <select className="fi" value={status} onChange={(e) => setStatus(e.target.value)}>
              {(STATUS_OPTIONS.includes(status) ? STATUS_OPTIONS : [status, ...STATUS_OPTIONS]).map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, ' ')}
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
            <label className="fl">Client</label>
            <select className="fi" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">— No client —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {`${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unnamed client'}
                </option>
              ))}
            </select>
          </div>
          <div className="fg">
            <label className="fl">Contract value</label>
            <input
              className="fi"
              type="number"
              step="0.01"
              value={contractValue}
              onChange={(e) => setContractValue(e.target.value)}
              placeholder="0.00"
            />
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
            {saving ? 'Saving…' : project ? 'Save changes' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
