import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import type { Estimate, Project } from '../../types';

export function ApplyTemplateModal({ templateId, onClose }: { templateId: string; onClose: () => void }) {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<Project[]>('/projects').then(setProjects).catch(() => {});
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!projectId) {
      setError('Pick a project first.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const estimate = await api.post<Estimate>(`/estimate-templates/${templateId}/apply`, { project_id: projectId });
      navigate(`/estimates/${estimate.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create estimate from template');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Use for new estimate" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div className="merr">{error}</div>}
        <div className="fg">
          <label className="fl">Project</label>
          <select className="fi" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">— Select a project —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name.replace(/\|.*/, '').trim()}
              </option>
            ))}
          </select>
        </div>
        <div className="ma">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-p" disabled={saving}>
            {saving ? 'Creating…' : 'Create estimate'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
