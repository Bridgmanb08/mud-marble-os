import { useEffect, useRef, useState } from 'react';
import { IconFile, IconFileTypePdf, IconPhoto, IconTrash, IconUpload } from '@tabler/icons-react';
import { api } from '../../api/client';
import { useToast } from '../ui/Toast';
import { uploadSubcontractorFile, fmtBytes } from '../../lib/fileUpload';
import type { DownloadUrlResponse, SubcontractorFile } from '../../types';

function FileIcon({ type }: { type: string }) {
  if (type === 'photo') return <IconPhoto size={16} />;
  if (type === 'plan') return <IconFileTypePdf size={16} />;
  return <IconFile size={16} />;
}

interface SubcontractorFilesSectionProps {
  subcontractorId: string;
}

export function SubcontractorFilesSection({ subcontractorId }: SubcontractorFilesSectionProps) {
  const toast = useToast();
  const [files, setFiles] = useState<SubcontractorFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setFiles(await api.get<SubcontractorFile[]>(`/subcontractors/${subcontractorId}/files`).catch(() => []));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subcontractorId]);

  async function handleUpload(fileList: FileList | null) {
    if (!fileList || !fileList.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(fileList)) {
        await uploadSubcontractorFile(subcontractorId, file);
      }
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed', true);
    } finally {
      setUploading(false);
    }
  }

  async function openFile(f: SubcontractorFile) {
    try {
      const { download_url } = await api.get<DownloadUrlResponse>(`/subcontractor-files/${f.id}/download`);
      window.open(download_url, '_blank', 'noopener');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to open file', true);
    }
  }

  async function remove(f: SubcontractorFile) {
    try {
      await api.delete(`/subcontractor-files/${f.id}`);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to remove file', true);
    }
  }

  return (
    <div className="fg" style={{ marginTop: 18 }}>
      <label className="fl">Files {files.length > 0 && `(${files.length})`}</label>
      {files.map((f) => (
        <div key={f.id} className="file-link-row">
          <FileIcon type={f.file_type} />
          <span style={{ flex: 1, fontSize: 13, cursor: 'pointer' }} onClick={() => openFile(f)}>
            {f.file_name}
          </span>
          <span style={{ fontSize: 11, color: 'var(--t2)' }}>{fmtBytes(f.size_bytes)}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(f)}>
            <IconTrash size={13} />
          </button>
        </div>
      ))}
      {files.length === 0 && <div style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 6 }}>No files attached yet.</div>}
      <div style={{ marginTop: 8 }}>
        <button type="button" className="btn btn-sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
          <IconUpload size={13} /> {uploading ? 'Uploading…' : 'Upload W9, insurance, or other file'}
        </button>
        <input ref={inputRef} type="file" multiple style={{ display: 'none' }} onChange={(e) => handleUpload(e.target.files)} />
      </div>
    </div>
  );
}
