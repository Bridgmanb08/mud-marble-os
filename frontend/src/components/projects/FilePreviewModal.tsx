import { useEffect, useState } from 'react';
import { IconDownload, IconX } from '@tabler/icons-react';
import { api } from '../../api/client';
import type { DownloadUrlResponse, ProjectFile } from '../../types';

interface FilePreviewModalProps {
  file: ProjectFile;
  onClose: () => void;
}

export function FilePreviewModal({ file, onClose }: FilePreviewModalProps) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    api
      .get<DownloadUrlResponse>(`/files/${file.id}/download`)
      .then((r) => setUrl(r.download_url))
      .catch(() => {});
  }, [file.id]);

  return (
    <div className="lightbox" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lightbox-body">
        <div className="lightbox-hd">
          <div style={{ fontSize: 13, fontWeight: 500 }}>{file.file_name}</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {url && (
              <a className="btn btn-sm" href={url} download={file.file_name} target="_blank" rel="noreferrer">
                <IconDownload size={14} /> Download
              </a>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
              <IconX size={16} />
            </button>
          </div>
        </div>
        <div className="lightbox-media">
          {!url && <span style={{ fontSize: 12, color: 'var(--t2)' }}>Loading preview…</span>}
          {url && file.file_type === 'photo' && <img src={url} alt={file.file_name} />}
          {url && file.file_type === 'video' && <video src={url} controls autoPlay />}
          {url && file.file_type === 'plan' && <iframe src={url} title={file.file_name} />}
          {url && file.file_type === 'other' && (
            <span style={{ fontSize: 12, color: 'var(--t2)' }}>No inline preview available for this file type — use Download.</span>
          )}
        </div>
      </div>
    </div>
  );
}
