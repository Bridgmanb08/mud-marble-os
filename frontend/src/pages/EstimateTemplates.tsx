import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconTemplate, IconPlus, IconCopy, IconTrash, IconFileSpreadsheet } from '@tabler/icons-react';
import { api, ApiError } from '../api/client';
import { useToast } from '../components/ui/Toast';
import { Modal } from '../components/ui/Modal';
import { ImportTemplateExcel } from '../components/estimates/ImportTemplateExcel';
import type { EstimateTemplate } from '../types';

function NewTemplateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (t: EstimateTemplate) => void }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const created = await api.post<EstimateTemplate>('/estimate-templates', {
        name: name.trim(),
        category: category.trim() || null,
        description: description.trim() || null,
      });
      onCreated(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create template');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New template" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div className="merr">{error}</div>}
        <div className="fg">
          <label className="fl">Name</label>
          <input className="fi" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Bathroom remodel" />
        </div>
        <div className="fg">
          <label className="fl">Category</label>
          <input
            className="fi"
            list="template-category-options"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Bathroom, Kitchen, Addition…"
          />
          <datalist id="template-category-options">
            <option value="Bathroom" />
            <option value="Kitchen" />
            <option value="Addition" />
            <option value="Full Rehab" />
          </datalist>
        </div>
        <div className="fg">
          <label className="fl">Description</label>
          <textarea className="fi" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional notes about when to use this template…" />
        </div>
        <div className="ma">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-p" disabled={saving}>
            {saving ? 'Creating…' : 'Create template'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function EstimateTemplates() {
  const [templates, setTemplates] = useState<EstimateTemplate[] | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  function load() {
    api
      .get<EstimateTemplate[]>('/estimate-templates')
      .then(setTemplates)
      .catch((e) => toast(e instanceof Error ? e.message : 'Failed to load templates', true));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function duplicateTemplate(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await api.post(`/estimate-templates/${id}/duplicate`);
      toast('Template duplicated');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to duplicate template', true);
    }
  }

  async function deleteTemplate(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm('Delete this template? This cannot be undone.')) return;
    try {
      await api.delete(`/estimate-templates/${id}`);
      toast('Template deleted');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to delete template', true);
    }
  }

  const categories = new Set((templates ?? []).map((t) => t.category).filter((c): c is string => !!c));

  return (
    <>
      <div className="ph">
        <div>
          <h1>Estimate Templates</h1>
          <p>Reusable scopes you can build once and use on any job</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm" onClick={() => setShowImport(true)}>
            <IconFileSpreadsheet size={14} /> Import from Excel
          </button>
          <button className="btn btn-p btn-sm" onClick={() => setShowNew(true)}>
            <IconPlus size={14} /> New template
          </button>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 16 }}>
        <button className="tab" onClick={() => navigate('/estimates')}>
          All Estimates
        </button>
        <button className="tab on">Templates</button>
      </div>

      <div className="metrics">
        <div className="metric">
          <div className="m-label">Templates</div>
          <div className="m-val">{templates?.length ?? 0}</div>
        </div>
        <div className="metric">
          <div className="m-label">Categories</div>
          <div className="m-val">{categories.size}</div>
        </div>
      </div>

      <div className="card">
        {templates === null ? (
          <div className="empty">
            <div className="empty-t">Loading…</div>
          </div>
        ) : templates.length === 0 ? (
          <div className="empty" style={{ padding: 40 }}>
            <IconTemplate size={32} color="var(--t3)" style={{ display: 'block', margin: '0 auto 12px' }} />
            <div className="empty-t">No templates yet</div>
            <div className="empty-s">Build one from scratch, or save an existing estimate as a template.</div>
          </div>
        ) : (
          <table className="tbl tbl-zebra">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} onClick={() => navigate(`/estimates/templates/${t.id}`)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 500 }}>{t.name}</td>
                  <td>{t.category ? <span className="badge bg-gray">{t.category}</span> : '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-ghost btn-sm" onClick={(e) => duplicateTemplate(t.id, e)} title="Duplicate">
                      <IconCopy size={13} />
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={(e) => deleteTemplate(t.id, e)} title="Delete">
                      <IconTrash size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNew && (
        <NewTemplateModal
          onClose={() => setShowNew(false)}
          onCreated={(t) => {
            setShowNew(false);
            navigate(`/estimates/templates/${t.id}`);
          }}
        />
      )}

      {showImport && <ImportTemplateExcel onClose={() => setShowImport(false)} />}
    </>
  );
}
