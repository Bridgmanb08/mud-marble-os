import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import { MentionTextarea } from '../ui/MentionTextarea';

interface NewNoteModalProps {
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
}

export function NewNoteModal({ projectId, onClose, onCreated }: NewNoteModalProps) {
  const [author, setAuthor] = useState('brent');
  const [noteType, setNoteType] = useState('site_visit');
  const [content, setContent] = useState('');
  const [clientVisible, setClientVisible] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!content.trim()) {
      setError('Note content is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post(`/projects/${projectId}/notes`, {
        author,
        note_type: noteType,
        content: content.trim(),
        is_client_visible: clientVisible,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save note');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Log a note" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div className="merr">{error}</div>}
        <div className="fr">
          <div className="fg">
            <label className="fl">Author</label>
            <select className="fi" value={author} onChange={(e) => setAuthor(e.target.value)}>
              <option value="brent">Brent</option>
              <option value="shannon">Shannon</option>
              <option value="alex">Alex</option>
              <option value="faith">Faith</option>
            </select>
          </div>
          <div className="fg">
            <label className="fl">Type</label>
            <select className="fi" value={noteType} onChange={(e) => setNoteType(e.target.value)}>
              <option value="site_visit">Site visit</option>
              <option value="client_communication">Client communication</option>
              <option value="internal">Internal</option>
              <option value="daily_log">Daily log</option>
            </select>
          </div>
        </div>
        <div className="fg">
          <label className="fl">Note</label>
          <MentionTextarea
            style={{ minHeight: 120, width: '100%' }}
            value={content}
            onChange={setContent}
            placeholder="What happened, what was decided, what's next… Type @ to tag someone"
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <input type="checkbox" id="ncv" checked={clientVisible} onChange={(e) => setClientVisible(e.target.checked)} />
          <label htmlFor="ncv" style={{ fontSize: 13 }}>
            Client visible
          </label>
        </div>
        <div className="ma">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-p" disabled={saving}>
            {saving ? 'Saving…' : 'Save note'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
