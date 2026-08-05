import { useEffect, useState } from 'react';
import { IconFile, IconPlayerPlay, IconTrash } from '@tabler/icons-react';
import { api } from '../../api/client';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { openDatePicker } from '../../lib/datePicker';
import { FileDropzone } from '../ui/FileDropzone';
import { uploadRentalVisitFile } from '../../lib/fileUpload';
import type { DownloadUrlResponse, RentalFile, RentalPropertyVisit } from '../../types';

// Edits a single logged visit -- a quick pin-icon log from the Rent Roll
// creates one of these with no notes/files yet; this modal is where the
// "what did it look like" record (a summary + photos/video) actually gets
// added, matching Brent's ask for the visit log to carry a status snapshot,
// not just a bare timestamp.
export function VisitLogModal({ visit, onClose, onSaved }: { visit: RentalPropertyVisit; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [visitedAt, setVisitedAt] = useState(visit.visited_at);
  const [visitedBy, setVisitedBy] = useState(visit.visited_by || '');
  const [notes, setNotes] = useState(visit.notes || '');
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState<RentalFile[]>([]);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  function loadFiles() {
    api
      .get<RentalFile[]>(`/rental-files?visit_id=${visit.id}`)
      .then(setFiles)
      .catch(() => {});
  }

  useEffect(loadFiles, [visit.id]);

  async function save() {
    setSaving(true);
    try {
      await api.patch(`/rental-properties/visits/${visit.id}`, {
        visited_at: visitedAt,
        visited_by: visitedBy.trim() || null,
        notes: notes.trim() || null,
      });
      toast('Visit updated');
      onSaved();
    } catch {
      toast('Failed to save visit', true);
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload() {
    if (!pendingFile) return;
    setUploading(true);
    try {
      await uploadRentalVisitFile(visit.id, pendingFile);
      setPendingFile(null);
      toast('Photo uploaded');
      loadFiles();
    } catch {
      toast('Failed to upload photo', true);
    } finally {
      setUploading(false);
    }
  }

  async function downloadFile(f: RentalFile) {
    try {
      const { download_url } = await api.get<DownloadUrlResponse>(`/rental-files/${f.id}/download`);
      window.open(download_url, '_blank', 'noopener');
    } catch {
      toast('Failed to open file', true);
    }
  }

  async function deleteFile(f: RentalFile) {
    try {
      await api.delete(`/rental-files/${f.id}`);
      toast('File removed');
      loadFiles();
    } catch {
      toast('Failed to remove file', true);
    }
  }

  return (
    <Modal title="Visit details" onClose={onClose}>
      <div className="fg">
        <label className="fl">Date visited</label>
        <input className="fi" type="date" value={visitedAt} onClick={openDatePicker} onChange={(e) => setVisitedAt(e.target.value)} />
      </div>
      <div className="fg">
        <label className="fl">Visited by</label>
        <input className="fi" value={visitedBy} onChange={(e) => setVisitedBy(e.target.value)} placeholder="e.g. Megan" />
      </div>
      <div className="fg">
        <label className="fl">Summary</label>
        <textarea
          className="fi"
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What did the property look like? Any issues, tenant concerns, repairs needed…"
        />
      </div>

      <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
        <div className="ibt" style={{ fontSize: 13, textTransform: 'none', letterSpacing: 0, border: 'none', padding: 0, marginBottom: 10 }}>
          Photos &amp; video
        </div>
        {files.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 8, marginBottom: 10 }}>
            {files.map((f) => (
              <div key={f.id} style={{ position: 'relative' }}>
                <button
                  type="button"
                  className="btn-reset"
                  style={{
                    width: '100%',
                    aspectRatio: '1',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--bg)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    cursor: 'pointer',
                    overflow: 'hidden',
                  }}
                  onClick={() => downloadFile(f)}
                  title={f.file_name}
                >
                  {f.file_type === 'video' ? <IconPlayerPlay size={20} color="var(--t3)" /> : <IconFile size={20} color="var(--t3)" />}
                  <span style={{ fontSize: 10, color: 'var(--t3)', padding: '0 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                    {f.file_name}
                  </span>
                </button>
                <button
                  type="button"
                  className="btn-reset"
                  style={{
                    position: 'absolute',
                    top: -6,
                    right: -6,
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '50%',
                    width: 20,
                    height: 20,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: 'var(--red)',
                  }}
                  onClick={() => deleteFile(f)}
                >
                  <IconTrash size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
        <FileDropzone
          accept="image/*,video/*"
          file={pendingFile}
          onFileSelected={setPendingFile}
          label="Drag and drop a photo or video here, or click to browse"
        />
        {pendingFile && (
          <div style={{ marginTop: 8 }}>
            <button className="btn btn-sm btn-p" onClick={handleUpload} disabled={uploading}>
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        )}
      </div>

      <div className="ma">
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
        <button type="button" className="btn btn-p" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  );
}
