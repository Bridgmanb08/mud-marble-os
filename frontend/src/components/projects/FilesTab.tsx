import { useEffect, useRef, useState, type DragEvent } from 'react';
import { IconFile, IconFileTypePdf, IconPaperclip, IconPhoto, IconTrash, IconUpload, IconVideo } from '@tabler/icons-react';
import { api } from '../../api/client';
import { useToast } from '../ui/Toast';
import { fmtBytes, uploadProjectFile } from '../../lib/fileUpload';
import { FilePreviewModal } from './FilePreviewModal';
import type { ProjectFile, Task } from '../../types';

const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'photo', label: 'Photos' },
  { key: 'video', label: 'Videos' },
  { key: 'plan', label: 'Plans' },
  { key: 'other', label: 'Other' },
];

function FileIcon({ type }: { type: string }) {
  if (type === 'photo') return <IconPhoto size={28} />;
  if (type === 'video') return <IconVideo size={28} />;
  if (type === 'plan') return <IconFileTypePdf size={28} />;
  return <IconFile size={28} />;
}

interface FilesTabProps {
  projectId: string;
  tasks: Task[];
}

export function FilesTab({ projectId, tasks }: FilesTabProps) {
  const toast = useToast();
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [filter, setFilter] = useState('all');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<ProjectFile | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const tasksById = new Map(tasks.map((t) => [t.id, t]));

  async function load() {
    try {
      setFiles(await api.get<ProjectFile[]>(`/projects/${projectId}/files`));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load files', true);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || !fileList.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(fileList)) {
        await uploadProjectFile(projectId, file);
      }
      toast(fileList.length > 1 ? 'Files uploaded' : 'File uploaded');
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed', true);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(f: ProjectFile, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Delete "${f.file_name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/files/${f.id}`);
      toast('File deleted');
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to delete file', true);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  const shown = filter === 'all' ? files : files.filter((f) => f.file_type === filter);

  return (
    <>
      <div className="sh">
        <div className="st">{files.length} file{files.length === 1 ? '' : 's'}</div>
        <div className="filters">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" className={`fb${filter === f.key ? ' on' : ''}`} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className={`file-drop${dragOver ? ' over' : ''}`}
        style={{ marginBottom: 16 }}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <IconUpload size={18} style={{ marginBottom: 4 }} />
        <div>{uploading ? 'Uploading…' : 'Click to upload or drag photos, videos, and plans here'}</div>
        <input
          ref={inputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {shown.length === 0 ? (
        <div className="empty-s">No files yet.</div>
      ) : (
        <div className="file-grid">
          {shown.map((f) => (
            <div key={f.id} className="file-card" onClick={() => setPreview(f)}>
              <div className="file-thumb">
                {f.file_type === 'photo' ? (
                  <FilePhotoThumb fileId={f.id} name={f.file_name} />
                ) : (
                  <FileIcon type={f.file_type} />
                )}
              </div>
              <div className="file-info">
                <div className="file-name">{f.file_name}</div>
                <div className="file-meta">
                  {fmtBytes(f.size_bytes)}
                  {f.task_ids.length > 0 && (
                    <span title={f.task_ids.map((id) => tasksById.get(id)?.title).filter(Boolean).join(', ')}>
                      <IconPaperclip size={11} /> {f.task_ids.length}
                    </span>
                  )}
                  <span style={{ marginLeft: 'auto', cursor: 'pointer' }} onClick={(e) => handleDelete(f, e)}>
                    <IconTrash size={12} />
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {preview && <FilePreviewModal file={preview} onClose={() => setPreview(null)} />}
    </>
  );
}

function FilePhotoThumb({ fileId, name }: { fileId: string; name: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    api
      .get<{ download_url: string }>(`/files/${fileId}/download`)
      .then((r) => setUrl(r.download_url))
      .catch(() => {});
  }, [fileId]);
  if (!url) return <IconPhoto size={28} />;
  return <img src={url} alt={name} loading="lazy" />;
}
