import { useEffect, useState, type FormEvent } from 'react';
import { IconPlus } from '@tabler/icons-react';
import { api, ApiError } from '../api/client';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../auth/AuthContext';
import { Modal } from '../components/ui/Modal';
import { NewSubcontractorModal } from '../components/subcontractors/NewSubcontractorModal';
import type { CostCode, Subcontractor } from '../types';

const SETTINGS_TABS = ['Cost Codes', 'Subcontractors'] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number];

function CostCodeModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
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
      await api.post('/cost-codes', { code: code.trim(), name: name.trim() });
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
      await api.patch(`/cost-codes/${costCode.id}`, { code: code.trim(), name: name.trim() });
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
          }}
        />
      )}
    </>
  );
}

function SubcontractorsTab() {
  const toast = useToast();
  const [subs, setSubs] = useState<Subcontractor[] | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<Subcontractor | undefined>(undefined);

  async function load() {
    try {
      setSubs(await api.get<Subcontractor[]>('/subcontractors'));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load subcontractors', true);
      setSubs([]);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="sh">
        <div className="st">Subcontractors {subs ? `(${subs.length})` : ''}</div>
        <button className="btn btn-p btn-sm" onClick={() => setShowNew(true)}>
          <IconPlus size={14} /> Add subcontractor
        </button>
      </div>
      <p className="empty-s" style={{ marginTop: -8 }}>
        This is the same list used everywhere a task or calendar entry needs a subcontractor -- the roster page has
        compliance details (insurance, W9); this is the fast add/edit view.
      </p>

      {subs === null ? (
        <div className="empty">
          <div className="empty-t">Loading…</div>
        </div>
      ) : subs.length === 0 ? (
        <div className="empty-s">No subcontractors yet.</div>
      ) : (
        <table className="tbl">
          <thead>
            <tr>
              <th>Company</th>
              <th>Trade</th>
              <th>Contact</th>
              <th>Phone</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {subs.map((s) => (
              <tr key={s.id} onClick={() => setEditing(s)} style={{ cursor: 'pointer' }}>
                <td style={{ fontWeight: 500 }}>{s.company_name}</td>
                <td>{s.trade || '—'}</td>
                <td>{s.contact_name || '—'}</td>
                <td>{s.phone || '—'}</td>
                <td>
                  <span className={`badge ${s.is_active ? 'bg-green' : 'bg-gray'}`}>{s.is_active ? 'Active' : 'Inactive'}</span>
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
            toast('Subcontractor added');
            load();
          }}
        />
      )}

      {editing && (
        <NewSubcontractorModal
          sub={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            toast('Subcontractor updated');
            load();
          }}
        />
      )}
    </>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const [tab, setTab] = useState<SettingsTab>('Cost Codes');

  if (!user?.is_admin) {
    return (
      <div className="empty">
        <div className="empty-t">Admins only</div>
        <div className="empty-s">Ask an admin on your team for access to Settings.</div>
      </div>
    );
  }

  return (
    <>
      <div className="ph">
        <div>
          <h1>Settings</h1>
          <p>Admin configuration for shared reference data</p>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 16 }}>
        {SETTINGS_TABS.map((t) => (
          <button key={t} type="button" className={`tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Cost Codes' ? <CostCodesTab /> : <SubcontractorsTab />}
    </>
  );
}
