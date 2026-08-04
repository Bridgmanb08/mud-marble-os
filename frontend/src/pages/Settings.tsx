import { useEffect, useState, type FormEvent } from 'react';
import { IconPlus } from '@tabler/icons-react';
import { api, ApiError } from '../api/client';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../auth/AuthContext';
import { Modal } from '../components/ui/Modal';
import { NewSubcontractorModal } from '../components/subcontractors/NewSubcontractorModal';
import { RichTextEditor } from '../components/ui/RichTextEditor';
import { TagChip } from '../components/tags/TagChip';
import { useReferenceData } from '../reference-data/ReferenceDataContext';
import { fmtD } from '../lib/format';
import type { CostCode, EstimateTextDefaults, NotificationSettings, PersonTag, Subcontractor } from '../types';

function CostCodeModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [defaultDescription, setDefaultDescription] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      setError('Code and name are both required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post('/cost-codes', {
        code: code.trim(),
        name: name.trim(),
        default_description: defaultDescription.trim() || null,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create cost code');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Add cost code" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div className="merr">{error}</div>}
        <div className="fg">
          <label className="fl">Code</label>
          <input className="fi" value={code} onChange={(e) => setCode(e.target.value)} placeholder="08.00" />
        </div>
        <div className="fg">
          <label className="fl">Name</label>
          <input className="fi" value={name} onChange={(e) => setName(e.target.value)} placeholder="Electrical" />
        </div>
        <div className="fg">
          <label className="fl">Default customer-facing description</label>
          <textarea
            className="fi"
            value={defaultDescription}
            onChange={(e) => setDefaultDescription(e.target.value)}
            placeholder="Standard scope language used whenever this cost code is added to an estimate…"
          />
        </div>
        <div className="ma">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-p" disabled={saving}>
            {saving ? 'Saving…' : 'Add cost code'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditCostCodeModal({ costCode, onClose, onSaved }: { costCode: CostCode; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState(costCode.code);
  const [name, setName] = useState(costCode.name);
  const [defaultDescription, setDefaultDescription] = useState(costCode.default_description || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      setError('Code and name are both required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.patch(`/cost-codes/${costCode.id}`, {
        code: code.trim(),
        name: name.trim(),
        default_description: defaultDescription.trim() || null,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save cost code');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Edit cost code" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div className="merr">{error}</div>}
        <div className="fg">
          <label className="fl">Code</label>
          <input className="fi" value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        <div className="fg">
          <label className="fl">Name</label>
          <input className="fi" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="fg">
          <label className="fl">Default customer-facing description</label>
          <textarea
            className="fi"
            value={defaultDescription}
            onChange={(e) => setDefaultDescription(e.target.value)}
            placeholder="Standard scope language used whenever this cost code is added to an estimate…"
          />
        </div>
        <div className="ma">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-p" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CostCodesTab() {
  const toast = useToast();
  const { refreshCostCodes } = useReferenceData();
  const [costCodes, setCostCodes] = useState<CostCode[] | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<CostCode | undefined>(undefined);

  async function load() {
    try {
      setCostCodes(await api.get<CostCode[]>('/cost-codes'));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load cost codes', true);
      setCostCodes([]);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleActive(cc: CostCode) {
    try {
      await api.patch(`/cost-codes/${cc.id}`, { is_active: !cc.is_active });
      toast(cc.is_active ? 'Cost code deactivated' : 'Cost code reactivated');
      load();
      refreshCostCodes();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to update cost code', true);
    }
  }

  return (
    <>
      <div className="sh">
        <div className="st">Cost codes {costCodes ? `(${costCodes.length})` : ''}</div>
        <button className="btn btn-p btn-sm" onClick={() => setShowNew(true)}>
          <IconPlus size={14} /> Add cost code
        </button>
      </div>

      {costCodes === null ? (
        <div className="empty">
          <div className="empty-t">Loading…</div>
        </div>
      ) : costCodes.length === 0 ? (
        <div className="empty-s">No cost codes yet.</div>
      ) : (
        <table className="tbl">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Description</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {costCodes.map((cc) => (
              <tr key={cc.id} onClick={() => setEditing(cc)} style={{ cursor: 'pointer' }}>
                <td style={{ fontWeight: 500 }}>{cc.code}</td>
                <td>{cc.name}</td>
                <td>
                  {cc.default_description ? (
                    <span className="badge bg-green">Set</span>
                  ) : (
                    <span className="badge bg-amber">Not set</span>
                  )}
                </td>
                <td>
                  <span className={`badge ${cc.is_active ? 'bg-green' : 'bg-gray'}`}>{cc.is_active ? 'Active' : 'Inactive'}</span>
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(cc)}>
                    {cc.is_active ? 'Deactivate' : 'Reactivate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showNew && (
        <CostCodeModal
          onClose={() => setShowNew(false)}
          onSaved={() => {
            setShowNew(false);
            toast('Cost code added');
            load();
            refreshCostCodes();
          }}
        />
      )}

      {editing && (
        <EditCostCodeModal
          costCode={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            toast('Cost code updated');
            load();
            refreshCostCodes();
          }}
        />
      )}
    </>
  );
}

function SubcontractorsTab() {
  const toast = useToast();
  const { subcontractors: subs, refreshSubcontractors } = useReferenceData();
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<Subcontractor | undefined>(undefined);

  return (
    <>
      <div className="sh">
        <div className="st">Subcontractors {subs ? `(${subs.length})` : ''}</div>
        <button className="btn btn-p btn-sm" onClick={() => setShowNew(true)}>
          <IconPlus size={14} /> Add sub
        </button>
      </div>

      {subs === null ? (
        <div className="empty">
          <div className="empty-t">Loading…</div>
        </div>
      ) : subs.length === 0 ? (
        <div className="empty-s">No subcontractors yet. Add your trade partners to build the roster.</div>
      ) : (
        <table className="tbl">
          <thead>
            <tr>
              <th>Company</th>
              <th>Trade</th>
              <th>Contact</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {subs.map((s) => (
              <tr key={s.id} onClick={() => setEditing(s)} style={{ cursor: 'pointer' }}>
                <td style={{ fontWeight: 500 }}>{s.company_name}</td>
                <td>{s.trade || '—'}</td>
                <td>{s.contact_name || '—'}</td>
                <td style={{ display: 'flex', gap: 6 }}>
                  {s.preferred && <span className="badge bg-green">Preferred</span>}
                  {s.w9_on_file ? <span className="badge bg-green">W9 ✓</span> : <span className="badge bg-amber">W9 needed</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showNew && (
        <NewSubcontractorModal
          onClose={() => setShowNew(false)}
          onSaved={() => {
            setShowNew(false);
            toast('Sub added');
            refreshSubcontractors();
          }}
        />
      )}

      {editing && (
        <NewSubcontractorModal
          sub={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            toast('Sub updated');
            refreshSubcontractors();
          }}
        />
      )}
    </>
  );
}

function DefaultTextTab() {
  const toast = useToast();
  const [defaults, setDefaults] = useState<EstimateTextDefaults | null>(null);
  const [introText, setIntroText] = useState('');
  const [closingText, setClosingText] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const data = await api.get<EstimateTextDefaults>('/estimate-text-defaults');
      setDefaults(data);
      setIntroText(data.introductory_text || '');
      setClosingText(data.closing_text || '');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load default text', true);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    setSaving(true);
    try {
      await api.patch('/estimate-text-defaults', { introductory_text: introText, closing_text: closingText });
      toast('Default text saved');
      load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to save default text', true);
    } finally {
      setSaving(false);
    }
  }

  if (!defaults) {
    return (
      <div className="empty">
        <div className="empty-t">Loading…</div>
      </div>
    );
  }

  return (
    <>
      <div className="sh">
        <div className="st">Default proposal text</div>
        <button className="btn btn-p btn-sm" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
      <div className="empty-s" style={{ marginBottom: 16, marginTop: -8 }}>
        This is what every new estimate starts with (opening welcome message + closing legal terms). Anyone logged in
        can edit it here; each estimate can still be tweaked on its own afterward without affecting this default.
      </div>

      <div className="fg">
        <label className="fl">Opening / introductory text</label>
        <RichTextEditor value={introText} onChange={setIntroText} minHeight={120} placeholder="e.g. a welcome message shown at the top of every proposal…" />
      </div>

      <div className="fg" style={{ marginBottom: 0 }}>
        <label className="fl">Closing text (legal terms)</label>
        <RichTextEditor value={closingText} onChange={setClosingText} minHeight={320} />
      </div>
    </>
  );
}

function PersonTagModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [label, setLabel] = useState('');
  const [color, setColor] = useState('#7B4B34');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!label.trim()) {
      setError('Label is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post('/person-tags', { label: label.trim(), color });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create tag');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Add tag" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div className="merr">{error}</div>}
        <div className="fr">
          <div className="fg">
            <label className="fl">Label</label>
            <input className="fi" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="VIP" />
          </div>
          <div className="fg">
            <label className="fl">Color</label>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              style={{ width: '100%', height: 34, padding: 2, border: '1px solid var(--border-md)', borderRadius: 'var(--r)' }}
            />
          </div>
        </div>
        <div className="ma">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-p" disabled={saving}>
            {saving ? 'Saving…' : 'Add tag'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditPersonTagModal({ tag, onClose, onSaved }: { tag: PersonTag; onClose: () => void; onSaved: () => void }) {
  const [label, setLabel] = useState(tag.label);
  const [color, setColor] = useState(tag.color);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!label.trim()) {
      setError('Label is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.patch(`/person-tags/${tag.id}`, { label: label.trim(), color });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save tag');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      await api.delete(`/person-tags/${tag.id}`);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete tag');
      setSaving(false);
    }
  }

  return (
    <Modal title="Edit tag" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div className="merr">{error}</div>}
        <div className="fr">
          <div className="fg">
            <label className="fl">Label</label>
            <input className="fi" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="fg">
            <label className="fl">Color</label>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              style={{ width: '100%', height: 34, padding: 2, border: '1px solid var(--border-md)', borderRadius: 'var(--r)' }}
            />
          </div>
        </div>
        <div className="ma">
          <button type="button" className="btn" style={{ color: 'var(--red)' }} onClick={handleDelete} disabled={saving}>
            Delete
          </button>
          <div style={{ flex: 1 }} />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-p" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PersonTagsTab() {
  const toast = useToast();
  const [tags, setTags] = useState<PersonTag[] | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<PersonTag | undefined>(undefined);

  async function load() {
    try {
      setTags(await api.get<PersonTag[]>('/person-tags'));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load tags', true);
      setTags([]);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="sh">
        <div className="st">Person tags {tags ? `(${tags.length})` : ''}</div>
        <button className="btn btn-p btn-sm" onClick={() => setShowNew(true)}>
          <IconPlus size={14} /> Add tag
        </button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 14 }}>
        Tags are shared across clients, subcontractors, and leads — attach them from a client's or subcontractor's
        page.
      </p>

      {tags === null ? (
        <div className="empty">
          <div className="empty-t">Loading…</div>
        </div>
      ) : tags.length === 0 ? (
        <div className="empty-s">No tags yet.</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {tags.map((t) => (
            <button
              key={t.id}
              type="button"
              className="btn-reset"
              onClick={() => setEditing(t)}
              style={{ cursor: 'pointer' }}
            >
              <TagChip tag={t} />
            </button>
          ))}
        </div>
      )}

      {showNew && (
        <PersonTagModal
          onClose={() => setShowNew(false)}
          onSaved={() => {
            setShowNew(false);
            toast('Tag added');
            load();
          }}
        />
      )}

      {editing && (
        <EditPersonTagModal
          tag={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            toast('Tag saved');
            load();
          }}
        />
      )}
    </>
  );
}

function QuickTaskWidgetSettings() {
  const toast = useToast();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get<{ quick_task_widget_enabled: boolean }>('/users/me/preferences')
      .then((p) => setEnabled(p.quick_task_widget_enabled))
      .catch(() => toast('Failed to load your preferences', true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggle() {
    if (enabled === null) return;
    setSaving(true);
    try {
      const updated = await api.patch<{ quick_task_widget_enabled: boolean }>('/users/me/preferences', {
        quick_task_widget_enabled: !enabled,
      });
      setEnabled(updated.quick_task_widget_enabled);
      toast(updated.quick_task_widget_enabled ? 'Quick task button enabled' : 'Quick task button disabled');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to update your preferences', true);
    } finally {
      setSaving(false);
    }
  }

  if (enabled === null) {
    return (
      <div className="empty">
        <div className="empty-t">Loading…</div>
      </div>
    );
  }

  return (
    <>
      <div className="sh">
        <div className="st">Quick task button</div>
      </div>
      <p style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 14 }}>
        Adds a floating button in the bottom-right corner of every page. Click it to jot down a quick task — it's
        added straight to the top of the Task Board's To Do list, so it's there the next time you look. This is a
        personal preference — turning it on or off only affects your own view, not anyone else's.
      </p>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
        <input type="checkbox" checked={enabled} onChange={toggle} disabled={saving} />
        Show the quick task button
      </label>
    </>
  );
}

function NotificationSettingsTab() {
  const toast = useToast();
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      setSettings(await api.get<NotificationSettings>('/notification-settings'));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load notification settings', true);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggle() {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await api.patch<NotificationSettings>('/notification-settings', {
        smart_learning_enabled: !settings.smart_learning_enabled,
      });
      setSettings(updated);
      toast(updated.smart_learning_enabled ? 'Smart learning enabled' : 'Smart learning disabled');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to update notification settings', true);
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return (
      <div className="empty">
        <div className="empty-t">Loading…</div>
      </div>
    );
  }

  return (
    <>
      <div className="sh">
        <div className="st">Notification settings</div>
      </div>
      <p style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 14 }}>
        When enabled, the app proactively nudges people about tasks tied to the job they're scheduled at, with a
        short briefing when they first sign in each day and another checkpoint around 3pm. This is a company-wide
        switch — it applies to everyone, not per person.
      </p>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
        <input type="checkbox" checked={settings.smart_learning_enabled} onChange={toggle} disabled={saving} />
        Enable smart learning & proactive reminders
      </label>
      {settings.updated_at && (
        <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 10 }}>Last changed {fmtD(settings.updated_at)}</p>
      )}
    </>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'cost-codes' | 'subcontractors' | 'person-tags' | 'notifications' | 'default-text'>(
    user?.is_admin ? 'cost-codes' : 'default-text'
  );

  return (
    <>
      <div className="ph">
        <div>
          <h1>Settings</h1>
          <p>{user?.is_admin ? 'Admin configuration for shared reference data' : 'Shared reference data'}</p>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 16 }}>
        {user?.is_admin && (
          <>
            <button className={`tab${tab === 'cost-codes' ? ' on' : ''}`} onClick={() => setTab('cost-codes')}>
              Cost codes
            </button>
            <button className={`tab${tab === 'subcontractors' ? ' on' : ''}`} onClick={() => setTab('subcontractors')}>
              Subcontractors
            </button>
            <button className={`tab${tab === 'person-tags' ? ' on' : ''}`} onClick={() => setTab('person-tags')}>
              Person tags
            </button>
          </>
        )}
        <button className={`tab${tab === 'notifications' ? ' on' : ''}`} onClick={() => setTab('notifications')}>
          Notification settings
        </button>
        <button className={`tab${tab === 'default-text' ? ' on' : ''}`} onClick={() => setTab('default-text')}>
          Default Text
        </button>
      </div>

      {tab === 'cost-codes' && user?.is_admin && <CostCodesTab />}
      {tab === 'subcontractors' && user?.is_admin && <SubcontractorsTab />}
      {tab === 'person-tags' && user?.is_admin && <PersonTagsTab />}
      {tab === 'notifications' && (
        <>
          <QuickTaskWidgetSettings />
          {user?.is_admin && (
            <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
              <NotificationSettingsTab />
            </div>
          )}
        </>
      )}
      {tab === 'default-text' && <DefaultTextTab />}
    </>
  );
}
