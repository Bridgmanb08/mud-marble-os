import { useState, type FormEvent } from 'react';
import { IconX } from '@tabler/icons-react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import { MentionTextarea } from '../ui/MentionTextarea';
import { useToast } from '../ui/Toast';
import { assertMediaSize, readWeblocUrl, uploadWorkOrderMedia } from '../../lib/fileUpload';
import { UploadProgress } from './UploadProgress';
import type { RentalProperty, RentalWorkOrder } from '../../types';

export function NewRentalWorkOrderModal({
  properties,
  defaultPropertyId,
  onClose,
  onSaved,
}: {
  properties: RentalProperty[];
  defaultPropertyId?: string;
  onClose: () => void;
  onSaved: (wo: RentalWorkOrder) => void;
}) {
  const toast = useToast();
  const [propertyId, setPropertyId] = useState(defaultPropertyId || properties[0]?.id || '');
  const [unitId, setUnitId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('normal');
  const [assignedTo, setAssignedTo] = useState('');
  const [links, setLinks] = useState<string[]>([]);
  const [linkDraft, setLinkDraft] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<{ name: string; pct: number } | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const units = properties.find((p) => p.id === propertyId)?.units || [];

  function showError(message: string) {
    setError(message);
    toast(message, true);
  }

  function addLink(raw: string) {
    const url = raw.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      showError('Paste a full link starting with https:// — a Google Photos link works.');
      return;
    }
    setLinks((prev) => (prev.includes(url) ? prev : [...prev, url]));
    setLinkDraft('');
    setError('');
  }

  async function addFiles(list: FileList | null) {
    const next: File[] = [];
    for (const file of Array.from(list || [])) {
      const webloc = await readWeblocUrl(file);
      if (webloc) {
        addLink(webloc);
        continue;
      }
      try {
        assertMediaSize(file);
      } catch (err) {
        showError(err instanceof Error ? err.message : 'That file is too large.');
        continue;
      }
      const isMedia = file.type.startsWith('image/') || file.type.startsWith('video/') || /\.(jpe?g|png|gif|webp|heic|heif|mp4|mov|webm|m4v)$/i.test(file.name);
      if (!isMedia) {
        showError(`${file.name} isn’t a photo or video. Paste a link for anything else.`);
        continue;
      }
      next.push(file);
    }
    if (next.length) setFiles((prev) => [...prev, ...next]);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!propertyId || !title.trim()) {
      showError('Property and title are required.');
      return;
    }
    for (const file of files) {
      try {
        assertMediaSize(file);
      } catch (err) {
        showError(err instanceof Error ? err.message : 'That file is too large.');
        return;
      }
    }
    setSaving(true);
    setError('');
    try {
      const created = await api.post<RentalWorkOrder>('/rental-work-orders', {
        property_id: propertyId,
        unit_id: unitId || null,
        title: title.trim(),
        description: description.trim() || null,
        priority,
        assigned_to: assignedTo.trim() || null,
        links,
      });
      const failed: string[] = [];
      for (const file of files) {
        try {
          setProgress({ name: file.name, pct: 0 });
          await uploadWorkOrderMedia(created.id, file, {
            updateText: description.trim(),
            onProgress: (pct) => setProgress({ name: file.name, pct }),
          });
        } catch (err) {
          failed.push(err instanceof Error ? err.message : file.name);
        }
      }
      setProgress(null);
      onSaved(created);
      if (failed.length) {
        toast(`Work order saved, but ${failed.length} file${failed.length === 1 ? '' : 's'} didn’t upload. Open it and try again. ${failed[0]}`, true);
      }
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Failed to save work order');
      setSaving(false);
      setProgress(null);
    }
  }

  return (
    <Modal title="New work order" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && (
          <div className="merr" role="alert">
            {error}
          </div>
        )}
        <div className="fr">
          <div className="fg">
            <label className="fl">Property</label>
            <select
              className="fi"
              value={propertyId}
              onChange={(e) => {
                setPropertyId(e.target.value);
                setUnitId('');
              }}
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.address}
                </option>
              ))}
            </select>
          </div>
          <div className="fg">
            <label className="fl">Unit (optional)</label>
            <select className="fi" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              <option value="">— Whole property —</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.unit_label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="fg">
          <label className="fl">Title</label>
          <input className="fi" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>
        <div className="fg">
          <label className="fl">Description — type @ to mention someone</label>
          <MentionTextarea value={description} onChange={setDescription} placeholder="What’s going on? @Brent" />
        </div>
        <div className="fg">
          <label className="fl">Photos and videos</label>
          <input
            className="fi"
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={(e) => {
              void addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          {files.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {files.map((file, i) => (
                <div key={`${file.name}-${i}`} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, padding: '4px 0' }}>
                  <span style={{ flex: 1 }}>{file.name}</span>
                  <button type="button" className="btn-reset" aria-label={`Remove ${file.name}`} onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} style={{ color: 'var(--red)', cursor: 'pointer' }}>
                    <IconX size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {progress && <UploadProgress name={progress.name} pct={progress.pct} />}
        </div>
        <div className="fg">
          <label className="fl">Link (Google Photos or any link)</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="fi"
              value={linkDraft}
              placeholder="https://photos.google.com/..."
              onChange={(e) => setLinkDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addLink(linkDraft);
                }
              }}
            />
            <button type="button" className="btn btn-sm" onClick={() => addLink(linkDraft)}>
              Add
            </button>
          </div>
          {links.map((url) => (
            <div key={url} style={{ fontSize: 12, marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
              <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {url}
              </a>
              <button type="button" className="btn-reset" aria-label="Remove link" onClick={() => setLinks((prev) => prev.filter((u) => u !== url))} style={{ color: 'var(--red)', cursor: 'pointer' }}>
                <IconX size={14} />
              </button>
            </div>
          ))}
        </div>
        <div className="fr">
          <div className="fg">
            <label className="fl">Priority</label>
            <select className="fi" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div className="fg">
            <label className="fl">Assigned to</label>
            <input className="fi" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} />
          </div>
        </div>
        <div className="ma">
          <button type="button" className="btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btn-p" disabled={saving}>
            {saving ? 'Saving…' : 'Create work order'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
