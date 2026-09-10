import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import type { Invoice, Project } from '../../types';

interface NewInvoiceModalProps {
  onClose: () => void;
  onCreated: (invoice: Invoice) => void;
  defaultProjectId?: string;
}

// Deliberately minimal -- picking the job is the only real decision here.
// Everything else (invoice number, type, amount, due date, notes) is either
// auto-filled (the number picks up the next one for that job -- see
// _next_invoice_number in the backend) or edited afterward in the full
// editor, which opens automatically the moment the job is chosen.
export function NewInvoiceModal({ onClose, onCreated, defaultProjectId }: NewInvoiceModalProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState(defaultProjectId || '');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  // React StrictMode double-invokes effects in dev, and this effect fires a
  // real POST -- without a synchronous mark before the async call starts,
  // that means two invoices created per click. Same mark-before-await
  // pattern this codebase already uses for TeamReminders' poll functions.
  const autoCreateStarted = useRef(false);

  useEffect(() => {
    if (!defaultProjectId) {
      api.get<Project[]>('/projects').then(setProjects).catch(() => {});
    }
  }, [defaultProjectId]);

  async function createFor(pid: string) {
    setCreating(true);
    setError('');
    try {
      const created = await api.post<Invoice>('/invoices', { project_id: pid });
      onCreated(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create invoice');
      setCreating(false);
    }
  }

  // The project is already known from context (Project Detail's own
  // "Create invoice" button) -- nothing to ask, just create it and let the
  // parent swap this modal for the editor.
  useEffect(() => {
    if (defaultProjectId && !autoCreateStarted.current) {
      autoCreateStarted.current = true;
      createFor(defaultProjectId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultProjectId]);

  if (defaultProjectId) {
    return (
      <Modal title="Create invoice" onClose={onClose}>
        {error ? (
          <div className="merr">{error}</div>
        ) : (
          <div className="empty" style={{ padding: 20 }}>
            <div className="empty-t">Creating invoice…</div>
          </div>
        )}
      </Modal>
    );
  }

  return (
    <Modal title="Create invoice" onClose={onClose}>
      {error && <div className="merr">{error}</div>}
      <div className="fg">
        <label className="fl">Which job is this invoice for?</label>
        <select
          className="fi"
          autoFocus
          value={projectId}
          disabled={creating}
          onChange={(e) => {
            const pid = e.target.value;
            setProjectId(pid);
            if (pid) createFor(pid);
          }}
        >
          <option value="">— Select project —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name.replace(/\|.*/, '').trim()}
            </option>
          ))}
        </select>
      </div>
      <div className="ma">
        <button type="button" className="btn" onClick={onClose} disabled={creating}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
