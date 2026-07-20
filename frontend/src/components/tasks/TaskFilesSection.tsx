import { useEffect, useRef, useState } from 'react';
import { IconFile, IconFileTypePdf, IconPhoto, IconTrash, IconUpload, IconVideo } from '@tabler/icons-react';
import { api } from '../../api/client';
import { useToast } from '../ui/Toast';
import { uploadProjectFile } from '../../lib/fileUpload';
import { FilePreviewModal } from '../projects/FilePreviewModal';
import type { ProjectFile } from '../../types';

function FileIcon({ type }: { type: string }) {
  if (type === 'photo') return <IconPhoto size={16} />;
  if (type === 'video') return <IconVideo size={16} />;
  if (type === 'plan') return <IconFileTypePdf size={16} />;
  return <IconFile size={16} />;
}

interface TaskFilesSectionProps {
  taskId: string;
  projectId: string | null;
}

export function TaskFilesSection({ taskId, projectId }: TaskFilesSectionProps) {
  const toast = useToast();
  const [linked, setLinked] = useState<ProjectFile[]>([]);
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [pickId, setPickId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<ProjectFile | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function loadLinked() {
    if (!projectId) return;
    setLinked(await api.get<ProjectFile[]>(`/projects/${projectId}/files?task_id=${taskId}`).catch(() => []));
  }

  async function loadProjectFiles() {
    if (!projectId) return;
    setProjectFiles(await api.get<ProjectFile[]>(`/projects/${projectId}/files`).catch(() => []));
  }

  useEffect(() => {
    loadLinked();
    loadProjectFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, projectId]);

  async function linkExisting() {
    if (!pickId) return;
    try {
      await api.post(`/files/${pickId}/tasks/${taskId}`);
      setPickId('');
      loadLinked();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to attach file', true);
    }
  }

  async function unlink(fileId: string) {
    try {
      await api.delete(`/files/${fileId}/tasks/${taskId}`);
      loadLinked();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to remove file', true);
    }
  }

  async function handleUpload(fileList: FileList | null) {
    if (!fileList || !fileList.length || !projectId) return;
    setUploading(true);
    try {
      for (const file of Array.from(fileList)) {
        await uploadProjectFile(projectId, file, [taskId]);
      }
      loadLinked();
      loadProjectFiles();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed', true);
    } finally {
      setUploading(false);
    }
  }

  if (!projectId) {
    return (
      <div className="fg" style={{ marginTop: 18 }}>
        <label className="fl">Files</label>
        <div style={{ fontSize: 12, color: 'var(--t2)' }}>Assign this task to a project to attach files.</div>
      </div>
    );
  }

  const linkable = projectFiles.filter((f) => !linked.some((l) => l.id === f.id));

  return (
    <div className="fg" style={{ marginTop: 18 }}>
      <label className="fl">Files {linked.length > 0 && `(${linked.length})`}</label>
      {linked.map((f) => (
        <div key={f.id} className="file-link-row">
          <FileIcon type={f.file_type} />
          <span style={{ flex: 1, fontSize: 13, cursor: 'pointer' }} onClick={() => setPreview(f)}>
            {f.file_name}
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => unlink(f.id)}>
            <IconTrash size={13} />
          </button>
        </div>
      ))}
      {linked.length === 0 && <div style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 6 }}>No files attached yet.</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <select className="fi" value={pickId} onChange={(e) => setPickId(e.target.value)}>
          <option value="">Attach existing file…</option>
          {linkable.map((f) => (
            <option key={f.id} value={f.id}>
              {f.file_name}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-sm" onClick={linkExisting} disabled={!pickId}>
          Attach
        </button>
      </div>
      <div style={{ marginTop: 8 }}>
        <button type="button" className="btn btn-sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
          <IconUpload size={13} /> {uploading ? 'Uploading…' : 'Upload new file'}
        </button>
        <input ref={inputRef} type="file" multiple style={{ display: 'none' }} onChange={(e) => handleUpload(e.target.files)} />
      </div>

      {preview && <FilePreviewModal file={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
